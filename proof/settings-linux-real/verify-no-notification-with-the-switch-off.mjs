// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// With When a stream fails switched off in the window, the same real failure must reach dunst with nothing from the
// app; the switch is turned back on at the end. Usage (as ada, in the container): node verify-no-notification-with-the-switch-off.mjs
import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";
import { chromium } from "../../docs/design/node_modules/playwright/index.mjs";

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
const appNotificationsInDunst = () => {
  run("dunstctl", "close-all");
  return JSON.parse(run("dunstctl", "history")).data.flat().filter((entry) => entry.appname.data === "tatolab-app").length;
};
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));

run(tatolab, "start", "fails-at-start");
await page.click('[data-window-navigation="settings"]');
await page.click('[data-settings-section="general"]');
await page.click('[data-settings-switch="stream-failure-notifications"]');
await page.waitForTimeout(1500);
const switchedTo = await page.locator('[data-settings-switch="stream-failure-notifications"]').getAttribute("aria-checked");
const remembered = run("cat", `${process.env.HOME}/.config/com.tatolab.tatolab/stream-failure-notifications.json`);
const before = appNotificationsInDunst();
await page.click('[data-settings-section="runtime"]');
await page.waitForTimeout(2000);
renameSync(`${project}/.venv`, `${project}/.venv-moved-aside`);
await page.click('[data-runtime-action="restart"]');
for (let attempt = 0; attempt < 60 && streamState() !== "failed"; attempt++) await page.waitForTimeout(500);
const failedState = streamState();
await page.waitForTimeout(6000);
const after = appNotificationsInDunst();
console.log(`${failedState === "failed" && switchedTo === "false" && after === before ? "PASS" : "FAIL"} With the switch off, a real failure notifies nothing`);
console.log(`     switch ${switchedTo}; remembered ${remembered.replace(/\s+/g, "")}; runtime lists ${failedState}; the app's notifications in dunst ${before} → ${after}`);
renameSync(`${project}/.venv-moved-aside`, `${project}/.venv`);
run(tatolab, "start", "fails-at-start");
await page.click('[data-settings-section="general"]');
await page.click('[data-settings-switch="stream-failure-notifications"]');
await page.waitForTimeout(1000);
console.log(`     switch back on: ${await page.locator('[data-settings-switch="stream-failure-notifications"]').getAttribute("aria-checked")}`);
await browser.close();
