#!/usr/bin/env bash
# Local signed AppImage/deb/rpm build for smoke testing before a tag.
# Loads the updater private key without printing it.
#
# Usage:
#   ./scripts/signed-local-build.sh
#   KEY_FILE=~/.tauri/tempura.key ./scripts/signed-local-build.sh
#   deno task tauri:build:signed
#
# Notes:
# - TAURI_SIGNING_PRIVATE_KEY must be the key *file contents* (often one
#   base64 line under src-tauri/.keys/), not base64 -d of that file.
# - TAURI_SIGNING_PRIVATE_KEY_PASSWORD must be set to "" (empty string).
#   Leaving it unset makes the CLI fail with a misleading password error.
# - Do not set TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PATH
#   together — re-sign after the Wayland strip will abort.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Drop AppImage pollution if a previous AppImage left env in this shell.
unset APPDIR APPIMAGE APPIMAGE_EXTRACT_AND_RUN ARGV0 || true
unset LD_LIBRARY_PATH || true
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

KEY_FILE="${KEY_FILE:-$ROOT/src-tauri/.keys/tempura.key}"
if [[ ! -f "$KEY_FILE" ]]; then
  echo "signed-local-build: missing key file: $KEY_FILE" >&2
  echo "Set KEY_FILE to your private key path, or place it at src-tauri/.keys/tempura.key" >&2
  exit 1
fi

unset TAURI_SIGNING_PRIVATE_KEY_PATH
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

echo "signed-local-build: building with key from $KEY_FILE"
deno task tauri:build

echo
echo "signed-local-build: AppImage artifacts:"
ls -la src-tauri/target/release/bundle/appimage/Tempura_*_amd64.AppImage* 2>/dev/null || \
  ls -la src-tauri/target/release/bundle/appimage/
