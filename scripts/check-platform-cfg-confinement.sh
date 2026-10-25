#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Platform code lives in src/main/platform/: no other main-process module reads
# `process.platform` or `os.platform()`, so the rest of the app calls the platform layer's items.
# Comment lines don't count.
#
# Usage: scripts/check-platform-cfg-confinement.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-platform-cfg-confinement: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

platform_reads_outside_the_electron_platform_layer="$(
  git ls-files -z --cached --others --exclude-standard -- 'src/main/*.ts' 'src/main/*.cts' 'src/preload/*.ts' 'src/preload/*.cts' ':!:src/main/platform/*' |
    xargs -0 grep -nHE '\bprocess[[:space:]]*\.[[:space:]]*platform\b|\bos[[:space:]]*\.[[:space:]]*platform[[:space:]]*\(' 2>/dev/null |
    grep -vE '^[^:]+:[0-9]+:[[:space:]]*//' || true
)"

if [ -n "$platform_reads_outside_the_electron_platform_layer" ]; then
  echo "❌ the main process asks which platform it runs on outside src/main/platform/ — move it behind a platform item:"
  printf '%s\n' "$platform_reads_outside_the_electron_platform_layer" | sed 's/^/  /'
  exit 1
fi
echo "✅ every platform read sits in src/main/platform/"
