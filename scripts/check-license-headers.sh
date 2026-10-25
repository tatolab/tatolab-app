#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Every Rust, TypeScript (including TSX) and shell source file carries the proprietary header on its first two
# lines, or on lines 2-3 after a `#!` line. Shell means `*.sh` and any extensionless file whose
# `#!` names a shell. Type declarations (`*.d.ts`) are exempt, and so are shadcn's components as the
# shadcn CLI generates them, under its MIT licence: the app's src/renderer/components/ui/ and the design
# prototype's docs/design/src/components/ui/. Files come from `git ls-files`
# (tracked plus new and unignored), so node_modules, target/ and out/ never count. A CRLF line
# ending or a UTF-8 byte-order mark does not change the verdict.
#
# Usage: scripts/check-license-headers.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-license-headers: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

readonly COPYRIGHT_TEXT="Copyright (c) 2025 Jonathan Fontanez"
readonly SPDX_TEXT="SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary"

# Line $2 of file $1, without a byte-order mark or a carriage return.
source_line() { LC_ALL=C sed -n "${2}p" "$1" | LC_ALL=C sed -e $'1s/^\xEF\xBB\xBF//' -e $'s/\r$//'; }

files_missing_the_header=()
while IFS= read -r -d '' source_file; do
  [ -f "$source_file" ] || continue
  case "${source_file##*/}" in
    *.rs|*.ts|*.tsx|*.cts) comment_prefix="// " ;;
    *.sh) comment_prefix="# " ;;
    *.*) continue ;;
    *)
      head -c 128 "$source_file" | LC_ALL=C tr -d '\000' | head -1 |
        grep -Eq '^#!.*(/|env[[:space:]]+)(ba|z|da)?sh([[:space:]]|$)' || continue
      comment_prefix="# "
      ;;
  esac
  first_line="$(source_line "$source_file" 1)"
  header_line_number=1
  case "$first_line" in '#!'*) header_line_number=2 ;; esac
  if [ "$(source_line "$source_file" "$header_line_number")" != "${comment_prefix}${COPYRIGHT_TEXT}" ] ||
    [ "$(source_line "$source_file" $((header_line_number + 1)))" != "${comment_prefix}${SPDX_TEXT}" ]; then
    files_missing_the_header+=("$source_file")
  fi
done < <(git ls-files -z --cached --others --exclude-standard -- ':!:*.d.ts' ':!:src/renderer/components/ui/*' ':!:docs/design/src/components/ui/*')

if [ ${#files_missing_the_header[@]} -ne 0 ]; then
  echo "❌ ${#files_missing_the_header[@]} source file(s) are missing the proprietary header:"
  printf '  - %s\n' "${files_missing_the_header[@]}"
  echo ""
  echo "Lines 1-2 (or 2-3 after a #! line), with '#' in place of '//' for shell:"
  echo "  // ${COPYRIGHT_TEXT}"
  echo "  // ${SPDX_TEXT}"
  exit 1
fi
echo "✅ every Rust, TypeScript and shell source file carries the proprietary header"
