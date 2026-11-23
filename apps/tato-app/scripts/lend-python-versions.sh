#!/usr/bin/env bash
# Prints, one per line, each CPython X.Y a processor interpreter (the user's venv Python) may import a
# lend's tatolab.runtime with: every version from the floor its .dist-info's Requires-Python states
# up to the newest CPython the bundle precompiles for. The lend's own metadata is the promise, so the
# bundle carries bytecode for exactly the interpreters it admits, and none it cannot compile under.
# A Requires-Python other than a single ">=3.N" floor is refused: this script would otherwise guess.
#
# Usage: lend-python-versions.sh <lend dir>
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 1 ] || usage
lend_directory="$1"
newest_precompiled_python_minor=14

shopt -s nullglob
lend_metadata_files=("$lend_directory"/*.dist-info/METADATA)
[ "${#lend_metadata_files[@]}" -eq 1 ] \
  || { echo "the lend at $lend_directory holds ${#lend_metadata_files[@]} .dist-info/METADATA, not one" >&2; exit 1; }
requires_python="$(sed -n 's/^Requires-Python:[[:space:]]*//p' "${lend_metadata_files[0]}" | tr -d '[:space:]')"
[[ "$requires_python" =~ ^\>=3\.([0-9]+)$ ]] \
  || { echo "${lend_metadata_files[0]} states Requires-Python '$requires_python', which this script reads only as one >=3.N floor" >&2; exit 1; }
oldest_admitted_python_minor="${BASH_REMATCH[1]}"
[ "$oldest_admitted_python_minor" -le "$newest_precompiled_python_minor" ] \
  || { echo "the lend admits CPython 3.$oldest_admitted_python_minor and later, newer than 3.$newest_precompiled_python_minor, the newest the bundle precompiles for" >&2; exit 1; }
for ((python_minor = oldest_admitted_python_minor; python_minor <= newest_precompiled_python_minor; python_minor++)); do
  echo "3.$python_minor"
done
