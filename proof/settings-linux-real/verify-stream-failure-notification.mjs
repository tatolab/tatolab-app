// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// A kept stream whose .venv is gone fails at the real runtime's start: Restart runtime is pressed in the window, the
// notification is read from dunst's history, clicked with a real X click on dunst's window, and the window must then
// show that stream's page. Usage (as ada, in the container): node verify-stream-failure-notification.mjs <folder>
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
const streamState = () => run(`${process.env.HOME}/.local/bin/tatolab`, "streams").split("\n")[1]?.split(/\s+/)[1];
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));

await page.click('[data-window-navigation="settings"]');
await page.click('[data-settings-section="general"]');
const notificationsOn = await page.locator('[data-settings-switch="stream-failure-notifications"]').getAttribute("aria-checked");
await page.click('[data-settings-section="runtime"]');
renameSync(`${project}/.venv`, `${project}/.venv-moved-aside`);
run("dunstctl", "history-clear");
await page.click('[data-runtime-action="restart"]');
for (let attempt = 0; attempt < 60 && streamState() !== "failed"; attempt++) await page.waitForTimeout(500);
await page.waitForTimeout(4000);
const failedListing = run(`${process.env.HOME}/.local/bin/tatolab`, "streams");
const shown = run("dunstctl", "history");
const notificationsShown = JSON.parse(shown).data.flat().map((entry) => `${entry.summary.data}: ${entry.body.data}`);
console.log(`notifications switch: ${notificationsOn}`);
console.log(`runtime lists: ${failedListing.replace(/\s+/g, " ")}`);
console.log(`dunst shown: ${JSON.stringify(notificationsShown)}`);
renameSync(`${project}/.venv-moved-aside`, `${project}/.venv`);
await browser.close();
