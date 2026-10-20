#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Each source gate passes on the tree and fails on a planted violation: a gate never seen red locks
# nothing. Plants are new untracked files (the gates read `git ls-files --others`), removed on exit.
#
# Usage: scripts/tests/source_gates_fail_on_a_violation.test.sh

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root" || exit 2

planted_files=()
remove_planted_files() { [ ${#planted_files[@]} -eq 0 ] || rm -f "${planted_files[@]}"; }
main_rs_backup="$(mktemp)"
cp src-tauri/src/main.rs "$main_rs_backup"
restore_the_tree() { remove_planted_files; cp "$main_rs_backup" src-tauri/src/main.rs; rm -f "$main_rs_backup"; }
trap restore_the_tree EXIT

failures=0
expect_gate_outcome() {
  local expected_outcome="$1" source_gate="$2" case_description="$3"
  if "scripts/$source_gate" >/dev/null 2>&1; then actual_outcome=pass; else actual_outcome=fail; fi
  if [ "$actual_outcome" = "$expected_outcome" ]; then
    echo "ok   $source_gate $expected_outcome: $case_description"
  else
    echo "FAIL $source_gate expected $expected_outcome, got $actual_outcome: $case_description"
    failures=$((failures + 1))
  fi
}
plant() {
  local planted_path="$1" planted_contents="$2"
  printf '%s\n' "$planted_contents" >"$planted_path"
  planted_files+=("$planted_path")
}
unplant_all() { remove_planted_files; planted_files=(); }

readonly RUST_HEADER='// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary'

for source_gate in check-license-headers.sh check-platform-cfg-confinement.sh check-no-print-debugging.sh; do
  expect_gate_outcome pass "$source_gate" "the tree as it stands"
done

plant src/zz_planted_without_header.ts 'export const plantedValue = 1;'
expect_gate_outcome fail check-license-headers.sh "a TypeScript file with no header"
unplant_all
plant scripts/zz_planted_without_header.sh '#!/usr/bin/env bash
echo planted'
expect_gate_outcome fail check-license-headers.sh "a shell script with no header after its #! line"
unplant_all
plant src-tauri/src/zz_planted_spdx_missing.rs '// Copyright (c) 2025 Jonathan Fontanez
fn planted() {}'
expect_gate_outcome fail check-license-headers.sh "a Rust file with the copyright line but no SPDX line"
unplant_all

plant src-tauri/src/zz_planted_platform_cfg.rs "$RUST_HEADER
#[cfg(target_os = \"macos\")]
fn planted() {}"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a target_os cfg in shared code"
unplant_all
plant src-tauri/src/zz_planted_platform_cfg_macro.rs "$RUST_HEADER
fn planted() -> bool { cfg!(target_os = \"linux\") }"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a cfg!(target_os) in shared code"
unplant_all
plant src-tauri/src/zz_planted_lint_only_cfg_attr.rs "$RUST_HEADER
#[cfg_attr(target_os = \"linux\", allow(dead_code))]
fn planted() {}"
expect_gate_outcome pass check-platform-cfg-confinement.sh "a lint-only cfg_attr in shared code"
unplant_all
plant src-tauri/src/platform/zz_planted_platform_cfg.rs "$RUST_HEADER
#[cfg(target_os = \"macos\")]
fn planted() {}"
expect_gate_outcome pass check-platform-cfg-confinement.sh "a target_os cfg inside platform/"
unplant_all

printf '%s\n' '#[cfg(target_os = "macos")]' 'fn planted_in_main() {}' >>src-tauri/src/main.rs
expect_gate_outcome fail check-platform-cfg-confinement.sh "a second target_os cfg in main.rs beside its guard"
cp "$main_rs_backup" src-tauri/src/main.rs

plant src-tauri/src/zz_planted_println.rs "$RUST_HEADER
fn planted() { println!(\"planted\"); }"
expect_gate_outcome fail check-no-print-debugging.sh "a println! in the app's Rust"
unplant_all
plant src-tauri/src/zz_planted_dbg.rs "$RUST_HEADER
fn planted(value: u32) -> u32 { dbg!(value) }"
expect_gate_outcome fail check-no-print-debugging.sh "a dbg! in the app's Rust"
unplant_all
plant src/zz_planted_console.ts "$RUST_HEADER
console.log(\"planted\");"
expect_gate_outcome fail check-no-print-debugging.sh "a console.log in the window"
unplant_all
plant src/zz_planted_console.test.ts "$RUST_HEADER
console.log(\"planted\");"
expect_gate_outcome pass check-no-print-debugging.sh "a console.log in a window test"
unplant_all

if scripts/check-conventional-pr-title.sh "feat(window): planted" 2>/dev/null; then echo "ok   conventional title pass"; else echo "FAIL conventional title rejected a good title"; failures=$((failures + 1)); fi
if scripts/check-conventional-pr-title.sh "Planted a thing" 2>/dev/null; then echo "FAIL conventional title accepted a bad title"; failures=$((failures + 1)); else echo "ok   conventional title fail"; fi

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
echo "all source-gate cases passed"
