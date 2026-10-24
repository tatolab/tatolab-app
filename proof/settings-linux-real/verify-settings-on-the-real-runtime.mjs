// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Drives the app's window over DevTools (port 9333) inside the systemd container, against the real tatolabd.service,
// and checks each Settings claim against what systemd, the runtime's own CLI and the socket table report.
// Usage (as ada, in the container): node verify-settings-on-the-real-runtime.mjs <folder for screenshots>
import { execFileSync } from "node:child_process";
import { chromium } from "../../docs/design/node_modules/playwright/index.mjs";

const [, , outputFolder] = process.argv;
const run = (program, ...programArguments) => {
  try {
    return execFileSync(program, programArguments, { encoding: "utf8" }).trim();
  } catch (failure) {
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
  }
};
const tatolab = `${process.env.HOME}/.local/bin/tatolab`;
const runtimeLine = () => run(tatolab, "--version").split("\n")[1] ?? "";
const mainPid = () => run("systemctl", "--user", "show", "-p", "MainPID", "--value", "tatolabd.service");
const results = [];
const check = (name, passed, evidence) => {
  results.push({ name, verdict: passed ? "PASS" : "FAIL", evidence });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}\n     ${evidence}`);
};

const browser = await chromium.connectOverCDP("http://localhost:9333");
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith("tatolab-app:"));
await page.setViewportSize({ width: 1240, height: 780 });
const openSection = async (section) => {
  await page.click('[data-window-navigation="settings"]');
  await page.click(`[data-settings-section="${section}"]`);
  await page.waitForTimeout(1200);
};
const statusWords = async () => (await page.textContent("[data-runtime-status-words]"))?.trim() ?? "";

await openSection("runtime");
for (let attempt = 0; attempt < 20 && !(await statusWords()).includes("tatolabd"); attempt++) await page.waitForTimeout(1000);
const shownStatus = await statusWords();
const runtimeSays = runtimeLine();
const runtimeVersion = /^runtime (\S+) /.exec(runtimeSays)?.[1];
check("Status names the runtime's own version", runtimeVersion !== undefined && shownStatus.startsWith(`Running · tatolabd ${runtimeVersion} · up`), `window "${shownStatus}"; tatolab --version: "${runtimeSays}"`);
await page.screenshot({ path: `${outputFolder}/21-linux-real-runtime.png` });

const socketShown = (await page.locator("code", { hasText: "local-api.sock" }).first().textContent())?.trim();
const pidBeforeRestart = mainPid();
const listening = run("ss", "-xlpn").split("\n").filter((line) => line.includes(socketShown ?? "\u0000"));
check("The socket shown is the one the runtime listens on", listening.some((line) => line.includes(`pid=${pidBeforeRestart},`)), `shown ${socketShown}; ss: ${listening.join(" | ") || "nothing listening there"}`);

const logFolderShown = (await page.locator('[data-settings-row="runtime-logs"] code').first().textContent())?.trim();
const ownLogFiles = logFolderShown ? run("bash", "-c", `ls "${logFolderShown}" | grep -c '^tatolabd-.*\\.jsonl$'`) : "0";
await page.click('[data-runtime-action="open-logs-folder"]');
await page.waitForTimeout(3000);
const fileManagerWindows = `${run("xdotool", "search", "--onlyvisible", "--class", "pcmanfm", "getwindowname", "%@")} · opened with: ${run("ps", "-o", "args=", "-C", "pcmanfm")}`;
check("Open logs folder opens the folder the runtime names", logFolderShown !== undefined && fileManagerWindows.includes(`pcmanfm ${logFolderShown}`) && Number(ownLogFiles) > 0, `shown ${logFolderShown}, holding ${ownLogFiles} tatolabd-*.jsonl; file manager windows: ${fileManagerWindows || "none"}`);

await page.waitForTimeout(61_000);
await openSection("general");
await openSection("runtime");
const uptimeBefore = runtimeLine();
const statusBefore = await statusWords();
await page.click('[data-runtime-action="restart"]');
const statusWordsSeen = [statusBefore];
for (let attempt = 0; attempt < 150 && !statusWordsSeen.at(-1).includes("less than a minute"); attempt++) {
  await page.waitForTimeout(150);
  const statusNow = await statusWords();
  if (statusNow !== statusWordsSeen.at(-1)) statusWordsSeen.push(statusNow);
  if (statusNow === "Starting") await page.screenshot({ path: `${outputFolder}/22-linux-real-runtime-restarting.png` });
}
const pidAfterRestart = mainPid();
const uptimeAfter = runtimeLine();
const journal = run("journalctl", "--user", "-u", "tatolabd.service", "--no-pager", "-n", "8", "-o", "cat");
check(
  "Restart runtime restarts tatolabd.service and the state follows",
  pidAfterRestart !== pidBeforeRestart && statusWordsSeen.includes("Starting") && statusWordsSeen.at(-1).includes("less than a minute") && /up 0d 0h 0m/.test(uptimeAfter),
  `MainPID ${pidBeforeRestart} → ${pidAfterRestart}; window ${JSON.stringify(statusWordsSeen)}; runtime "${uptimeBefore}" → "${uptimeAfter}"; journal: ${journal.split("\n").filter((line) => /Stopp|Started|restart/i.test(line)).join(" / ") || journal.split("\n").slice(-3).join(" / ")}`,
);
await page.screenshot({ path: `${outputFolder}/23-linux-real-runtime-after-restart.png` });

await page.click('[data-settings-switch="run-tatolab"]');
await page.waitForTimeout(5000);
const offState = `${run("systemctl", "--user", "is-enabled", "tatolabd.service")}/${run("systemctl", "--user", "is-active", "tatolabd.service")}`;
const statusOff = await statusWords();
const restartDisabledWhileOff = await page.locator('[data-runtime-action="restart"]').isDisabled();
await page.screenshot({ path: `${outputFolder}/24-linux-real-run-tatolab-off.png` });
await page.click('[data-settings-switch="run-tatolab"]');
for (let attempt = 0; attempt < 20 && !(await statusWords()).includes("tatolabd"); attempt++) await page.waitForTimeout(1000);
const onState = `${run("systemctl", "--user", "is-enabled", "tatolabd.service")}/${run("systemctl", "--user", "is-active", "tatolabd.service")}`;
check("Run Tatolab off disables and stops the unit, on enables and starts it", offState === "disabled/inactive" && restartDisabledWhileOff && onState === "enabled/active", `off: ${offState}, window "${statusOff}", Restart disabled ${restartDisabledWhileOff}; on: ${onState}, window "${await statusWords()}"`);

await openSection("command-line");
const commandLineRow = (await page.textContent('[data-settings-row="command-line-tool"]')) ?? "";
const cliVersion = run(tatolab, "--version").split("\n")[0].replace("tatolab ", "");
check("Command line names the tatolab command's path and its own version", commandLineRow.includes(`${process.env.HOME}/.local/bin/tatolab`.replace(process.env.HOME, "~")) && commandLineRow.includes(cliVersion), `row "${commandLineRow.replace(/\s+/g, " ").slice(0, 160)}"; tatolab --version: ${cliVersion}`);
await page.screenshot({ path: `${outputFolder}/25-linux-real-command-line.png` });

await openSection("about");
const aboutVersions = (await page.locator("[data-settings-about] p").first().textContent())?.trim();
check("About names the app's and the runtime's versions", aboutVersions === `Version 0.45.0 · tatolabd ${runtimeVersion}`, `"${aboutVersions}"`);

await openSection("appearance");
await page.click('[data-window-appearance="light"]');
await page.waitForTimeout(300);
await page.click('[data-window-appearance="dark"]');
await page.waitForTimeout(500);
const darkShown = await page.evaluate(() => document.documentElement.classList.contains("dark"));
const darkKept = await page.evaluate(() => localStorage.getItem("tatolab-window-theme"));
await page.reload();
await page.waitForTimeout(3000);
const darkAfterReload = await page.evaluate(() => document.documentElement.classList.contains("dark"));
check("Appearance switches to Dark live and keeps it across a reload of the window", darkShown && darkKept === "dark" && darkAfterReload, `dark class ${darkShown}, stored ${darkKept}, dark after reload ${darkAfterReload}`);
await openSection("appearance");
await page.click('[data-window-appearance="light"]');

console.log(JSON.stringify(results));
await browser.close();
