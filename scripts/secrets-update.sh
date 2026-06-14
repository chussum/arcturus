#!/usr/bin/env bash
# Re-encrypts values added or edited by hand in .env.secrets.
#   1) .env.secrets 에 KEY=평문 을 추가/수정
#   2) bun run secrets:update
#   3) bun run server:restart
# Encryption only needs the public key inside the file, so this works without
# touching the keychain; decryption verification runs when the key is reachable.
set -euo pipefail
cd "$(dirname "$0")/.."

KEYCHAIN_SERVICE="arcturus-dotenvx"
SECRETS_FILE=".env.secrets"

ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$1"; }

if [ ! -f "$SECRETS_FILE" ]; then
  warn "$SECRETS_FILE 이 없습니다 — 먼저 실행하세요:  bun run secrets:init"
  exit 1
fi

bunx dotenvx encrypt -f "$SECRETS_FILE" >/dev/null
chmod 600 "$SECRETS_FILE"
ok "평문 값 암호화 완료 (이미 암호화된 값은 그대로)"

# Verify every value still decrypts — catches a hand-edit that broke the file.
PK="${DOTENV_PRIVATE_KEY_SECRETS:-}"
if [ -z "$PK" ] && [ "$(uname)" = "Darwin" ]; then
  PK="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
fi
if [ -n "$PK" ]; then
  ALL="$(DOTENV_PRIVATE_KEY_SECRETS="$PK" bunx dotenvx get -f "$SECRETS_FILE" 2>/dev/null || true)"
  if [ -z "$ALL" ] || printf '%s' "$ALL" | grep -q '"encrypted:'; then
    warn "일부 값이 Keychain 키로 복호화되지 않습니다 — $SECRETS_FILE 편집 내용을 확인하세요."
    exit 1
  fi
  ok "전체 키 복호화 검증 통과"
else
  warn "복호화 키를 찾지 못해 검증은 건너뜁니다 (암호화 자체는 완료)."
fi

echo "  변경 반영:  bun run server:restart"
