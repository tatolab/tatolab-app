#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Every Rust, TypeScript and shell source file carries the proprietary header on its first two
# lines, or on lines 2-3 after a `#!` line. Files come from `git ls-files` (tracked plus new and
# unignored), so node_modules, target/ and dist/ never count.
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

files_missing_the_header=()
while IFS= read -r -d '' source_file; do
  [ -f "$source_file" ] || continue
  case "$source_file" in
    *.sh) comment_prefix="# " ;;
    *) comment_prefix="// " ;;
  esac
  header_line_number=1
  if head -1 "$source_file" | grep -q '^#!'; then
    header_line_number=2
  fi
  if ! sed -n "${header_line_number}p" "$source_file" | grep -qxF "${comment_prefix}${COPYRIGHT_TEXT}" ||
    ! sed -n "$((header_line_number + 1))p" "$source_file" | grep -qxF "${comment_prefix}${SPDX_TEXT}"; then
    files_missing_the_header+=("$source_file")
  fi
done < <(git ls-files -z --cached --others --exclude-standard -- '*.rs' '*.ts' '*.sh' ':!:*.d.ts')

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
