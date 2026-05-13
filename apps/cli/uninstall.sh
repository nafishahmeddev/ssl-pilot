#!/usr/bin/env bash
set -euo pipefail

BIN_PATH="/usr/local/bin/sp"
CERT_DIR="/etc/ssl-pilot"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

err()  { echo -e "${RED}Error: $*${NC}" >&2; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}Warning: $*${NC}"; }
info() { echo -e "${BOLD}$*${NC}"; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  err "This uninstaller must run as root."
  echo ""
  echo "  sudo bash <(curl -fsSL https://raw.githubusercontent.com/nafishahmeddev/ssl-pilot/main/apps/cli/uninstall.sh)"
  echo ""
  exit 1
fi

info "SSL Pilot CLI Uninstaller"
echo ""

# ── Remove binary ─────────────────────────────────────────────────────────────
if [[ -f "$BIN_PATH" ]]; then
  rm -f "$BIN_PATH"
  ok "Removed ${BIN_PATH}"
else
  warn "Binary not found at ${BIN_PATH} — already uninstalled?"
fi

# ── Optionally remove cert store ──────────────────────────────────────────────
if [[ -d "$CERT_DIR" ]]; then
  echo ""
  warn "Certificate directory exists: ${CERT_DIR}"
  echo "  This directory contains downloaded SSL certificates and private keys."
  echo ""
  read -r -p "  Remove ${CERT_DIR} and all its contents? [y/N] " CONFIRM
  echo ""

  if [[ "${CONFIRM,,}" == "y" ]]; then
    rm -rf "$CERT_DIR"
    ok "Removed ${CERT_DIR}"
  else
    ok "Kept ${CERT_DIR}"
  fi
fi

echo ""
ok "SSL Pilot CLI uninstalled."
echo ""
