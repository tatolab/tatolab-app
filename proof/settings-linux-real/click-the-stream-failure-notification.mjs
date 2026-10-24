// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Recovers the kept stream with Retry, fails it again by moving its .venv aside and pressing Restart runtime, waits
// for dunst to draw the app's notification, middle-clicks it (dunst's default "do_action") with a real X click, and
// reads which page the window then shows. Usage (as ada, in the container): node click-the-stream-failure-notification.mjs <folder>
import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";
import { chromium } from "../../docs/design/node_modules/playwright/index.mjs";

const [, , outputFolder] = process.argv;
const run = (program, ...programArguments) => {
  try {
    return execFileSync(program, programArguments, { encoding: "utf8" }).trim();
  } catch (failure) {
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
  }
};
const project = `${process.env.HOME}/streams/fails-at-start`;
const tatolab = `${process.env.HOME}/.local/bin/tatolab`;
const streamState = () => run(tatolab, "streams").split("\n")[1]?.split(/\s+/)[1];
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));

run(tatolab, "start", "fails-at-start");
console.log(`recovered: ${run(tatolab, "streams").split("\n")[1]}`);
await page.click('[data-window-navigation="settings"]');
await page.click('[data-settings-section="runtime"]');
await page.waitForTimeout(3000);
renameSync(`${project}/.venv`, `${project}/.venv-moved-aside`);
await page.click('[data-runtime-action="restart"]');
for (let attempt = 0; attempt < 60 && streamState() !== "failed"; attempt++) await page.waitForTimeout(500);
console.log(`runtime lists: ${run(tatolab, "streams").split("\n")[1]}`);
let dunstWindow = null;
for (let attempt = 0; attempt < 40 && dunstWindow === null; attempt++) {
  for (const windowId of run("xdotool", "search", "--class", "Dunst").split("\n").filter(Boolean)) {
    if (run("xwininfo", "-id", windowId).includes("IsViewable")) dunstWindow = windowId;
  }
  if (dunstWindow === null) await page.waitForTimeout(250);
}
console.log(`dunst window viewable: ${dunstWindow}`);
if (dunstWindow !== null) {
  run("import", "-window", "root", `${outputFolder}/26-linux-real-stream-failure-notification-screen.png`);
  run("xdotool", "mousemove", "--window", dunstWindow, "40", "40", "click", "2");
  await page.waitForTimeout(2500);
  const heading = (await page.locator("[data-stream-page] h1").first().textContent({ timeout: 3000 }).catch(() => null))?.trim();
  const banner = (await page.locator("text=did not re-load at the runtime's start").first().textContent({ timeout: 3000 }).catch(() => null))?.trim();
  console.log(`after the click the window shows stream page: ${heading ?? "none"}; its failure: ${banner ?? "none"}`);
  await page.screenshot({ path: `${outputFolder}/28-linux-real-notification-click-opened-fails-at-start.png` });
}
renameSync(`${project}/.venv-moved-aside`, `${project}/.venv`);
await browser.close();
