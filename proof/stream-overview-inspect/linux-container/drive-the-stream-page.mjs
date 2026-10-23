// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Drives the unpackaged app in the Linux container through a stream's page: main's Overview and
// Inspect in light and dark, main stopped from its header (its steps as of the last load), the
// failed lobby-recorder's banner, and Terminal pressed before and after xterm installs
// x-terminal-emulator, capturing the whole screen with ImageMagick's import so openbox's
// decorations show. Usage: node drive-the-stream-page.mjs <repository> <output directory>
import { execFileSync } from "node:child_process";
import { mkdirSync, readlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`${process.env.NODE_PATH}/`);
const { _electron: electron } = require("playwright");
const [repositoryRoot, outputDirectory] = process.argv.slice(2);

const app = await electron.launch({ cwd: repositoryRoot, executablePath: `${repositoryRoot}/node_modules/electron/dist/electron`, args: [".", "--no-sandbox"] });
const page = await app.firstWindow();
const captureTheScreen = (imageName) => execFileSync("import", ["-window", "root", `${outputDirectory}/${imageName}.png`]);

try {
  await page.waitForSelector('[data-stream-row="main"]', { timeout: 60000 });
  await page.click('[data-stream-row="main"]');
  await page.waitForSelector("[data-stream-step]", { timeout: 30000 });
  await page.waitForTimeout(1500);
  captureTheScreen("linux-01-main-overview-light");
  await page.click("[data-window-theme-toggle]");
  await page.waitForTimeout(600);
  captureTheScreen("linux-02-main-overview-dark");
  await page.click('[data-stream-page-header] [data-stream-tab="inspect"]');
  await page.waitForSelector("[data-graph-document-view='raw']", { timeout: 30000 });
  await page.waitForTimeout(600);
  captureTheScreen("linux-03-main-inspect-dark");
  await page.click("[data-window-theme-toggle]");
  await page.click('[data-stream-page-header] [data-stream-tab="overview"]');
  await page.click('[data-stream-page-header] [data-stream-action="stop_stream"]');
  await page.getByText("Stopped, so nothing to preview").waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  captureTheScreen("linux-04-main-stopped-steps-as-of-the-last-load");
  await page.click('nav[aria-label="Tatolab"] a[href="/streams/lobby-recorder"]');
  await page.waitForSelector("[data-failed-stream-banner]", { timeout: 30000 });
  await page.waitForTimeout(600);
  captureTheScreen("linux-05-lobby-recorder-failed");

  // The stand-in lists lobby-recorder's project here; the app opens a terminal only in a folder that exists.
  mkdirSync("/root/streams/lobby-recorder", { recursive: true });
  await page.click('[data-stream-action="open_terminal_at_stream_project"]');
  await page.locator("[data-stream-page-header] [role=alert]").waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
  captureTheScreen("linux-06-terminal-refused-without-x-terminal-emulator");

  execFileSync("apt-get", ["install", "-y", "-qq", "xterm"], { stdio: "ignore" });
  await page.click('[data-stream-action="open_terminal_at_stream_project"]');
  await page.waitForTimeout(3000);
  const xtermProcessIds = execFileSync("pgrep", ["-x", "xterm"], { encoding: "utf8" }).trim().split("\n");
  const xtermFolders = xtermProcessIds.map((processId) => `xterm ${processId} cwd ${readlinkSync(`/proc/${processId}/cwd`)}`);
  writeFileSync(`${outputDirectory}/linux-07-terminal-opened-with-xterm.txt`, `${xtermFolders.join("\n")}\n`);
  captureTheScreen("linux-07-terminal-opened-with-xterm");
  // The terminal the app started outlives it, and would hold the container open.
  execFileSync("pkill", ["-x", "xterm"]);
} catch (failure) {
  captureTheScreen("linux-failed-step");
  process.stderr.write(`${failure}\n--- the window's text ---\n${await page.locator("body").innerText()}\n`);
  await app.close();
  process.exit(1);
}
await app.close();
