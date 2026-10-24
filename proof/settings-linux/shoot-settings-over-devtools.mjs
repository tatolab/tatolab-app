// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Drives the app's window over the DevTools protocol on port 9333 and shoots Settings' Runtime before and after
// Restart runtime, the Starting it reads through the restart, General, and Command line. Usage: node shoot-settings-over-devtools.mjs <folder>
import { chromium } from "../../docs/design/node_modules/playwright/index.mjs";

const [, , outputFolder] = process.argv;
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));
await page.setViewportSize({ width: 1240, height: 780 });
const openSection = async (section) => {
  await page.click('[data-window-navigation="settings"]');
  await page.click(`[data-settings-section="${section}"]`);
  await page.waitForTimeout(1500);
};
const statusWords = async () => (await page.textContent("[data-runtime-status-words]"))?.trim();

await openSection("runtime");
console.log("before restart:", await statusWords());
await page.screenshot({ path: `${outputFolder}/24-linux-container-runtime.png` });
await page.waitForTimeout(61_000);
await openSection("general");
await openSection("runtime");
console.log("a minute on:", await statusWords());
await page.click('[data-runtime-action="restart"]');
const statusWordsSeen = [await statusWords()];
let startingWasShot = false;
for (let attempt = 0; attempt < 120 && !statusWordsSeen.at(-1)?.includes("less than a minute"); attempt++) {
  await page.waitForTimeout(150);
  const statusWordsNow = await statusWords();
  if (statusWordsNow !== statusWordsSeen.at(-1)) statusWordsSeen.push(statusWordsNow);
  if (statusWordsNow === "Starting" && !startingWasShot) {
    await page.screenshot({ path: `${outputFolder}/25-linux-container-runtime-restarting-starting.png` });
    startingWasShot = true;
  }
}
console.log("status words through the restart:", JSON.stringify(statusWordsSeen));
await page.screenshot({ path: `${outputFolder}/26-linux-container-runtime-after-restart-runtime.png` });
await openSection("general");
await page.screenshot({ path: `${outputFolder}/27-linux-container-general.png` });
await openSection("command-line");
await page.screenshot({ path: `${outputFolder}/28-linux-container-command-line.png` });
await browser.close();
