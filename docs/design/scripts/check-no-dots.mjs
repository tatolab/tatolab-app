// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Owner rule: no dot indicators anywhere — no coloured status dots, badge dots, pulsing dots,
// bullet dots, or circular port handles. Status is a word, and a problem is an icon.
// Canvas scenes (src/components/live) draw video content, and shadcn's form controls
// (src/components/ui: switch knob, slider thumb, radio) are controls, not indicators.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "../src")
const banned = [
  [/rounded-full[^"`]*\bsize-(0\.5|1|1\.5|2|2\.5|3)\b/, "small rounded-full element (a dot)"],
  [/\bsize-(0\.5|1|1\.5|2|2\.5|3)\b[^"`]*rounded-full/, "small rounded-full element (a dot)"],
  [/^(?=.*rounded-full)(?=.*\bw-(0\.5|1|1\.5|2|2\.5|3)\b)(?=.*\bh-(0\.5|1|1\.5|2|2\.5|3)\b)/, "small rounded-full element (a dot)"],
  [/animate-(ping|pulse|breathe)/, "pulsing indicator"],
  [/<circle\b/, "SVG circle in UI markup"],
  [/[•●◉⬤]/, "bullet glyph"],
  [/\b(OctagonX|OctagonAlert|CircleX|XCircle|CircleAlert|AlertCircle|CircleDot|CircleSlash|CirclePlay|CirclePause|CircleStop)\b/, "round status icon (reads as a dot) — use TriangleAlert / SquareX"],
]
const failures = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (full.endsWith(`${path.sep}live`) || full.endsWith(`${path.sep}ui`)) continue
      walk(full)
    } else if (/\.(tsx|ts|css)$/.test(name)) {
      readFileSync(full, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const [re, why] of banned) if (re.test(line)) failures.push(`${path.relative(root, full)}:${i + 1}  ${why}\n    ${line.trim()}`)
        })
    }
  }
}
walk(root)
if (failures.length) {
  console.error(`No dot indicators — ${failures.length} found:\n` + failures.join("\n"))
  process.exit(1)
}
console.log("no dot indicators")
