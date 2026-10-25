#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The licence-header check passes on the tree and fails on a planted violation: a check never seen
# red locks nothing. It runs against a throwaway copy of the working tree, so nothing is planted in
# the real one and a killed run leaves no residue.
#
# Usage: scripts/tests/license_header_check_fails_on_a_violation.test.sh

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

readonly SOURCE_HEADER='// Copyright (c) 2025 Jonathan Fontanez\n// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary\n'

expect_gate_outcome pass check-license-headers.sh "the tree as it stands"

plant src/renderer/zz_planted.ts 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a TypeScript file with no header"; unplant
plant scripts/zz_planted.sh '#!/usr/bin/env bash\necho planted\n'
expect_gate_outcome fail check-license-headers.sh "a shell script with no header after its #! line"; unplant
plant scripts/zz-planted-no-extension '#!/usr/bin/env bash\necho planted\n'
expect_gate_outcome fail check-license-headers.sh "an extensionless shell script with no header"; unplant
plant src/renderer/zz_planted.ts '// Copyright (c) 2025 Jonathan Fontanez\nexport const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a TypeScript file with the copyright line but no SPDX line"; unplant
plant src/renderer/zz_planted.ts '\xEF\xBB\xBF// Copyright (c) 2025 Jonathan Fontanez\r\n// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary\r\nexport const plantedValue = 1;\r\n'
expect_gate_outcome pass check-license-headers.sh "a TypeScript file with the header, a BOM and CRLF endings"; unplant

plant src/renderer/components/ui/zz-planted.tsx 'export const plantedValue = 1;\n'
expect_gate_outcome pass check-license-headers.sh "a shadcn component in src/renderer/components/ui/ with no header"; unplant
plant src/renderer/design_system/zz_planted.tsx 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a design-system file with no header"; unplant

plant src/main/zz_planted.cts 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a CommonJS TypeScript file with no header"; unplant

plant src/renderer/zz_planted.tsx "${SOURCE_HEADER}export const plantedFailure = () => null;\n"
expect_gate_outcome pass check-license-headers.sh "a TSX file with the header"; unplant
plant src/renderer/zz_planted.tsx 'export const plantedFailure = () => null;\n'
expect_gate_outcome fail check-license-headers.sh "a TSX file with no header"; unplant

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
echo "all licence-header cases passed"
