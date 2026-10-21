// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Usage: node scripts/shot.mjs <path> <out.png> [--light] [--width=1440] [--height=900] [--full]
import { chromium } from "playwright"

const [, , route = "/", out = "shot.png", ...flags] = process.argv
const opt = (name, fallback) => {
  const f = flags.find((x) => x.startsWith(`--${name}=`))
  return f ? Number(f.split("=")[1]) : fallback
}
const theme = flags.includes("--dark") ? "dark" : "light"
const base = process.env.PROTOTYPE_URL ?? "http://localhost:5199"
const url = `${base}${route}${route.includes("?") ? "&" : "?"}theme=${theme}`

const browser = await chromium.launch({ channel: process.env.PROTOTYPE_CHROME_CHANNEL ?? "chrome" })
const page = await browser.newPage({
  viewport: { width: opt("width", 1440), height: opt("height", 900) },
  deviceScaleFactor: opt("scale", 1),
})
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
await page.goto(url, { waitUntil: "networkidle" })
if (flags.includes("--full")) {
  await page.addStyleTag({ content: ".h-screen,.h-svh,[data-slot=sidebar-wrapper]{height:auto!important;min-height:100vh;overflow:visible!important} [data-slot=sidebar-inset],main{overflow:visible!important}" })
}
await page.waitForTimeout(opt("wait", 900))
await page.screenshot({ path: out, fullPage: flags.includes("--full") })
await browser.close()
if (errors.length) console.error("page errors:\n" + errors.join("\n"))
console.log(out)
