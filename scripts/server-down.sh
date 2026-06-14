#!/usr/bin/env bash
# Stops all pm2-managed Arcturus processes. Safe to run when nothing is up.
set -uo pipefail
cd "$(dirname "$0")/.."

DATA_DIR="${ARCTURUS_DATA_DIR:-$(pwd)/apps/api/data}"

# Stop all named processes (ingress + both colour pairs for API and web).
# Also handle legacy single-instance processes from older versions.
for name in arcturus-ingress arcturus-api arcturus-web arcturus-api-a arcturus-api-b arcturus-web-a arcturus-web-b; do
  if bunx pm2 describe "$name" >/dev/null 2>&1; then
    bunx pm2 delete "$name" >/dev/null
    printf '\033[1;32m✓ %s 중지됨\033[0m\n' "$name"
  else
    printf '  %s — 실행 중이 아님\n' "$name"
  fi
done

# Remove upstream state files so processes start cleanly on next boot.
for state_file in api-upstream dashboard-upstream; do
  if [ -f "$DATA_DIR/$state_file" ]; then
    rm -f "$DATA_DIR/$state_file"
    printf '\033[1;32m✓ %s 상태 파일 삭제됨\033[0m\n' "$state_file"
  fi
done

echo "서버가 내려갔습니다. 다시 올리려면:  bun run server:up"
