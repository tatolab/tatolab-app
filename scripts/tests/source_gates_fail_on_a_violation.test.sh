#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Each source gate passes on the tree and fails on a planted violation: a gate never seen red locks
# nothing. The gates run against a throwaway copy of the working tree, so nothing is planted in the
# real one and a killed run leaves no residue.
#
# Usage: scripts/tests/source_gates_fail_on_a_violation.test.sh

set -uo pipefail

repository_root="$(git rev-parse --show-toplevel)"
tree_copy="$(mktemp -d)"
trap 'rm -rf "$tree_copy"' EXIT

(cd "$repository_root" && git ls-files -z --cached --others --exclude-standard) |
  (cd "$repository_root" && xargs -0 tar -cf - 2>/dev/null) | (cd "$tree_copy" && tar -xf -)
(cd "$tree_copy" && git init -q && git add -A) || { echo "could not make the tree copy"; exit 2; }
cd "$tree_copy" || exit 2

failures=0
expect_gate_outcome() {
  local expected_outcome="$1" source_gate="$2" case_description="$3" actual_outcome
  if "scripts/$source_gate" >/dev/null 2>&1; then actual_outcome=pass; else actual_outcome=fail; fi
  if [ "$actual_outcome" = "$expected_outcome" ]; then
    echo "ok   $source_gate $expected_outcome: $case_description"
  else
    echo "FAIL $source_gate expected $expected_outcome, got $actual_outcome: $case_description"
    failures=$((failures + 1))
  fi
}
planted_path=""
plant() { planted_path="$1"; printf '%b' "$2" >"$planted_path"; }
unplant() { rm -f "$planted_path"; git checkout -q -- . 2>/dev/null; planted_path=""; }

readonly RUST_HEADER='// Copyright (c) 2025 Jonathan Fontanez\n// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary\n'

for source_gate in check-license-headers.sh check-platform-cfg-confinement.sh check-no-print-debugging.sh; do
  expect_gate_outcome pass "$source_gate" "the tree as it stands"
done

plant src/zz_planted.ts 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a TypeScript file with no header"; unplant
plant scripts/zz_planted.sh '#!/usr/bin/env bash\necho planted\n'
expect_gate_outcome fail check-license-headers.sh "a shell script with no header after its #! line"; unplant
plant scripts/zz-planted-no-extension '#!/usr/bin/env bash\necho planted\n'
expect_gate_outcome fail check-license-headers.sh "an extensionless shell script with no header"; unplant
plant src-tauri/src/zz_planted.rs '// Copyright (c) 2025 Jonathan Fontanez\nfn planted() {}\n'
expect_gate_outcome fail check-license-headers.sh "a Rust file with the copyright line but no SPDX line"; unplant
plant src/zz_planted.ts '\xEF\xBB\xBF// Copyright (c) 2025 Jonathan Fontanez\r\n// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary\r\nexport const plantedValue = 1;\r\n'
expect_gate_outcome pass check-license-headers.sh "a TypeScript file with the header, a BOM and CRLF endings"; unplant

plant src-tauri/src/zz_planted.rs "${RUST_HEADER}#[cfg(target_os = \"macos\")]\nfn planted() {}\n"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a target_os cfg in shared code"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}fn planted() -> bool { cfg!(target_os=\"linux\") }\n"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a cfg!(target_os) in shared code"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}#[cfg(target_vendor = \"apple\")]\nfn planted() {}\n"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a target_vendor cfg in shared code"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}#[cfg(unix)]\nfn planted() {}\n"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a cfg(unix) in shared code"; unplant
printf '%s\n' '#[cfg(target_os = "macos")]' 'fn planted_in_build() {}' >>src-tauri/build.rs
expect_gate_outcome fail check-platform-cfg-confinement.sh "a target_os cfg in build.rs"; unplant
printf '%s\n' '#[cfg(target_os = "macos")]' 'fn planted_in_main() {}' >>src-tauri/src/main.rs
expect_gate_outcome fail check-platform-cfg-confinement.sh "a second target_os cfg in main.rs beside its guard"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}#[cfg_attr(target_os = \"linux\", allow(dead_code))]\nfn planted() {}\n"
expect_gate_outcome pass check-platform-cfg-confinement.sh "a lint-only cfg_attr in shared code"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}// target_os differs here, so the platform layer decides\nfn planted() {}\n"
expect_gate_outcome pass check-platform-cfg-confinement.sh "target_os named in a comment"; unplant
plant src-tauri/src/platform/zz_planted.rs "${RUST_HEADER}#[cfg(target_os = \"macos\")]\nfn planted() {}\n"
expect_gate_outcome pass check-platform-cfg-confinement.sh "a target_os cfg inside platform/"; unplant

plant src-tauri/src/zz_planted.rs "${RUST_HEADER}fn planted() { println!(\"planted\"); }\n"
expect_gate_outcome fail check-no-print-debugging.sh "a println! in the app's Rust"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}fn planted() { eprintln! (\"planted\"); }\n"
expect_gate_outcome fail check-no-print-debugging.sh "an eprintln! with a space before its parenthesis"; unplant
plant src-tauri/src/zz_planted.rs "${RUST_HEADER}fn planted(value: u32) -> u32 { dbg!(value) }\n"
expect_gate_outcome fail check-no-print-debugging.sh "a dbg! in the app's Rust"; unplant
plant src/zz_planted.ts "${RUST_HEADER}console.log(\"planted\");\n"
expect_gate_outcome fail check-no-print-debugging.sh "a console.log in the window"; unplant
plant src/zz_planted.ts "${RUST_HEADER}console.table([1]);\n"
expect_gate_outcome fail check-no-print-debugging.sh "a console.table in the window"; unplant
plant src/zz_planted.ts "${RUST_HEADER}export function planted(): void {\n  debugger;\n}\n"
expect_gate_outcome fail check-no-print-debugging.sh "a debugger statement in the window"; unplant
plant src/zz_planted.test.ts "${RUST_HEADER}console.log(\"planted\");\n"
expect_gate_outcome pass check-no-print-debugging.sh "a console.log in a window test"; unplant

if scripts/check-conventional-pr-title.sh "feat(window): planted" 2>/dev/null; then echo "ok   conventional title pass"; else echo "FAIL conventional title rejected a good title"; failures=$((failures + 1)); fi
if scripts/check-conventional-pr-title.sh "Planted a thing" 2>/dev/null; then echo "FAIL conventional title accepted a bad title"; failures=$((failures + 1)); else echo "ok   conventional title fail"; fi

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
echo "all source-gate cases passed"
