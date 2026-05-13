#!/usr/bin/env bash
set -euo pipefail

REPO="nafishahmeddev/ssl-pilot"
BIN_NAME="sp"
INSTALL_DIR="/usr/local/bin"
INSTALL_PATH="${INSTALL_DIR}/${BIN_NAME}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

err()  { echo -e "${RED}Error: $*${NC}" >&2; }
info() { echo -e "${BOLD}$*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}Warning: $*${NC}"; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  err "This installer must run as root."
  echo ""
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/apps/cli/install.sh | sudo bash"
  echo ""
  exit 1
fi

# ── Platform detection ────────────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux)  PLATFORM="linux" ;;
  darwin) PLATFORM="darwin" ;;
  *)
    err "Unsupported OS: ${OS}. Supported: linux, darwin."
    exit 1
  ;;
esac

case "$ARCH" in
  x86_64)          ARCH_TAG="x64" ;;
  aarch64 | arm64) ARCH_TAG="arm64" ;;
  *)
    err "Unsupported architecture: ${ARCH}. Supported: x86_64, aarch64/arm64."
    exit 1
  ;;
esac

ASSET="${BIN_NAME}-${PLATFORM}-${ARCH_TAG}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

info "SSL Pilot CLI Installer"
echo ""
echo "  Platform : ${PLATFORM}-${ARCH_TAG}"
echo "  From     : ${DOWNLOAD_URL}"
echo "  Install  : ${INSTALL_PATH}"
echo ""

# ── Download ──────────────────────────────────────────────────────────────────
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

if command -v curl &>/dev/null; then
  curl -fsSL --progress-bar "$DOWNLOAD_URL" -o "$TMP_FILE"
elif command -v wget &>/dev/null; then
  wget -q --show-progress "$DOWNLOAD_URL" -O "$TMP_FILE"
else
  err "Neither curl nor wget found. Install one and retry."
  exit 1
fi

if [[ ! -s "$TMP_FILE" ]]; then
  err "Downloaded file is empty. Check the release exists: https://github.com/${REPO}/releases/latest"
  exit 1
fi

# ── Install ───────────────────────────────────────────────────────────────────
install -m 755 "$TMP_FILE" "$INSTALL_PATH"

ok "Installed to ${INSTALL_PATH}"
echo ""
info "Next steps:"
echo ""
echo "  1. Export your API key (add to ~/.bashrc or ~/.zshrc):"
echo "     export SSL_PILOT_API_KEY='sslpilot_...'"
echo ""
echo "  2. List certificates:"
echo "     sp list"
echo ""
echo "  3. Download a certificate (requires root for /etc/ssl-pilot/):"
echo "     sudo sp download"
echo "     sudo sp download '*.example.com'"
echo ""
