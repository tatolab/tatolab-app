// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Throwaway spike for tatolab/tatolab-app#12: Electron's own SMAppService wrapper, and a Chromium
// window on the runtime's preview page and on a stock @moq/watch player. Never shipped.
//
//   --registration=status|register|unregister|status-of-a-missing-agent
//       prints one JSON line with what app.getLoginItemSettings({type:'agentService'}) reads back
//   --window=registration | --window=<http URL> | --window=stock-player?url=<relay>&name=<broadcast>
//       opens the window on that page (registration shows the four readbacks)

const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const fs = require("node:fs");
const bundleLaunchAgentsDirectory = path.join(path.dirname(process.execPath), "..", "Library", "LaunchAgents");
const runtimeLaunchAgentPlistName = (() => {
  try {
    return fs.readdirSync(bundleLaunchAgentsDirectory).find((name) => name.endsWith(".plist")) ?? "com.tatolab.tatolabd.plist";
  } catch {
    return "com.tatolab.tatolabd.plist";
  }
})();
const missingLaunchAgentPlistName = "com.tatolab.no-such-agent.plist";

function argumentValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function agentServiceReadback(serviceName) {
  const settings = app.getLoginItemSettings({ type: "agentService", serviceName });
  return { serviceName, status: settings.status, openAtLogin: settings.openAtLogin };
}

function runRegistrationAction(action) {
  const before = agentServiceReadback(runtimeLaunchAgentPlistName);
  let thrown;
  try {
    if (action === "register") {
      app.setLoginItemSettings({ openAtLogin: true, type: "agentService", serviceName: runtimeLaunchAgentPlistName });
    } else if (action === "unregister") {
      app.setLoginItemSettings({ openAtLogin: false, type: "agentService", serviceName: runtimeLaunchAgentPlistName });
    }
  } catch (error) {
    thrown = String(error);
  }
  const after = action === "status-of-a-missing-agent"
    ? agentServiceReadback(missingLaunchAgentPlistName)
    : agentServiceReadback(runtimeLaunchAgentPlistName);
  return { electron: process.versions.electron, chrome: process.versions.chrome, action, before, after, thrown };
}

function registrationPageUrl() {
  const rows = [
    agentServiceReadback(runtimeLaunchAgentPlistName),
    agentServiceReadback(missingLaunchAgentPlistName),
  ];
  const html = `<!doctype html><meta charset="utf-8"><title>Tatolab (Electron spike)</title>
<body style="font:14px -apple-system,system-ui;margin:24px;background:#fff;color:#111">
<h2 style="margin:0 0 4px">Tatolab — Electron ${process.versions.electron} spike</h2>
<p style="margin:0 0 16px;color:#555">app.getLoginItemSettings({ type: 'agentService', serviceName }).status</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr style="text-align:left;border-bottom:1px solid #ccc"><th>serviceName</th><th>status</th></tr>
${rows.map((row) => `<tr><td><code>${row.serviceName}</code></td><td><b>${row.status}</b></td></tr>`).join("")}
</table>
<p style="color:#555">bundle: <code>${path.dirname(path.dirname(path.dirname(process.execPath)))}</code><br>
read at ${new Date().toISOString()}</p></body>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function windowUrl(requested) {
  if (requested === "registration") return registrationPageUrl();
  if (requested.startsWith("stock-player")) {
    const query = requested.slice("stock-player".length);
    return `file://${path.join(__dirname, "stock-player.html")}${query}`;
  }
  return requested;
}

app.whenReady().then(() => {
  const action = argumentValue("registration");
  if (action) {
    process.stdout.write(`${JSON.stringify(runRegistrationAction(action))}\n`);
  }
  const requestedWindow = argumentValue("window");
  if (!requestedWindow) {
    app.quit();
    return;
  }
  const spikeWindow = new BrowserWindow({ width: 1000, height: 720, title: "Tatolab (Electron spike)" });
  spikeWindow.webContents.on("console-message", (event) => {
    process.stdout.write(`[page ${event.level}] ${event.message}\n`);
  });
  spikeWindow.loadURL(windowUrl(requestedWindow));
});
