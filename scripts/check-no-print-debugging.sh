#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The app logs through `tracing` in Rust and logs nothing to the console in the window's shipped
# code: no println!/eprintln!/print!/eprint!/dbg! in src-tauri/src, and no console.* call in src/
# outside its tests.
#
# Usage: scripts/check-no-print-debugging.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-no-print-debugging: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

rust_print_calls="$(
  git ls-files -z --cached --others --exclude-standard -- 'src-tauri/src/*.rs' |
    xargs -0 grep -nHE '\b(e?println|e?print|dbg)!\(' 2>/dev/null || true
)"
window_console_calls="$(
  git ls-files -z --cached --others --exclude-standard -- 'src/*.ts' ':!:*.test.ts' |
    xargs -0 grep -nHE '\bconsole\.(log|debug|info|warn|error|trace)\(' 2>/dev/null || true
)"

found_print_debugging=0
if [ -n "$rust_print_calls" ]; then
  echo "❌ Rust prints outside tracing — use tracing::{info,warn,error,debug}!:"
  printf '%s\n' "$rust_print_calls" | sed 's/^/  /'
  found_print_debugging=1
fi
if [ -n "$window_console_calls" ]; then
  echo "❌ console calls in the window's shipped code:"
  printf '%s\n' "$window_console_calls" | sed 's/^/  /'
  found_print_debugging=1
fi
[ "$found_print_debugging" -eq 0 ] || exit 1
echo "✅ no print debugging in src-tauri/src or the window"
