// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Drives the unpackaged app in the Linux container: the Streams list in both themes, then Stop,
// Start and a refused Retry on the stand-in's recorded answers, capturing the whole screen with
// ImageMagick's import so openbox's decorations and the tray show. Usage: node drive-the-window.mjs <repository> <output directory>
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(`${process.env.NODE_PATH}/`);
const { _electron: electron } = require("playwright");
const [repositoryRoot, outputDirectory] = process.argv.slice(2);

const app = await electron.launch({ cwd: repositoryRoot, executablePath: `${repositoryRoot}/node_modules/electron/dist/electron`, args: [".", "--no-sandbox"] });
const page = await app.firstWindow();
const captureTheScreen = (imageName) => execFileSync("import", ["-window", "root", `${outputDirectory}/${imageName}.png`]);
const row = (streamName) => page.locator(`[data-stream-row="${streamName}"]`);

const showWhatTheWindowShowsAndQuit = async (failure) => {
  captureTheScreen("linux-failed-step");
  process.stderr.write(`${failure}\n--- the window's text ---\n${await page.locator("body").innerText()}\n`);
  await app.close();
  process.exit(1);
};
try {
await page.waitForSelector('[data-stream-row="main"]', { timeout: 60000 });
await page.waitForTimeout(2000);
captureTheScreen("linux-01-streams-light");
await page.click("[data-window-theme-toggle]");
await page.waitForTimeout(600);
captureTheScreen("linux-02-streams-dark");
await page.click("[data-window-theme-toggle]");

await row("main").locator('[data-stream-action="stop_stream"]').click();
await row("main").getByText("Stopped", { exact: true }).waitFor({ timeout: 30000 });
await page.waitForTimeout(400);
captureTheScreen("linux-03-main-stopped");
await row("pattern-two").locator('[data-stream-action="start_stream"]').click();
await row("pattern-two").getByText("Running", { exact: true }).waitFor({ timeout: 30000 });
await row("lobby-recorder").locator('[data-stream-action="start_stream"]').click();
await row("lobby-recorder").getByRole("alert").waitFor({ timeout: 30000 });
await page.waitForTimeout(400);
captureTheScreen("linux-04-pattern-two-started-lobby-recorder-retry-refused");
} catch (failure) {
  await showWhatTheWindowShowsAndQuit(failure);
}
await app.close();
