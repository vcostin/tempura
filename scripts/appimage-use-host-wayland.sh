#!/usr/bin/env bash
# Strip bundled libwayland from Tauri AppImages so WebKit uses the host copy.
# Ubuntu-built libwayland + Arch/Fedora Mesa aborts WebKitWebProcess with
# EGL_BAD_PARAMETER (blank window). Host libwayland soname has been stable
# for years; linuxdeploy already excludes libGL/libEGL the same way.
set -euo pipefail

export APPIMAGE_EXTRACT_AND_RUN=1
# Cursor (and other AppImages) export APPIMAGE into the shell; that makes
# `--appimage-extract` / `--appimage-offset` operate on the wrong image.
unset APPIMAGE ARGV0 APPDIR

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

appimages=()
if (($# > 0)); then
  appimages=("$@")
else
  shopt -s nullglob
  for dir in \
    "$repo_root"/src-tauri/target/release/bundle/appimage \
    "$repo_root"/src-tauri/target/debug/bundle/appimage \
    "$repo_root"/src-tauri/target/*/release/bundle/appimage
  do
    [[ -d "$dir" ]] || continue
    for f in "$dir"/*.AppImage "$dir"/*.appimage; do
      [[ -f "$f" ]] && appimages+=("$f")
    done
  done
fi

if ((${#appimages[@]} == 0)); then
  echo "appimage-use-host-wayland: no AppImage artifacts"
  exit 0
fi

if ! command -v mksquashfs >/dev/null; then
  echo "appimage-use-host-wayland: mksquashfs is required (squashfs-tools)" >&2
  exit 1
fi

for ai in "${appimages[@]}"; do
  echo "appimage-use-host-wayland: $ai"
  chmod +x "$ai"
  work="$(mktemp -d)"
  (cd "$work" && "$ai" --appimage-extract >/dev/null)

  mapfile -t doomed < <(find "$work/squashfs-root" -type f \( \
    -name 'libwayland-client.so*' \
    -o -name 'libwayland-cursor.so*' \
    -o -name 'libwayland-egl.so*' \
    -o -name 'libwayland-server.so*' \
  \))

  if ((${#doomed[@]} == 0)); then
    echo "  host libwayland already in use"
    rm -rf "$work"
    continue
  fi

  printf '  removing %s\n' "${doomed[@]}"
  rm -f "${doomed[@]}"

  offset="$("$ai" --appimage-offset)"
  head -c "$offset" "$ai" > "$work/runtime"
  mksquashfs "$work/squashfs-root" "$work/fs.squashfs" -comp zstd -all-root -noappend
  cat "$work/runtime" "$work/fs.squashfs" > "$ai.next"
  chmod +x "$ai.next"
  mv "$ai.next" "$ai"
  rm -rf "$work"
done
