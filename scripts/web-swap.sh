#!/usr/bin/env bash
# Blue-green dashboard swap — zero gateway downtime during Next.js redeploys.
# Called by server-up.sh; can also be run directly.
#
# Protocol:
#   1. Determine which colour (a/b) is currently active in pm2.
#   2. Build Next.js into the idle colour's distDir (.next-<idle>) unless it
#      already exists and --force is not set.
#   3. Find a collision-free port via bind-probe (41000–60000) — same approach
#      as port-probe.service.ts so other accounts' processes on a shared machine
#      are detected.
#   4. Start a new pm2 process using a temporary ecosystem JSON that embeds the
#      per-instance env (ARCTURUS_WEB_PORT, ARCTURUS_DIST_DIR) so pm2 uses the
#      correct values on autorestart.
#   5. Health-check the new instance (up to 40 s). On failure: delete new
#      instance + distDir, exit 1 — old version keeps serving (safe rollback).
#   6. Atomically write data/dashboard-upstream via tmp+mv — gateway picks up
#      the new origin on the next request (~1 s).
#   7. Wait 15 s for in-flight/tab drain, then retire old instance + distDir.
#
# Flags:
#   --force   always rebuild even if the idle distDir already exists
#
# Exit codes:
#   0  swap succeeded
#   1  build failed or health-check timed out (old version still serving)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ── helpers ───────────────────────────────────────────────────────────────────
say()  { printf '\033[1;33m→ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$1"; }
die()  { warn "$1"; exit 1; }

FORCE_BUILD=false
for arg in "$@"; do [ "$arg" = "--force" ] && FORCE_BUILD=true; done

# ARCTURUS_DATA_DIR is resolved by the API from its cwd (apps/api/).
# Scripts run from the project root, so the default must include that prefix.
# Absolute paths (the typical production value) work from either location.
DATA_DIR="${ARCTURUS_DATA_DIR:-$ROOT/apps/api/data}"
STATE_FILE="$DATA_DIR/dashboard-upstream"

# ── 1. active / idle colour ───────────────────────────────────────────────────
# pm2 7.x colourises `describe` even when piped, so the status reads as
# "\x1b[1monline\x1b[22m" — i.e. "online" glued into "1monline", which breaks
# `grep -w online`. Strip ANSI first. (This bug made the swap always pick
# idle='a' and rebuild the live distDir in place → static-file 500s mid-swap.)
pm2_online() { bunx pm2 describe "$1" 2>/dev/null | sed $'s/\x1b\\[[0-9;]*m//g' | grep -qw 'online'; }

ACTIVE_COLOR=""
for color in a b; do
  if pm2_online "arcturus-web-$color"; then
    ACTIVE_COLOR="$color"
    break
  fi
done

[ "$ACTIVE_COLOR" = "a" ] && IDLE_COLOR="b" || IDLE_COLOR="a"
say "색 전환: ${ACTIVE_COLOR:-없음} → $IDLE_COLOR"

# ── 2. build ──────────────────────────────────────────────────────────────────
DIST_DIR="apps/web/.next-$IDLE_COLOR"
if [ "$FORCE_BUILD" = false ] && [ -d "$DIST_DIR" ]; then
  ok "기존 빌드 재사용: $DIST_DIR (강제 재빌드: web-swap.sh --force)"
else
  say "대시보드 빌드 중 ($DIST_DIR) — 수 분 걸릴 수 있어요..."
  # Remove stale artefacts from a previous (possibly partial) build in this slot.
  rm -rf "$DIST_DIR"
  (cd apps/web && ARCTURUS_DIST_DIR=".next-$IDLE_COLOR" bun run build >/dev/null)
  ok "빌드 완료"
fi
# NOTE: Do NOT merge static/ across colours. Copying .next artefacts between builds
# corrupts the client-reference-manifest ↔ chunk mapping and makes SSR 500 with
# "Expected clientReferenceManifest to be defined" (next treats .next as opaque).
# An open tab on the old build may need a refresh after a deploy — that's expected.

# ── 3. find a collision-free port ─────────────────────────────────────────────
# Bind-probe with 0.0.0.0 + exclusive:true catches ports held by other OS accounts
# on the same machine — same logic as apps/api/src/modules/deployments/port-probe.service.ts.
say "빈 포트 탐색 중 (41000–60000)..."
PORT=$(bun -e '
const net = require("net");
const base = 41000 + (Math.random() * 19000 | 0);
const probe = (p, cb) => {
  if (p > 60000) { process.stderr.write("no free port\n"); process.exit(1); }
  const s = net.createServer();
  s.unref();
  s.once("error", () => probe(p + 1, cb));
  s.listen({ host: "0.0.0.0", port: p, exclusive: true }, () => s.close(() => cb(p)));
};
probe(base, (p) => process.stdout.write(String(p)));
')
[ -z "$PORT" ] && die "사용 가능한 포트를 찾지 못했습니다 (41000–60000)"
ok "포트 $PORT 할당됨"

# ── 4. start new web instance ─────────────────────────────────────────────────
say "arcturus-web-$IDLE_COLOR 기동 중 (포트 $PORT)..."
# Clean up any leftover idle process first.
bunx pm2 delete "arcturus-web-$IDLE_COLOR" >/dev/null 2>&1 || true

mkdir -p logs

# Write a temporary ecosystem JSON so pm2 records the per-instance env.
# Env vars set only in the parent shell are NOT persisted by pm2 for autorestart.
TMPCONF=$(mktemp /tmp/arcturus-web-XXXXXX.json)
cat > "$TMPCONF" << CONF
[{
  "name": "arcturus-web-$IDLE_COLOR",
  "cwd": "$ROOT/apps/web",
  "script": "bun",
  "args": "run start",
  "interpreter": "none",
  "autorestart": true,
  "kill_timeout": 15000,
  "treekill": true,
  "time": true,
  "out_file": "$ROOT/logs/web-$IDLE_COLOR.out.log",
  "error_file": "$ROOT/logs/web-$IDLE_COLOR.err.log",
  "env": {
    "ARCTURUS_WEB_PORT": "$PORT",
    "ARCTURUS_DIST_DIR": ".next-$IDLE_COLOR"
  }
}]
CONF
bunx pm2 start "$TMPCONF" >/dev/null
rm -f "$TMPCONF"
ok "프로세스 기동됨"

# ── 5. health check ───────────────────────────────────────────────────────────
say "헬스체크 대기 중 (최대 40초)..."
DEADLINE=$((SECONDS + 40))
HEALTHY=false
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/dashboard" 2>/dev/null; then
    HEALTHY=true
    break
  fi
  sleep 1
done

if [ "$HEALTHY" = false ]; then
  warn "헬스체크 실패 — 새 인스턴스를 정리하고 기존 버전을 유지합니다"
  bunx pm2 delete "arcturus-web-$IDLE_COLOR" >/dev/null 2>&1 || true
  rm -rf "$DIST_DIR"
  exit 1
fi
ok "헬스체크 통과"

# ── 6. atomic flip ────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
TMPSTATE="$STATE_FILE.tmp$$"
printf 'http://127.0.0.1:%s' "$PORT" > "$TMPSTATE"
mv "$TMPSTATE" "$STATE_FILE"
ok "게이트웨이 전환 완료 → http://127.0.0.1:$PORT"

# ── 7. drain old instance ─────────────────────────────────────────────────────
if [ -n "$ACTIVE_COLOR" ]; then
  say "구 인스턴스 드레인 중 (15초)..."
  # Capture the OS pid BEFORE delete so we can wait for it to actually exit.
  OLD_PID=$(bunx pm2 pid "arcturus-web-$ACTIVE_COLOR" 2>/dev/null | tr -d '[:space:]')
  sleep 15
  bunx pm2 delete "arcturus-web-$ACTIVE_COLOR" >/dev/null 2>&1 || true

  # pm2 delete does NOT block until the process exits — with kill_timeout 15s the
  # old next start can still be serving in-flight requests from its distDir. If we
  # rm -rf that dir now, those reads fail with 500. Wait for the pid to be gone
  # (up to ~20s) before removing the directory.
  if [ -n "$OLD_PID" ] && [ "$OLD_PID" != "0" ]; then
    for _ in $(seq 1 40); do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.5
    done
  fi
  rm -rf "apps/web/.next-$ACTIVE_COLOR"
  ok "arcturus-web-$ACTIVE_COLOR 정리 완료"
fi

ok "블루-그린 전환 완료"
