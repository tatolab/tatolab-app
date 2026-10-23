#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# No dot indicators in the window (docs/design/DESIGN.md, rule 1): no coloured status dot, badge
# dot, pulsing dot, bullet dot or round port handle. Status is a word, and a problem is an icon.
# Checked in the window's shipped TypeScript, TSX and CSS, and index.html:
# - a small `rounded-full` element (size, or width and height, of 3 or less);
# - a pulsing animation (`animate-ping`, `animate-pulse`, `animate-breathe`);
# - an SVG `<circle>` in UI markup — src/icons.ts is exempt, its circles being a glyph's geometry
#   (a magnifier's lens, a gear's hub, an eye's pupil);
# - a bullet glyph;
# - a round status icon, which reads as a dot (TriangleAlert and SquareX are the problem icons).
# shadcn's components (src/components/ui/) are controls, not indicators, and are not checked.
#
# Usage: scripts/check-no-dot-indicators.sh   (from anywhere inside the repository)

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-no-dot-indicators: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

readonly SMALL_SIZE='(0\.5|1|1\.5|2|2\.5|3)'

window_files() {
  git ls-files -z --cached --others --exclude-standard -- 'src/*.ts' 'src/*.tsx' 'src/*.css' 'index.html' \
    ':!:*.test.ts' ':!:*.test.tsx' ':!:src/components/ui/*' "$@"
}

# Lines of the window's files that match the extended regular expression $1, as `file:line:code`.
lines_matching() {
  local pattern="$1"
  shift
  window_files "$@" | LC_ALL=en_US.UTF-8 xargs -0 grep -nHE -- "$pattern" 2>/dev/null || true
}

small_round_elements="$(
  lines_matching "rounded-full[^\"\`]*\\bsize-${SMALL_SIZE}\\b|\\bsize-${SMALL_SIZE}\\b[^\"\`]*rounded-full"
  lines_matching 'rounded-full' | grep -E "\\bw-${SMALL_SIZE}\\b" | grep -E "\\bh-${SMALL_SIZE}\\b"
)"
pulsing_indicators="$(lines_matching 'animate-(ping|pulse|breathe)')"
svg_circles="$(lines_matching '<circle\b' ':!:src/icons.ts')"
bullet_glyphs="$(lines_matching '[•●◉⬤]')"
round_status_icons="$(
  lines_matching '\b(OctagonX|OctagonAlert|CircleX|XCircle|CircleAlert|AlertCircle|CircleDot|CircleSlash|CirclePlay|CirclePause|CircleStop)\b'
)"

found_dot_indicator=0
report() {
  local found_lines="$1" what_they_are="$2"
  [ -n "$found_lines" ] || return 0
  echo "❌ $what_they_are:"
  printf '%s\n' "$found_lines" | sed 's/^/  /'
  found_dot_indicator=1
}
report "$small_round_elements" "a small rounded-full element (a dot)"
report "$pulsing_indicators" "a pulsing indicator"
report "$svg_circles" "an SVG circle in UI markup"
report "$bullet_glyphs" "a bullet glyph"
report "$round_status_icons" "a round status icon, which reads as a dot — use TriangleAlert or SquareX"
[ "$found_dot_indicator" -eq 0 ] || exit 1
echo "✅ no dot indicators in the window"
