#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The port's parity check: every Rust test in src-tauri/src/<path>.rs has a TypeScript test of
# the same name in src-electron/src/<path>.test.ts (mod.rs ports to mod.ts), written
# `test("<rust_test_fn_name>"` or, for a test that needs a live runtime,
# `test.skipIf(<condition>)("<rust_test_fn_name>"`. A Rust test with no twin is listed in
# scripts/electron-test-parity-exemptions.txt with why; an exemption that names no Rust test, or
# a test that has a twin after all, fails the check.
#
# By default only modules already ported — their .ts file exists — must have every test, so a
# module is ported whole and the check stays green while the port is under way. --complete also
# fails on every module not yet ported: the gate before the Tauri app is removed.
#
# Usage: scripts/check-electron-test-parity.sh [--complete]

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-electron-test-parity: must run inside the repository" >&2
  exit 2
}
cd "$repository_root" || exit 2

require_every_module=0
case "${1:-}" in
  --complete) require_every_module=1 ;;
  "") ;;
  *) echo "usage: scripts/check-electron-test-parity.sh [--complete]" >&2; exit 2 ;;
esac

readonly EXEMPTIONS_FILE=scripts/electron-test-parity-exemptions.txt

exempted_rust_tests="$(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e '/^$/d' "$EXEMPTIONS_FILE" 2>/dev/null | sort -u)"

# Every `#[test]` function as `src-tauri/src/<path>.rs::<name>`, stepping over the attributes
# between `#[test]` and its `fn`.
every_rust_test() {
  git ls-files -z --cached --others --exclude-standard -- 'src-tauri/src/*.rs' |
    xargs -0 awk '
      /^[[:space:]]*#\[test\]/ { awaiting_the_test_fn = 1; next }
      awaiting_the_test_fn && /^[[:space:]]*#\[/ { next }
      awaiting_the_test_fn && match($0, /fn [A-Za-z0-9_]+/) {
        print FILENAME "::" substr($0, RSTART + 3, RLENGTH - 3)
        awaiting_the_test_fn = 0
      }' 2>/dev/null | sort -u
}

typescript_module_for() {
  local rust_module="${1#src-tauri/src/}"
  printf 'src-electron/src/%s.ts' "${rust_module%.rs}"
}

has_a_typescript_twin() {
  local typescript_test_file="$1" rust_test_name="$2"
  [ -f "$typescript_test_file" ] &&
    grep -Eq "\\btest(\\.skipIf\\([^)]*\\))?\\([[:space:]]*\"${rust_test_name}\"" "$typescript_test_file"
}

missing_twins=()
modules_not_yet_ported=()
all_rust_tests="$(every_rust_test)"
while IFS= read -r rust_test; do
  [ -n "$rust_test" ] || continue
  rust_module="${rust_test%%::*}"
  rust_test_name="${rust_test##*::}"
  typescript_module="$(typescript_module_for "$rust_module")"
  typescript_test_file="${typescript_module%.ts}.test.ts"
  if printf '%s\n' "$exempted_rust_tests" | grep -Fxq "$rust_test"; then
    if has_a_typescript_twin "$typescript_test_file" "$rust_test_name"; then
      missing_twins+=("$rust_test is exempted in $EXEMPTIONS_FILE but has a twin in $typescript_test_file — drop the exemption")
    fi
    continue
  fi
  if [ ! -f "$typescript_module" ] && [ "$require_every_module" -eq 0 ]; then
    modules_not_yet_ported+=("$rust_module")
    continue
  fi
  has_a_typescript_twin "$typescript_test_file" "$rust_test_name" ||
    missing_twins+=("$rust_test has no test(\"$rust_test_name\" in $typescript_test_file")
done <<<"$all_rust_tests"

while IFS= read -r exempted_rust_test; do
  [ -n "$exempted_rust_test" ] || continue
  printf '%s\n' "$all_rust_tests" | grep -Fxq "$exempted_rust_test" ||
    missing_twins+=("$EXEMPTIONS_FILE names $exempted_rust_test, which is not a Rust test")
done <<<"$exempted_rust_tests"

if [ ${#missing_twins[@]} -ne 0 ]; then
  echo "❌ ${#missing_twins[@]} parity failure(s) between the Rust tests and the Electron port:"
  printf '  - %s\n' "${missing_twins[@]}"
  exit 1
fi
if [ ${#modules_not_yet_ported[@]} -ne 0 ]; then
  echo "✅ every ported module has all its Rust tests; not yet ported: $(printf '%s\n' "${modules_not_yet_ported[@]}" | sort -u | wc -l | tr -d ' ') module(s)"
else
  echo "✅ every Rust test has its TypeScript twin or a stated exemption"
fi
