#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Platform code lives in src-tauri/src/platform/: no Rust file outside it names `target_os`, so the
# rest of the app calls the platform layer's items with no `cfg`. Two shapes are not platform code
# and are allowed: main.rs's guard that refuses to build for any OS but macOS and Linux, and a
# lint-only `#[cfg_attr(target_os = "…", allow(…))]` on a shared item one platform never uses.
#
# Usage: scripts/check-platform-cfg-confinement.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-platform-cfg-confinement: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

readonly UNSUPPORTED_OS_GUARD='#[cfg(not(any(target_os = "macos", target_os = "linux")))]'

platform_cfg_outside_the_platform_layer="$(
  git ls-files -z --cached --others --exclude-standard -- 'src-tauri/src/*.rs' ':!:src-tauri/src/platform/*' |
    xargs -0 grep -nH 'target_os' 2>/dev/null |
    grep -vF "src-tauri/src/main.rs:" |
    grep -vE ':[[:space:]]*#\[cfg_attr\(target_os = "[a-z]+", allow\([a-z_, ]+\)\)\][[:space:]]*$' ||
    true
)"
main_rs_platform_cfg="$(grep -n 'target_os' src-tauri/src/main.rs 2>/dev/null | grep -vxF "$(grep -nxF "$UNSUPPORTED_OS_GUARD" src-tauri/src/main.rs | head -1)" || true)"
[ -z "$main_rs_platform_cfg" ] ||
  platform_cfg_outside_the_platform_layer="${platform_cfg_outside_the_platform_layer:+$platform_cfg_outside_the_platform_layer
}$(printf '%s\n' "$main_rs_platform_cfg" | sed 's|^|src-tauri/src/main.rs:|')"

if [ -n "$platform_cfg_outside_the_platform_layer" ]; then
  echo "❌ target_os outside src-tauri/src/platform/ — move it behind a platform item:"
  printf '%s\n' "$platform_cfg_outside_the_platform_layer" | sed 's/^/  /'
  exit 1
fi
echo "✅ every target_os cfg sits in src-tauri/src/platform/ (plus main.rs's unsupported-OS guard)"
