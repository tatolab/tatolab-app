#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# CLAUDE.md's code rules in the Electron main process's TypeScript (src-electron/), checked line by line
# with comments and string literals blanked out:
# - only src-electron/src/electron_adapters/ and src-electron/src/preload/ import `electron`, so
#   every other module and its tests run in plain Node;
# - shipped code has no `any`, no `as` cast but `as const`, no non-null `!`, no `throw` (a failure
#   is a returned value the caller propagates), no blocking `*Sync(` call, and no wall-clock
#   `Date.now()` / `new Date(` (time is `performance.now()`);
# - no test is focused or skipped with `.only`, `.skip` or `.todo`.
# Shipped code is every .ts/.cts file but *.test.ts and the fake_*.ts test stand-ins. The checks
# are pattern matches, not a type checker: `tsc --strict` covers the rest.
#
# Usage: scripts/check-electron-typescript-forms.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-electron-typescript-forms: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

# Each line of the files on stdin (NUL-separated) as `file:line:code`, with // comments, lines
# inside /* */ comments and the contents of string literals removed.
code_lines_without_comments_or_strings() {
  xargs -0 awk '
    FNR == 1 { inside_block_comment = 0 }
    {
      code = $0
      if (inside_block_comment) {
        if (index(code, "*/") == 0) next
        code = substr(code, index(code, "*/") + 2)
        inside_block_comment = 0
      }
      gsub(/"([^"\\]|\\.)*"/, "\"\"", code)
      gsub(/\047([^\047\\]|\\.)*\047/, "\"\"", code)
      gsub(/`[^`]*`/, "\"\"", code)
      gsub(/\/\*.*\*\//, "", code)
      if (index(code, "/*") > 0) { code = substr(code, 1, index(code, "/*") - 1); inside_block_comment = 1 }
      sub(/\/\/.*$/, "", code)
      print FILENAME ":" FNR ":" code
    }' 2>/dev/null
}

every_electron_file() {
  git ls-files -z --cached --others --exclude-standard -- 'src-electron/*.ts' 'src-electron/*.cts'
}
shipped_electron_files() {
  git ls-files -z --cached --others --exclude-standard -- 'src-electron/*.ts' 'src-electron/*.cts' \
    ':!:*.test.ts' ':!:src-electron/**/fake_*.ts'
}
test_electron_files() {
  git ls-files -z --cached --others --exclude-standard -- 'src-electron/*.test.ts'
}

found_violation=0
report() {
  local what_is_wrong="$1" violating_lines="$2"
  [ -n "$violating_lines" ] || return 0
  echo "❌ $what_is_wrong:"
  printf '%s\n' "$violating_lines" | sed 's/^/  /'
  found_violation=1
}

electron_imports_outside_the_adapters="$(
  every_electron_file | code_lines_without_comments_or_strings |
    grep -vE '^src-electron/src/(electron_adapters|preload)/' |
    awk -F: '{ line = $0; sub(/^[^:]*:[^:]*:/, "", line) } line ~ /(from|require\(|import\()[[:space:]]*""/ { print }' |
    while IFS= read -r stripped_line; do
      file_and_line="$(printf '%s' "$stripped_line" | cut -d: -f1-2)"
      original_line="$(sed -n "${file_and_line##*:}p" "${file_and_line%%:*}")"
      printf '%s' "$original_line" | grep -Eq "(from|require\\(|import\\()[[:space:]]*[\"']electron[\"']" &&
        printf '%s: %s\n' "$file_and_line" "$original_line"
    done
)"
report "electron imported outside src-electron/src/electron_adapters/ and preload/" "$electron_imports_outside_the_adapters"

shipped_code="$(shipped_electron_files | code_lines_without_comments_or_strings)"
shipped_lines_matching() { printf '%s\n' "$shipped_code" | grep -E "^[^:]+:[0-9]+:.*($1)" || true; }

report "an \`any\` type in shipped main-process code" \
  "$(shipped_lines_matching '(:|<|\||&|,|\bas)[[:space:]]*any([[:space:]]*([]>|&,;)=[]|$)|\[\])')"
report "an \`as\` cast in shipped main-process code (only \`as const\` is allowed)" \
  "$(shipped_lines_matching '[])A-Za-z0-9_"][[:space:]]+as[[:space:]]+[A-Za-z_{([]' |
    grep -vE '[[:space:]]as[[:space:]]+const\b' | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(import|export)[[:space:]]+(type[[:space:]]+)?[{*]' || true)"
report "a non-null \`!\` in shipped main-process code" \
  "$(shipped_lines_matching '[])A-Za-z0-9_]!([].;,)[]|$)')"
report "a \`throw\` in shipped main-process code — return a failure value" \
  "$(shipped_lines_matching '\bthrow\b')"
report "a blocking *Sync( call in shipped main-process code — the main thread draws the tray" \
  "$(shipped_lines_matching '\b[A-Za-z]+Sync[[:space:]]*\(')"
report "wall-clock time in shipped main-process code — use performance.now()" \
  "$(shipped_lines_matching '\bDate[[:space:]]*\.[[:space:]]*now[[:space:]]*\(|\bnew[[:space:]]+Date[[:space:]]*\(')"

report "a focused or skipped main-process test" \
  "$(test_electron_files | code_lines_without_comments_or_strings |
    grep -E '^[^:]+:[0-9]+:.*\b(test|it|describe)[[:space:]]*\.[[:space:]]*(only|skip|todo)\b' || true)"

[ "$found_violation" -eq 0 ] || exit 1
echo "✅ the Electron main process keeps the code rules"
