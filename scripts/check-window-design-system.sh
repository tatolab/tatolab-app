#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The window's screens are composed from the Tatolab design system (src/design_system/), which is
# built on stock shadcn (src/components/ui/): .claude/rules/window.md, issue #51. A screen is a
# React view in src/views/ (its tests aside), and it holds:
# - no import of a shadcn component or of base-ui, the primitives under them;
# - no hand-built control: no raw <button>, <input>, <select> or <textarea>, and no radio role.
# The DOM pages the window still hosts (src/views/*.ts) build their own controls until their
# tickets rebuild them, and are not checked.
#
# Usage: scripts/check-window-design-system.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-window-design-system: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

# Lines of the screens that match the extended regular expression $1, as `file:line:code`.
screen_lines_matching() {
  git ls-files -z --cached --others --exclude-standard -- 'src/views/*.tsx' ':!:*.test.tsx' |
    xargs -0 grep -nHE -- "$1" 2>/dev/null || true
}

shadcn_imports="$(screen_lines_matching "from[[:space:]]+[\"'](@/components/ui/|[./]+/components/ui/|@base-ui/react)")"
hand_built_controls="$(screen_lines_matching '<(button|input|select|textarea)([[:space:]>/]|$)')"
radio_roles="$(screen_lines_matching "role=\{?[\"'](radio|radiogroup)[\"']")"

found_a_violation=0
report() {
  local found_lines="$1" what_they_are="$2"
  [ -n "$found_lines" ] || return 0
  echo "❌ $what_they_are:"
  printf '%s\n' "$found_lines" | sed 's/^/  /'
  found_a_violation=1
}
report "$shadcn_imports" "a screen imports shadcn or base-ui directly — compose it from src/design_system/"
report "$hand_built_controls" "a hand-built control in a screen — use the design system's control for it"
report "$radio_roles" "a hand-built radio role in a screen — use the design system's SegmentedChoiceControl"
[ "$found_a_violation" -eq 0 ] || exit 1
echo "✅ every screen is composed from the design system"
