// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Shoots the unpackaged app's Streams list over the DevTools protocol on port 9333, in light and then dark, at an
// emulated 1240×780 viewport. Usage: node shoot-the-streams-list-over-devtools.mjs <folder>
import { chromium } from "/playwright-driver/node_modules/playwright/index.mjs";

const [, , outputFolder] = process.argv;
const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));
await page.setViewportSize({ width: 1240, height: 780 });
await page.getByText("loaded on", { exact: false }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);
console.log("the window's page:", page.url());
console.log((await page.locator("main").innerText()).slice(0, 600));
await page.screenshot({ path: `${outputFolder}/linux-01-streams-light.png` });
await page.click("[data-window-theme-toggle]");
await page.waitForTimeout(800);
await page.screenshot({ path: `${outputFolder}/linux-02-streams-dark.png` });
await browser.close();
