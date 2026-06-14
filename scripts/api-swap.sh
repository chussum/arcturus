#!/usr/bin/env bash
# Blue-green API swap — zero gateway downtime during API restarts.
# Called by server-up.sh; can also be run directly.
#
# Protocol:
#   1. Determine which colour (a/b) is currently active in pm2.
#   2. Pick two collision-free internal ports via bind-probe (41000–60000);
#      same bind-probe logic as port-probe.service.ts so other OS accounts'
#      processes on a shared machine are detected.
#   3. Start the idle colour under pm2 using a temp ecosystem JSON that embeds
#      the per-instance env (internal ports, trust-proxy) so pm2 uses the
#      correct values on autorestart.
#   4. Health-check on the internal control port (up to 40 s). On failure:
#      delete the new instance, exit 1 — old colour keeps serving (safe rollback).
#   5. Atomically write data/api-upstream via tmp+mv — the ingress picks up
#      the new ports on the next request (~1 s).
#   6. Wait 15 s for in-flight/SSE drain, then retire the old colour.
#
# Exit codes:
#   0  swap succeeded
#   1  health-check timed out or port probe failed (old version still serving)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ── helpers ───────────────────────────────────────────────────────────────────
say()  { printf '\033[1;33m→ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$1"; }
die()  { warn "$1"; exit 1; }

# ARCTURUS_DATA_DIR default mirrors the API's own default (cwd=apps/api → ./data).
DATA_DIR="${ARCTURUS_DATA_DIR:-$ROOT/apps/api/data}"
STATE_FILE="$DATA_DIR/api-upstream"

# Public ports held by the ingress; API uses them only for URL building.
PUB_PORT="${ARCTURUS_PORT:-7777}"
PUB_APPS_PORT="${ARCTURUS_APPS_PORT:-7778}"

# ── 1. active / idle colour ───────────────────────────────────────────────────
# pm2 7.x colourises `describe` even when piped ("\x1b[1monline\x1b[22m"), gluing
# "online" into "1monline" so `grep -w online` never matches. Strip ANSI first —
# otherwise this returns false for a live colour and the swap rebuilds in place.
pm2_online() { bunx pm2 describe "$1" 2>/dev/null | sed $'s/\x1b\\[[0-9;]*m//g' | grep -qw 'online'; }

ACTIVE_COLOR=""
for color in a b; do
  if pm2_online "arcturus-api-$color"; then
    ACTIVE_COLOR="$color"
    break
  fi
done

[ "$ACTIVE_COLOR" = "a" ] && IDLE_COLOR="b" || IDLE_COLOR="a"
say "API 색 전환: ${ACTIVE_COLOR:-없음} → $IDLE_COLOR"

# ── 2. find two collision-free internal ports ─────────────────────────────────
# Probed sequentially (p, p+1) — no TOCTOU between the two since the API boots
# quickly and the old colour still occupies its ports (different values).
say "내부 포트 탐색 중 (41000–60000)..."
read -r CTRL_PORT APPS_INT_PORT < <(bun -e '
const net = require("net");
const base = 41000 + (Math.random() * 19000 | 0);
const probe = (p, found, cb) => {
  if (p > 60000) { process.stderr.write("no free port\n"); process.exit(1); }
  const s = net.createServer(); s.unref();
  s.once("error", () => probe(p + 1, found, cb));
  s.listen({ host: "0.0.0.0", port: p, exclusive: true }, () =>
    s.close(() => { found.push(p); found.length === 2 ? cb(found) : probe(p + 1, found, cb); })
  );
};
probe(base, [], (ports) => process.stdout.write(ports.join(" ") + "\n"));
') || true
# `|| true` guards `read`: under `set -e` a non-zero read (EOF without a final
# newline, or empty output when the probe fails) would otherwise kill the script
# before the friendly check below. The bun probe appends a trailing newline on
# success, so this only trips on genuine failure.
[ -z "${CTRL_PORT:-}" ] || [ -z "${APPS_INT_PORT:-}" ] && die "사용 가능한 내부 포트를 찾지 못했습니다 (41000–60000)"
ok "내부 포트 할당: 제어 $CTRL_PORT, 앱 $APPS_INT_PORT"

# ── 3. start new API instance ─────────────────────────────────────────────────
say "arcturus-api-$IDLE_COLOR 기동 중..."
bunx pm2 delete "arcturus-api-$IDLE_COLOR" >/dev/null 2>&1 || true

mkdir -p logs

# Write a temporary ecosystem JSON so pm2 records the per-instance env.
# Env vars set only in the parent shell are NOT persisted across pm2 autorestart.
# with-secrets.sh re-fetches the macOS Keychain private key on every start.
TMPCONF=$(mktemp /tmp/arcturus-api-XXXXXX.json)
# When the operator (or server-up.sh's first-run prompt) provided an admin
# password, pass it through the env block — parent-shell env alone is NOT
# persisted by pm2 (see note above). Only needed for the very first boot (the
# seeder ignores it once an admin exists). JSON-encode so any character is safe.
ADMIN_PW_ENTRY=""
if [ -n "${ARCTURUS_ADMIN_PASSWORD:-}" ]; then
  ADMIN_PW_JSON=$(bun -e 'process.stdout.write(JSON.stringify(process.env.ARCTURUS_ADMIN_PASSWORD))')
  ADMIN_PW_ENTRY=",
    \"ARCTURUS_ADMIN_PASSWORD\": $ADMIN_PW_JSON"
fi
# DATA_DIR must not contain characters that would break JSON (spaces, quotes, backslashes).
# In practice this is always a simple absolute path set by the operator.
cat > "$TMPCONF" << CONF
[{
  "name": "arcturus-api-$IDLE_COLOR",
  "cwd": "$ROOT/apps/api",
  "script": "$ROOT/scripts/with-secrets.sh",
  "args": "bun src/main.ts",
  "interpreter": "bash",
  "autorestart": true,
  "kill_timeout": 15000,
  "max_memory_restart": "512M",
  "time": true,
  "out_file": "$ROOT/logs/api-$IDLE_COLOR.out.log",
  "error_file": "$ROOT/logs/api-$IDLE_COLOR.err.log",
  "env": {
    "ARCTURUS_PORT": "$PUB_PORT",
    "ARCTURUS_APPS_PORT": "$PUB_APPS_PORT",
    "ARCTURUS_LISTEN_PORT": "$CTRL_PORT",
    "ARCTURUS_LISTEN_APPS_PORT": "$APPS_INT_PORT",
    "ARCTURUS_TRUST_PROXY": "loopback",
    "ARCTURUS_DATA_DIR": "$DATA_DIR"$ADMIN_PW_ENTRY
  }
}]
CONF
bunx pm2 start "$TMPCONF" >/dev/null
rm -f "$TMPCONF"
ok "프로세스 기동됨"

# ── 4. health check ───────────────────────────────────────────────────────────
# The API only begins listening after DI graph wiring + DB boot migrations.
# A successful response (even 302) guarantees the new instance is fully ready.
say "헬스체크 대기 중 (최대 40초)..."
DEADLINE=$((SECONDS + 40))
HEALTHY=false
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if curl -fsS -o /dev/null "http://127.0.0.1:$CTRL_PORT/" 2>/dev/null; then
    HEALTHY=true
    break
  fi
  sleep 1
done

if [ "$HEALTHY" = false ]; then
  warn "헬스체크 실패 — 새 인스턴스를 정리하고 기존 버전을 유지합니다"
  bunx pm2 delete "arcturus-api-$IDLE_COLOR" >/dev/null 2>&1 || true
  exit 1
fi
ok "헬스체크 통과"

# ── 5. atomic flip ────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
TMPSTATE="$STATE_FILE.tmp$$"
printf '{"control":%s,"apps":%s}' "$CTRL_PORT" "$APPS_INT_PORT" > "$TMPSTATE"
mv "$TMPSTATE" "$STATE_FILE"
ok "ingress 전환 완료 → 내부 제어 :$CTRL_PORT / 앱 :$APPS_INT_PORT"

# ── 6. drain old instance ─────────────────────────────────────────────────────
if [ -n "$ACTIVE_COLOR" ]; then
  say "구 인스턴스 드레인 중 (15초) — in-flight 요청/SSE 스트림 완료 대기..."
  sleep 15
  bunx pm2 delete "arcturus-api-$ACTIVE_COLOR" >/dev/null 2>&1 || true
  ok "arcturus-api-$ACTIVE_COLOR 정리 완료"
fi

ok "API 블루-그린 전환 완료 (공개 :$PUB_PORT / :$PUB_APPS_PORT 무중단 유지됨)"
