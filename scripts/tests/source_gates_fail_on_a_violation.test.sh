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

readonly SOURCE_HEADER='// Copyright (c) 2025 Jonathan Fontanez\n// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary\n'

for source_gate in check-license-headers.sh check-platform-cfg-confinement.sh check-no-print-debugging.sh \
  check-electron-typescript-forms.sh check-no-dot-indicators.sh check-window-design-system.sh; do
  expect_gate_outcome pass "$source_gate" "the tree as it stands"
done

plant src/zz_planted.ts 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a TypeScript file with no header"; unplant
plant scripts/zz_planted.sh '#!/usr/bin/env bash\necho planted\n'
expect_gate_outcome fail check-license-headers.sh "a shell script with no header after its #! line"; unplant
plant scripts/zz-planted-no-extension '#!/usr/bin/env bash\necho planted\n'
expect_gate_outcome fail check-license-headers.sh "an extensionless shell script with no header"; unplant
plant src/zz_planted.ts '// Copyright (c) 2025 Jonathan Fontanez\nexport const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a TypeScript file with the copyright line but no SPDX line"; unplant
plant src/zz_planted.ts '\xEF\xBB\xBF// Copyright (c) 2025 Jonathan Fontanez\r\n// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary\r\nexport const plantedValue = 1;\r\n'
expect_gate_outcome pass check-license-headers.sh "a TypeScript file with the header, a BOM and CRLF endings"; unplant


plant src/components/ui/zz-planted.tsx 'export const plantedValue = 1;\n'
expect_gate_outcome pass check-license-headers.sh "a shadcn component in src/components/ui/ with no header"; unplant
plant src/design_system/zz_planted.tsx 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a design-system file with no header"; unplant

plant src-electron/src/zz_planted.cts 'export const plantedValue = 1;\n'
expect_gate_outcome fail check-license-headers.sh "a CommonJS TypeScript file with no header"; unplant

plant src/zz_planted.tsx "${SOURCE_HEADER}export const plantedFailure = () => null;\n"
expect_gate_outcome pass check-license-headers.sh "a TSX file with the header"; unplant
plant src/zz_planted.tsx 'export const plantedFailure = () => null;\n'
expect_gate_outcome fail check-license-headers.sh "a TSX file with no header"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const plantedLog = () => console.log(\"planted\");\n"
expect_gate_outcome fail check-no-print-debugging.sh "a console call in the window's TSX"; unplant

plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const plantedDot = () => <span className=\"size-2 rounded-full bg-danger\" />;\n"
expect_gate_outcome fail check-no-dot-indicators.sh "a small rounded-full element"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const plantedDot = () => <span className=\"h-1.5 w-1.5 rounded-full\" />;\n"
expect_gate_outcome fail check-no-dot-indicators.sh "a rounded-full element sized by width and height"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const plantedPulse = () => <span className=\"animate-pulse\" />;\n"
expect_gate_outcome fail check-no-dot-indicators.sh "a pulsing indicator"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const plantedCircle = () => <svg><circle r=\"3\" /></svg>;\n"
expect_gate_outcome fail check-no-dot-indicators.sh "an SVG circle in the window's markup"; unplant
plant src/styles/zz_planted.css '.planted::before { content: \"\xE2\x97\x8F\"; }\n'
expect_gate_outcome fail check-no-dot-indicators.sh "a bullet glyph in a stylesheet"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}import { CircleAlert } from \"lucide-react\";\nexport const plantedIcon = CircleAlert;\n"
expect_gate_outcome fail check-no-dot-indicators.sh "a round status icon"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const plantedSpinner = () => <span className=\"size-3.5 animate-spin\" />;\n"
expect_gate_outcome pass check-no-dot-indicators.sh "a spinner, which is not a dot"; unplant

plant src/views/zz_planted.tsx "${SOURCE_HEADER}import { Button } from \"@/components/ui/button\";\nexport const PlantedScreen = () => <Button>Planted</Button>;\n"
expect_gate_outcome fail check-window-design-system.sh "a screen importing a shadcn component"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}import { Toggle } from \"../components/ui/toggle\";\nexport const PlantedScreen = Toggle;\n"
expect_gate_outcome fail check-window-design-system.sh "a screen importing a shadcn component by a relative path"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}import { Menu } from \"@base-ui/react/menu\";\nexport const PlantedScreen = Menu.Root;\n"
expect_gate_outcome fail check-window-design-system.sh "a screen importing base-ui directly"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const PlantedScreen = () => <button type=\"button\">Planted</button>;\n"
expect_gate_outcome fail check-window-design-system.sh "a raw button in a screen"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const PlantedScreen = () => (\n  <input\n    value=\"planted\"\n  />\n);\n"
expect_gate_outcome fail check-window-design-system.sh "a raw input in a screen, its attributes on the lines below"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const PlantedScreen = () => <select><option>Planted</option></select>;\n"
expect_gate_outcome fail check-window-design-system.sh "a raw select in a screen"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const PlantedScreen = () => <textarea />;\n"
expect_gate_outcome fail check-window-design-system.sh "a raw textarea in a screen"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}export const PlantedScreen = () => <div role=\"radiogroup\"><span role=\"radio\" aria-checked /></div>;\n"
expect_gate_outcome fail check-window-design-system.sh "a hand-built radio role in a screen"; unplant
plant src/views/zz_planted.tsx "${SOURCE_HEADER}import { ActionButton } from \"../design_system/action_button\";\nexport const PlantedScreen = () => <ActionButton onPressed={() => {}}>Planted</ActionButton>;\n"
expect_gate_outcome pass check-window-design-system.sh "a screen composed from the design system"; unplant
plant src/views/zz_planted.test.tsx "${SOURCE_HEADER}export const plantedTestMarkup = () => <button type=\"button\">Planted</button>;\n"
expect_gate_outcome pass check-window-design-system.sh "a raw button in a window test"; unplant
plant src/design_system/zz_planted.tsx "${SOURCE_HEADER}import { Button } from \"@/components/ui/button\";\nexport const PlantedControl = () => <Button>Planted</Button>;\n"
expect_gate_outcome pass check-window-design-system.sh "the design system built on a shadcn component"; unplant
plant src/components/ui/zz-planted.tsx "export const PlantedDot = () => <span className=\"size-2 rounded-full bg-border\" />;\n"
expect_gate_outcome pass check-no-dot-indicators.sh "a round shape inside a shadcn component, a control's part"; unplant

plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}export const plantedPlatform = process.platform;\n"
expect_gate_outcome fail check-platform-cfg-confinement.sh "a process.platform read in the main process outside platform/"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}import os from \"node:os\";\nexport const plantedPlatform = os.platform();\n"
expect_gate_outcome fail check-platform-cfg-confinement.sh "an os.platform() call in the main process outside platform/"; unplant
plant src-electron/src/platform/zz_planted.ts "${SOURCE_HEADER}export const plantedPlatform = process.platform;\n"
expect_gate_outcome pass check-platform-cfg-confinement.sh "a process.platform read inside src-electron/src/platform/"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}// process.platform differs here, so the platform layer decides\nexport const plantedValue = 1;\n"
expect_gate_outcome pass check-platform-cfg-confinement.sh "process.platform named in a comment"; unplant

plant src/zz_planted.ts "${SOURCE_HEADER}console.log(\"planted\");\n"
expect_gate_outcome fail check-no-print-debugging.sh "a console.log in the window"; unplant
plant src/zz_planted.ts "${SOURCE_HEADER}console.table([1]);\n"
expect_gate_outcome fail check-no-print-debugging.sh "a console.table in the window"; unplant
plant src/zz_planted.ts "${SOURCE_HEADER}export function planted(): void {\n  debugger;\n}\n"
expect_gate_outcome fail check-no-print-debugging.sh "a debugger statement in the window"; unplant
plant src/zz_planted.test.ts "${SOURCE_HEADER}console.log(\"planted\");\n"
expect_gate_outcome pass check-no-print-debugging.sh "a console.log in a window test"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}console.error(\"planted\");\n"
expect_gate_outcome fail check-no-print-debugging.sh "a console.error in the main process"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}process.stderr.write(\"planted\");\n"
expect_gate_outcome fail check-no-print-debugging.sh "a standard error write in the main process outside its log"; unplant

plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}import { app } from \"electron\";\nexport const plantedApp = app;\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "an electron import outside the adapters"; unplant
plant src-electron/src/zz_planted.test.ts "${SOURCE_HEADER}import { app } from 'electron';\nexport const plantedApp = app;\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "an electron import in a main-process test"; unplant
plant src-electron/src/electron_adapters/zz_planted.ts "${SOURCE_HEADER}import { app } from \"electron\";\nexport const plantedApp = app;\n"
expect_gate_outcome pass check-electron-typescript-forms.sh "an electron import inside the adapters"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}export const planted = JSON.parse(\"1\") as number;\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "an as cast in shipped main-process code"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}export const planted: any = 1;\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "an any type in shipped main-process code"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}export const planted = [1].find(Boolean)!.toFixed();\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "a non-null assertion in shipped main-process code"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}export function planted(): void {\n  throw new Error(\"planted\");\n}\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "a throw in shipped main-process code"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}import { readFileSync } from \"node:fs\";\nexport const planted = readFileSync(\"/dev/null\");\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "a blocking Sync call in shipped main-process code"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}export const planted = Date.now();\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "wall-clock time in shipped main-process code"; unplant
plant src-electron/src/zz_planted.test.ts "${SOURCE_HEADER}import { test } from \"vitest\";\ntest.only(\"planted\", () => {});\n"
expect_gate_outcome fail check-electron-typescript-forms.sh "a focused main-process test"; unplant
plant src-electron/src/zz_planted.ts "${SOURCE_HEADER}// planted: as Error, throw, Date.now() and electron in a comment\nexport const planted = [\"as a string\", \"throw it\"] as const;\n"
expect_gate_outcome pass check-electron-typescript-forms.sh "the forms named only in a comment, a string and as const"; unplant
plant src-electron/src/zz_planted.test.ts "${SOURCE_HEADER}import { readFileSync } from \"node:fs\";\nexport const planted = readFileSync(\"/dev/null\") as Buffer;\n"
expect_gate_outcome pass check-electron-typescript-forms.sh "a Sync call and a cast in a main-process test"; unplant


if scripts/check-conventional-pr-title.sh "feat(window): planted" 2>/dev/null; then echo "ok   conventional title pass"; else echo "FAIL conventional title rejected a good title"; failures=$((failures + 1)); fi
if scripts/check-conventional-pr-title.sh "Planted a thing" 2>/dev/null; then echo "FAIL conventional title accepted a bad title"; failures=$((failures + 1)); else echo "ok   conventional title fail"; fi

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
echo "all source-gate cases passed"
