// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Renders every storyboard frame (src/storyboard/frames.json) to public/storyboard/<id>.jpg
// from the running prototype. Usage: node scripts/storyboard.mjs [--scale=2] [--out=dir] [frame-id …]
// --scale renders at that device pixel ratio as PNG (for review at full sharpness).
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const root = path.resolve(import.meta.dirname, "..")
const { flows } = JSON.parse(readFileSync(path.join(root, "src/storyboard/frames.json"), "utf8"))
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const scale = Number(flag("scale") ?? 1)
const only = new Set(args.filter((a) => !a.startsWith("--")))
const base = process.env.PROTOTYPE_URL ?? "http://localhost:5199"
const outDir = flag("out") ? path.resolve(flag("out")) : path.join(root, "public/storyboard")
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: process.env.PROTOTYPE_CHROME_CHANNEL ?? "chrome" })
let failures = 0
for (const flow of flows) {
  for (const frame of flow.frames) {
    if (only.size && !only.has(frame.id)) continue
    const [width, height] = frame.viewport ?? [1440, 900]
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    const theme = frame.dark ? "dark" : "light"
    const url = `${base}${frame.route}${frame.route.includes("?") ? "&" : "?"}theme=${theme}`
    await page.goto(url, { waitUntil: "networkidle" })
    await page.waitForTimeout(1600)
    mkdirSync(path.dirname(path.join(outDir, frame.id)), { recursive: true })
    if (scale > 1) await page.screenshot({ path: path.join(outDir, `${frame.id}@${scale}x.png`), type: "png" })
    else await page.screenshot({ path: path.join(outDir, `${frame.id}.jpg`), type: "jpeg", quality: 84 })
    await page.close()
    if (errors.length) {
      failures++
      console.error(`✗ ${frame.id}: ${errors[0]}`)
    } else {
      console.log(`✓ ${frame.id}`)
    }
  }
}
await browser.close()
process.exit(failures ? 1 : 0)
