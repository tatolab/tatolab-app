// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Shoots the window's mock presets in Chromium, the engine Electron renders the window with,
// at the window's real size, in both themes. Playwright is not one of the app's dependencies: install
// it out of the tree (`npm i --no-save playwright`), then, with `npm run dev` serving on port 1420:
//   node proof/electron-window/shoot-mock-presets-in-chromium.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROOF_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PRESETS = [
  ["01-macos-running-graph", "state=running&stream=main&tab=graph"],
  ["02-macos-running-logs", "state=running&stream=main&tab=logs"],
  ["03-macos-settings", "page=settings"],
  ["04-macos-approval", "state=approval"],
  ["05-macos-setup", "state=missing"],
  ["06-macos-uninstall-sheet", "sheet=uninstall"],
  ["07-macos-uninstalling", "sheet=uninstalling"],
  ["08-macos-unreachable", "state=unreachable"],
  ["09-linux-running-overview", "platform=linux&state=running&stream=main&tab=overview"],
  ["10-linux-settings", "platform=linux&page=settings"],
  ["11-linux-setup-not-found", "platform=linux&state=setup"],
  ["12-linux-stopped", "platform=linux&state=stopped"],
  ["13-linux-search", "platform=linux&state=running&search=main"],
  ["14-macos-empty", "state=empty"],
  ["15-macos-loading", "state=loading"],
  ["16-macos-node-error", "state=node-error&stream=main&tab=graph"],
  ["17-macos-starting", "state=starting"],
  ["18-macos-not-listed", "state=not-listed"],
  ["19-macos-logs-errors-only", "state=running&stream=main&tab=logs&levels=errors"],
  ["20-macos-uninstalled", "sheet=uninstalled", 8000],
  ["21-macos-uninstall-refused", "sheet=uninstalling&uninstall=cancel", 6000],
  ["22-linux-uninstall-sheet", "platform=linux&sheet=uninstall"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1040, height: 700 } });
for (const [imageName, presetQuery, settleMilliseconds = 2500] of MOCK_PRESETS) {
  for (const theme of ["light", "dark"]) {
    await page.goto(`http://localhost:1420/?theme=${theme}&${presetQuery}`);
    await page.waitForTimeout(settleMilliseconds);
    await page.screenshot({ path: path.join(PROOF_DIRECTORY, `${imageName}-${theme}.png`) });
  }
}
console.log(`Chromium ${browser.version()}`);
await browser.close();
