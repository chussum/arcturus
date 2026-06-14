/**
 * The shell installer served at /install.sh. Kept as a template string so the
 * server URL the user fetched it from gets baked in.
 */
export function renderInstallScript(serverUrl: string): string {
  return `#!/bin/sh
# Arcturus CLI installer — served by ${serverUrl}
set -eu

SERVER_URL="${serverUrl}"
INSTALL_DIR="\${ARCTURUS_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

BINARY="arcturus-$OS-$ARCH"
echo "→ downloading $BINARY from $SERVER_URL ..."
mkdir -p "$INSTALL_DIR"
curl -fSL --progress-bar "$SERVER_URL/cli/$BINARY" -o "$INSTALL_DIR/arcturus"
chmod +x "$INSTALL_DIR/arcturus"

echo "✓ installed: $INSTALL_DIR/arcturus"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "  add it to your PATH:  export PATH=\\"$INSTALL_DIR:\\$PATH\\"" ;;
esac
echo ""
echo "next steps:"
echo "  arcturus login --server $SERVER_URL --token <arc_...>"
echo "  arcturus deploy"
`;
}
