#!/usr/bin/env bash
# Runs a command with secrets injected from the dotenvx-encrypted .env.secrets.
# Used by pm2 (ecosystem.config.cjs) and apps/api dev/start, so every (re)start
# fetches the private key fresh from the macOS Keychain — nothing is baked into
# pm2's dump and no plaintext secret sits on disk.
#   scripts/with-secrets.sh bun src/main.ts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_FILE="$ROOT/.env.secrets"
KEYCHAIN_SERVICE="arcturus-dotenvx"

# Zero-config path: no secrets file → run unchanged (the API falls back to
# auto-generated key files under data/; harden with `bun run secrets:init`).
if [ ! -f "$SECRETS_FILE" ]; then
  exec "$@"
fi

if [ -z "${DOTENV_PRIVATE_KEY_SECRETS:-}" ] && [ "$(uname)" = "Darwin" ]; then
  DOTENV_PRIVATE_KEY_SECRETS="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
  export DOTENV_PRIVATE_KEY_SECRETS
fi

# dotenvx can also read $ROOT/.env.keys (machines without a keychain keep it, 0600).
if [ -z "${DOTENV_PRIVATE_KEY_SECRETS:-}" ] && [ ! -f "$ROOT/.env.keys" ]; then
  # Booting without the key would silently regenerate data/env-key and leave
  # existing encrypted app env rows undecryptable — die loudly instead.
  echo "✗ $SECRETS_FILE 가 있는데 복호화 키를 찾지 못했습니다." >&2
  echo "  macOS: Keychain 항목 '$KEYCHAIN_SERVICE' 확인 (ssh 세션이라면: security unlock-keychain)" >&2
  echo "  또는 DOTENV_PRIVATE_KEY_SECRETS 환경 변수를 직접 지정하세요." >&2
  exit 1
fi

# Plaintext secrets in apps/api/.env are silently shadowed by the injected
# values (real env wins over Bun's .env loading) — nudge them to one place.
API_ENV="$ROOT/apps/api/.env"
if [ -f "$API_ENV" ] && grep -qE '^(ARCTURUS_JWT_SECRET|ARCTURUS_ENV_KEY)=' "$API_ENV"; then
  echo "! apps/api/.env 의 ARCTURUS_JWT_SECRET/ARCTURUS_ENV_KEY 는 .env.secrets 값에 가려집니다 — 해당 줄을 지우고 .env.secrets 로 관리하세요 (bun run secrets:update)." >&2
fi

exec bunx dotenvx run -f "$SECRETS_FILE" -- "$@"
