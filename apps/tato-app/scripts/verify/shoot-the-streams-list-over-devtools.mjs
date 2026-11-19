// Shoots the unpackaged app's Streams list over the DevTools protocol on port 9333: it opens the recent
// project <project> from the Projects window, and shoots its Studio window's Outliner listing the
// project's streams (the Outliner is a view, in its own frame), then the graph of <stream>, at an emulated 1440×900 viewport.
// Usage: node shoot-the-streams-list-over-devtools.mjs <folder> <project> <stream>
import { chromium } from "playwright";

const [, , outputFolder, projectName, streamName] = process.argv;
const browser = await chromium.connectOverCDP("http://localhost:9333");
const context = browser.contexts()[0];
const projectsWindow = context.pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));
await projectsWindow.getByText(projectName, { exact: true }).first().waitFor({ timeout: 60_000 });
const x11Warning = projectsWindow.getByRole("button", { name: "OK" });
if ((await x11Warning.count()) > 0) await x11Warning.first().click();
const studioWindowOpened = context.waitForEvent("page");
await projectsWindow.getByText(projectName, { exact: true }).first().dblclick();
const studioWindow = await studioWindowOpened;
await studioWindow.setViewportSize({ width: 1440, height: 900 });
await studioWindow.waitForFunction(() => document.querySelector('iframe[src*="core_views/outliner/"]') !== null, null, { timeout: 60_000 });
const outliner = studioWindow.frameLocator('iframe[src*="core_views/outliner/"]').locator("[data-outliner]");
await outliner.getByText(streamName, { exact: true }).waitFor({ timeout: 60_000 });
const streamFailureNotice = studioWindow.locator("[data-open-project-stream-failure]");
await studioWindow.waitForTimeout(1500);
for (const dismiss of await streamFailureNotice.getByRole("button", { name: /dismiss|close/i }).all()) await dismiss.click();
console.log("the Outliner lists:", (await outliner.innerText()).replaceAll("\n", " | ").slice(0, 400));
await studioWindow.screenshot({ path: `${outputFolder}/linux-01-streams-listed.png` });
await outliner.getByText(streamName, { exact: true }).dblclick();
await studioWindow.waitForTimeout(2500);
await studioWindow.screenshot({ path: `${outputFolder}/linux-02-stream-graph.png` });
await browser.close();
