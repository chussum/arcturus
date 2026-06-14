#!/usr/bin/env bash
# Arcturus one-command production start. Safe to run repeatedly.
#
#   bun run server:up               # install → start (skips what's already running)
#   bun run server:up -- --build    # zero-downtime redeploy of BOTH tiers (dashboard
#                                   # blue-green rebuild + API blue-green swap)
#   bun run server:up -- --api      # zero-downtime API swap only (blue-green, no :7777 gap)
#   bun run server:up -- --ingress  # restart the ingress front-proxy
#                                   # (brief :7777/:7778 gap; only when ingress.ts itself
#                                   # changes — exceedingly rare)
#
# Architecture:
#   arcturus-ingress   — permanent pm2 process, binds public :7777/:7778, reads
#                        data/api-upstream and forwards to the active API colour.
#   arcturus-api-a/b   — blue-green API colours (scripts/api-swap.sh). Zero-downtime
#                        on --api: new colour boots, ingress flips, old colour drains.
#   arcturus-web-a/b   — blue-green web colours (scripts/web-swap.sh). Same pattern.
#
# Ports are allocated dynamically (bind-probe) to avoid conflicts on shared machines
# where multiple OS accounts each run their own Arcturus instance.
set -euo pipefail
cd "$(dirname "$0")/.."

FORCE_BUILD=false
RESTART_API=false
RESTART_INGRESS=false
for arg in "$@"; do
  [ "$arg" = "--build" ]   && FORCE_BUILD=true
  [ "$arg" = "--api" ]     && RESTART_API=true
  [ "$arg" = "--ingress" ] && RESTART_INGRESS=true
done

say()  { printf '\033[1;33m→ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$1"; }

# How to provide the production secrets without the bundled .env.secrets flow.
# Printed for the "안내만 보기" menu choice and whenever there's no TTY to prompt.
print_secrets_guide() {
  echo "프로덕션은 다음 시크릿이 API 프로세스 환경에 매 (재)기동마다 있어야 합니다 /"
  echo "Production needs these in the API process environment on every (re)start:"
  echo "    ARCTURUS_ENV_KEY       (앱 env 암호화 키 / app-env encryption key)"
  echo "    ARCTURUS_JWT_SECRET    (세션 서명 키 / session signing secret)"
  echo "    ARCTURUS_ADMIN_PASSWORD(최초 1회 admin 시드용 / first-run admin seed only)"
  echo ""
  echo "  · 권장(이 pm2 번들 플로우) / Recommended: bun run secrets:init"
  echo "      → .env.secrets에 암호화 저장하고 키는 Keychain에 보관, 매 기동 시 자동 주입."
  echo "  · 외부/관리형 배포 / External or managed deploy:"
  echo "      자체 프로세스 매니저·시크릿 매니저에 위 환경 변수를 주입하세요."
  echo "      (주의: 부모 셸 export 만으로는 pm2 autorestart에 남지 않습니다 /"
  echo "       a parent-shell export alone does NOT survive pm2 autorestart.)"
  echo "  · 값 생성 예 / Generate a value:  openssl rand -hex 32"
}

# pm2 7.x colourises `describe` even when piped ("\x1b[1monline\x1b[22m"), gluing
# "online" into "1monline" so `grep -w online` never matches. Strip ANSI first —
# otherwise blue-green never alternates colours and rebuilds the live one in place.
pm2_online() { bunx pm2 describe "$1" 2>/dev/null | sed $'s/\x1b\\[[0-9;]*m//g' | grep -qw 'online'; }

DB_DIR="${ARCTURUS_DATA_DIR:-apps/api/data}"

# First-run admin seed is needed when there's no DB yet, OR the DB exists but a
# prior boot created the schema and then crashed before seeding the admin (zero
# user rows). Boot migrations create arcturus.db before the seeder runs, so a
# failed first boot leaves an empty DB — keying only off file-absence misses that
# case and the admin-password prompt is skipped forever → permanent crash loop.
needs_admin_seed() {
  local db="$DB_DIR/arcturus.db"
  [ ! -f "$db" ] && return 0
  command -v sqlite3 >/dev/null 2>&1 || return 1   # can't tell → assume seeded
  local n
  # -readonly + .timeout: safe to read even while a crash-looping old API writes
  # the WAL (SQLite allows concurrent readers). .timeout is a dot-command (no
  # output) — a `PRAGMA busy_timeout=` would print its value and corrupt $n. On
  # any read error we fall back to "seeded" so a healthy install never re-prompts.
  n=$(sqlite3 -readonly -cmd ".timeout 2000" "$db" "SELECT count(*) FROM users" 2>/dev/null || echo "")
  [ "$n" = "0" ] && return 0
  return 1
}

# 1. Prerequisites ------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  warn "Bun이 설치되어 있지 않습니다. 먼저 설치해 주세요:"
  echo "    curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  warn "Docker가 실행 중이 아닙니다 — 정적 사이트 배포는 동작하지만, Dockerfile 앱 배포는 Docker가 필요합니다."
fi

# 2. Dependencies -------------------------------------------------------------
say "의존성 설치 중 (bun install)..."
bun install --silent
ok "의존성 준비 완료"

# 3. Optional CLI binaries ----------------------------------------------------
if [ ! -d apps/cli/dist/cli ]; then
  echo "  (선택) curl 설치용 CLI 바이너리가 없습니다 — 필요하면: bun run cli:build"
fi

# 4. Free the ports from stray (non-pm2) processes ----------------------------
# The ingress holds :7777/:7778 as pm2 processes; is_pm2_descendant protects them.
# This step only kills truly external listeners left by e.g. a crashed dev server.
PORT="${ARCTURUS_PORT:-7777}"
APPS_PORT="${ARCTURUS_APPS_PORT:-7778}"
PM2_DAEMON=$(pgrep -f 'PM2 v' 2>/dev/null | head -1 || true)

is_pm2_descendant() {
  local pid=$1 i=0
  [ -z "$PM2_DAEMON" ] && return 1
  while [ -n "$pid" ] && [ "$pid" != "1" ] && [ "$i" -lt 6 ]; do
    [ "$pid" = "$PM2_DAEMON" ] && return 0
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    i=$((i + 1))
  done
  return 1
}

for port in "$PORT" "$APPS_PORT"; do
  for pid in $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true); do
    if ! is_pm2_descendant "$pid"; then
      warn "포트 $port 를 점유한 외부 프로세스(pid $pid)를 정리합니다"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
done

mkdir -p logs
chmod 700 logs

# 4.4 First-run secrets -------------------------------------------------------
# Production is fail-closed: the API throws on boot without ARCTURUS_ENV_KEY /
# ARCTURUS_JWT_SECRET (env-crypto.service.ts / session.service.ts). They're
# normally injected from the dotenvx-encrypted .env.secrets by with-secrets.sh.
# If that file is missing and the keys aren't already in the environment, guide
# the operator here instead of letting the API die with a cryptic pm2-log error.
# Skipped once .env.secrets exists or the keys are exported.
if [ "${NODE_ENV:-}" = "production" ] \
   && [ ! -f .env.secrets ] \
   && [ -z "${ARCTURUS_ENV_KEY:-}" ] \
   && [ -z "${ARCTURUS_JWT_SECRET:-}" ]; then
  if [ -t 0 ]; then
    say "암호화 시크릿(.env.secrets)이 없습니다 — 설정 방법을 선택하세요 / No encrypted secrets yet — choose a setup method:"
    echo "  1) 자동 생성 / Auto-generate — 키를 새로 만들어 .env.secrets에 암호화 저장 (권장 / recommended)"
    echo "  2) 직접 입력 / Enter values — ARCTURUS_ENV_KEY · ARCTURUS_JWT_SECRET 값을 붙여넣어 저장"
    echo "  3) 안내만 보기 / Just show the guide — 환경 변수로 직접 주입하는 방법 안내 후 종료"
    read -rp "선택 / Choose [1/2/3] (기본 / default 1): " SECRETS_CHOICE
    case "${SECRETS_CHOICE:-1}" in
      2)
        say "시크릿 직접 입력 (secrets:init --input)..."
        bash scripts/secrets-init.sh --input
        ;;
      3)
        echo ""
        print_secrets_guide
        echo ""
        ok "안내 출력 완료 — 설정 후 다시 'bun run server:up' 을 실행하세요 / Set them up, then run 'bun run server:up' again."
        exit 0
        ;;
      *)
        say "시크릿 자동 생성 (secrets:init)..."
        bash scripts/secrets-init.sh
        ;;
    esac
  else
    warn "암호화 시크릿(.env.secrets)이 없고 대화형 터미널이 아닙니다 / No encrypted secrets and no interactive terminal."
    echo ""
    print_secrets_guide
    exit 1
  fi
fi

# 4.5 First-run admin password ------------------------------------------------
# On the very first boot there's no admin account yet. pm2 has no TTY, so the
# seeder can't prompt there — instead we ask here, in the shell, and hand the
# value to the API via api-swap.sh's env block. Skipped once an admin is seeded
# (DB has user rows), when the password is already provided, or when stdin isn't
# a terminal (CI). needs_admin_seed also covers an empty DB left by a crashed
# first boot, so we don't skip-and-crash-loop forever.
if needs_admin_seed \
   && [ -t 0 ] \
   && [ -z "${ARCTURUS_ADMIN_PASSWORD:-}" ] \
   && ! grep -qE '^[[:space:]]*ARCTURUS_ADMIN_PASSWORD=' apps/api/.env 2>/dev/null; then
  say "관리자 계정이 없습니다 — 어드민 비밀번호를 설정하세요 / No admin account yet — set the admin password."
  while true; do
    read -rsp "어드민 비밀번호를 설정하세요 / Set the admin password: " ADMIN_PW; echo
    if [ "${#ADMIN_PW}" -lt 8 ]; then
      warn "비밀번호는 8자 이상이어야 합니다 / Password must be at least 8 characters."
      continue
    fi
    read -rsp "비밀번호 확인 / Confirm password: " ADMIN_PW2; echo
    if [ "$ADMIN_PW" != "$ADMIN_PW2" ]; then
      warn "비밀번호가 일치하지 않습니다 / Passwords do not match."
      continue
    fi
    export ARCTURUS_ADMIN_PASSWORD="$ADMIN_PW"
    unset ADMIN_PW ADMIN_PW2
    ADMIN_PW_PROMPTED=true
    break
  done
fi

# 5. API (blue-green, managed by api-swap.sh) ---------------------------------
say "pm2로 서버 기동 중..."

# Migrate: detect legacy single-instance arcturus-api (from before the ingress
# architecture). We do NOT delete it yet — it still holds :7777/:7778 directly,
# so deleting it first would open a gap during the api-swap health-check.
# After api-swap succeeds and data/api-upstream is written, we delete it and
# immediately start the ingress (~1 s handoff, one-time only).
LEGACY_API=false
if bunx pm2 describe arcturus-api >/dev/null 2>&1; then
  say "이전 단일 arcturus-api 감지 — api-swap 완료 후 ingress로 전환 예정 (1회성 ~1초 핸드오프)"
  LEGACY_API=true
fi

API_RUNNING=false
for color in a b; do
  if pm2_online "arcturus-api-$color"; then
    API_RUNNING=true
    break
  fi
done

if [ "$API_RUNNING" = false ]; then
  say "API 최초 기동 중 (api-swap)..."
  bash scripts/api-swap.sh
  ok "API 기동됨"
elif [ "$RESTART_API" = true ] || [ "$FORCE_BUILD" = true ]; then
  # --build also swaps the API so a full redeploy refreshes both tiers.
  say "API 블루-그린 교체 중 (:7777/:7778 무중단)..."
  bash scripts/api-swap.sh
  ok "API 교체됨"
else
  ok "API 실행 중 — 재시작 생략 (무중단 재시작: bun run server:up -- --api)"
fi

# 6. Ingress (binds public :7777/:7778, reads data/api-upstream) --------------
# ecosystem.config.cjs defines only arcturus-ingress. API/web colours are managed
# by their respective swap scripts and are NOT in the ecosystem file.
#
# api-swap.sh above has already written data/api-upstream before we reach here,
# so the ingress can start and immediately resolve the correct upstream.
#
# Migration: if the legacy arcturus-api process was detected above (LEGACY_API=true),
# delete it now — immediately before starting the ingress — to minimise the gap.
# Legacy held :7777/:7778 directly; ingress takes over in ~1 s (one-time only).
if [ "$LEGACY_API" = true ]; then
  say "레거시 arcturus-api 중지 → ingress 기동 (~1초 핸드오프, 1회성)..."
  bunx pm2 delete arcturus-api >/dev/null 2>&1 || true
fi

if [ "$RESTART_INGRESS" = true ]; then
  say "ingress 재시작 중 (--ingress) — :$PORT/:$APPS_PORT 잠시 끊깁니다..."
  bunx pm2 delete arcturus-ingress >/dev/null 2>&1 || true
  bunx pm2 start ecosystem.config.cjs >/dev/null
  ok "ingress 재시작됨"
elif ! pm2_online "arcturus-ingress"; then
  bunx pm2 start ecosystem.config.cjs >/dev/null
  ok "ingress 기동됨"
else
  ok "ingress 실행 중"
fi

# 7. Dashboard (blue-green) ───────────────────────────────────────────────────
WEB_RUNNING=false
for color in a b; do
  if pm2_online "arcturus-web-$color"; then
    WEB_RUNNING=true
    break
  fi
done

if [ "$FORCE_BUILD" = true ]; then
  say "대시보드 블루-그린 재배포 중 (--build)..."
  bash scripts/web-swap.sh --force
  # Migrate: clean up legacy single-instance arcturus-web (no colour suffix) if
  # it was left over from before the blue-green web architecture. The new colour
  # is already serving (flip complete), so deleting the old one is gap-free.
  if bunx pm2 describe arcturus-web >/dev/null 2>&1; then
    say "레거시 arcturus-web 정리 중..."
    bunx pm2 delete arcturus-web >/dev/null 2>&1 || true
    ok "레거시 arcturus-web 제거됨"
  fi
elif [ "$WEB_RUNNING" = false ]; then
  say "대시보드 기동 중..."
  bash scripts/web-swap.sh
  # Same legacy cleanup on first boot after migration.
  if bunx pm2 describe arcturus-web >/dev/null 2>&1; then
    say "레거시 arcturus-web 정리 중..."
    bunx pm2 delete arcturus-web >/dev/null 2>&1 || true
    ok "레거시 arcturus-web 제거됨"
  fi
elif [ "$RESTART_API" = true ]; then
  # --api also does an in-place web restart to keep all services fresh
  # without triggering a full blue-green web swap.
  for color in a b; do
    if pm2_online "arcturus-web-$color"; then
      say "대시보드 재시작 중 (arcturus-web-$color)..."
      bunx pm2 restart "arcturus-web-$color" >/dev/null
      ok "대시보드 재시작됨"
    fi
  done
else
  ok "대시보드 실행 중 — 재배포 생략 (재배포: bun run server:up -- --build)"
fi

bunx pm2 status

# 8. Friendly summary ---------------------------------------------------------
IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
echo ""
ok "접속 주소:  http://127.0.0.1:${PORT}  (팀원은 http://${IP}:${PORT})"
if [ "${ADMIN_PW_PROMPTED:-false}" = true ]; then
  echo "  · admin 계정 비밀번호는 방금 설정한 값입니다 / The admin password is the one you just set."
fi
echo "  · 서버 내리기:  bun run server:down    상태 보기:  bun run server:status"
