#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The app logs nothing to the console in its shipped code: no console.* call or `debugger`
# statement in src/ or src-electron/ outside their tests. The Electron main process logs
# through tatolab_app_log.ts, the one file that writes to standard output or error.
#
# Usage: scripts/check-no-print-debugging.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-no-print-debugging: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

window_console_calls="$(
  git ls-files -z --cached --others --exclude-standard -- 'src/*.ts' 'src/*.tsx' 'src-electron/*.ts' 'src-electron/*.cts' ':!:*.test.ts' ':!:*.test.tsx' |
    xargs -0 grep -nHE '\bconsole[[:space:]]*\.[[:space:]]*[a-zA-Z]+[[:space:]]*\(|(^|[^[:alnum:]_.])debugger[[:space:]]*(;|$)' 2>/dev/null || true
)"
main_process_standard_stream_writes="$(
  git ls-files -z --cached --others --exclude-standard -- 'src-electron/*.ts' 'src-electron/*.cts' ':!:*.test.ts' \
    ':!:src-electron/src/tatolab_app_log.ts' |
    xargs -0 grep -nHE '\bprocess[[:space:]]*\.[[:space:]]*std(out|err)[[:space:]]*\.[[:space:]]*write\b' 2>/dev/null || true
)"

found_print_debugging=0
if [ -n "$window_console_calls" ]; then
  echo "❌ console calls in the window's or the main process's shipped code:"
  printf '%s\n' "$window_console_calls" | sed 's/^/  /'
  found_print_debugging=1
fi
if [ -n "$main_process_standard_stream_writes" ]; then
  echo "❌ the main process writes to standard output or error outside tatolab_app_log.ts:"
  printf '%s\n' "$main_process_standard_stream_writes" | sed 's/^/  /'
  found_print_debugging=1
fi
[ "$found_print_debugging" -eq 0 ] || exit 1
echo "✅ no print debugging in the window or the Electron main process"
