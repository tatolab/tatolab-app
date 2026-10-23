// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Shoots each React screen of the mock window before and after #51 in Chromium, the engine Electron
// renders the window with, at 1440×900, in both themes. Playwright is not one of the app's
// dependencies: install it out of the tree (its browser, or `executablePath` set to a Chromium on
// the machine). Serve main's window with `npx vite --port 1421` from a
// worktree of origin/main, and this branch's with `npm run dev` on 1420, then:
//   node proof/design-system/shoot-before-and-after-in-chromium.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROOF_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), "mock");
const WINDOW_SERVERS = [
  ["before", "http://localhost:1421/"],
  ["after", "http://localhost:1420/"],
];
const MOCK_PRESETS = [
  ["01-macos-streams-list", "state=running"],
  ["02-macos-overview", "state=running&stream=main&tab=overview"],
  ["03-macos-overview-failed-stream", "state=running&stream=lobby-recorder&tab=overview"],
  ["04-macos-graph-step-selected", "state=running&stream=main&tab=graph&step=brightnessmeter"],
  ["05-macos-graph-step-in-error", "state=node-error&stream=main&tab=graph&step=displaywindow"],
  ["06-macos-logs-record-selected", "state=running&stream=main&tab=logs&record=problem"],
  ["07-macos-logs-step-menu-open", "state=running&stream=main&tab=logs&only_step=brightnessmeter&step_menu=open"],
  ["08-macos-logs-not-loaded", "state=running&stream=lobby-recorder&tab=logs"],
  ["09-macos-inspect-raw", "state=running&stream=main&tab=inspect"],
  ["10-macos-inspect-tree", "state=running&stream=main&tab=inspect&inspect=tree"],
  ["11-macos-remove-dialog", "state=running&remove=pattern-two"],
  ["12-macos-streams-empty", "state=empty"],
  ["13-linux-logs-record-selected", "platform=linux&state=running&stream=main&tab=logs&record=problem"],
];
/** This branch's frames of what only it has: keyboard focus at the ring token's strength, and the side panel dragged wider. */
const AFTER_ONLY_FRAMES = [
  [
    "14-macos-logs-levels-keyboard-focus",
    "state=running&stream=main&tab=logs",
    async (page) => {
      await page.locator("[data-stream-log-search]").focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("ArrowRight");
    },
  ],
  [
    "15-macos-logs-details-dragged-wider",
    "state=running&stream=main&tab=logs&record=problem",
    async (page) => {
      const resizerBox = await page.getByRole("separator", { name: "Resize the side panel" }).boundingBox();
      if (resizerBox === null) return;
      await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(resizerBox.x - 180, resizerBox.y + resizerBox.height / 2, { steps: 12 });
      await page.mouse.up();
    },
  ],
];
const SETTLE_MILLISECONDS = 2500;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [imageName, presetQuery] of MOCK_PRESETS) {
  for (const [serverName, serverUrl] of WINDOW_SERVERS) {
    for (const theme of ["light", "dark"]) {
      await page.goto(`${serverUrl}?theme=${theme}&${presetQuery}`);
      await page.waitForTimeout(SETTLE_MILLISECONDS);
      await page.screenshot({ path: path.join(PROOF_DIRECTORY, `${imageName}-${theme}-${serverName}.png`) });
    }
  }
}
for (const [imageName, presetQuery, driveThePage] of AFTER_ONLY_FRAMES) {
  for (const theme of ["light", "dark"]) {
    await page.goto(`${WINDOW_SERVERS[1][1]}?theme=${theme}&${presetQuery}`);
    await page.waitForTimeout(SETTLE_MILLISECONDS);
    await driveThePage(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(PROOF_DIRECTORY, `${imageName}-${theme}-after.png`) });
  }
}
console.log(`Chromium ${browser.version()}`);
await browser.close();
