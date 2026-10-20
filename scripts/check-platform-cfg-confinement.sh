#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Platform code lives in src-tauri/src/platform/: no other Rust in src-tauri names a platform in a
# cfg — `target_os`, `target_vendor`, `target_family`, `unix`, `windows` — so the rest of the app
# calls the platform layer's items with no `cfg`. Comment lines don't count. Two shapes are not
# platform code and are allowed: main.rs's guard that refuses to build for any OS but macOS and
# Linux, and a lint-only `#[cfg_attr(target_os = "…", allow(…))]` on a shared item one platform
# never uses.
#
# Usage: scripts/check-platform-cfg-confinement.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-platform-cfg-confinement: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

readonly PLATFORM_CFG_PATTERN='target_(os|vendor|family)|cfg!?\((all\(|any\(|not\()*(unix|windows)\b'
readonly UNSUPPORTED_OS_GUARD='#[cfg(not(any(target_os = "macos", target_os = "linux")))]'
readonly LINT_ONLY_CFG_ATTR='^[[:space:]]*#\[cfg_attr\(target_os = "[a-z]+", allow\([a-z_, ]+\)\)\][[:space:]]*$'

platform_cfg_outside_the_platform_layer="$(
  git ls-files -z --cached --others --exclude-standard -- 'src-tauri/*.rs' ':!:src-tauri/src/platform/*' |
    xargs -0 grep -nHE "$PLATFORM_CFG_PATTERN" 2>/dev/null |
    while IFS= read -r match; do
      file_and_line="${match%%:*}:$(printf '%s' "${match#*:}" | cut -d: -f1)"
      source_text="${match#*:*:}"
      printf '%s' "$source_text" | grep -Eq '^[[:space:]]*//' && continue
      printf '%s' "$source_text" | grep -Eq "$LINT_ONLY_CFG_ATTR" && continue
      [ "${match%%:*}" = src-tauri/src/main.rs ] && [ "$source_text" = "$UNSUPPORTED_OS_GUARD" ] && continue
      printf '%s: %s\n' "$file_and_line" "$source_text"
    done
)"

if [ -n "$platform_cfg_outside_the_platform_layer" ]; then
  echo "❌ a platform cfg outside src-tauri/src/platform/ — move it behind a platform item:"
  printf '%s\n' "$platform_cfg_outside_the_platform_layer" | sed 's/^/  /'
  exit 1
fi
echo "✅ every platform cfg sits in src-tauri/src/platform/ (plus main.rs's unsupported-OS guard)"
