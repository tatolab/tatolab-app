// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Service Management's agent services through Electron's login item API, which reaches
// `SMAppService agentServiceWithPlistName:` for `type: "agentService"` on macOS 13 and later.

import { app, shell } from "electron";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";
import type { ServiceManagementAgentServices } from "../platform/macos/service_management_runtime_launch_agent.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";

/** System Settings' Login Items pane, which `SMAppService openSystemSettingsLoginItems` opens and Electron has no call for. */
const LOGIN_ITEMS_SETTINGS_URL = "x-apple.systempreferences:com.apple.LoginItems-Settings.extension";

/** Service Management's agent services as Electron's `app` reaches them, logging to `tatolabAppLog` a status Electron could not read, which answers as none. */
export function createElectronServiceManagementAgentServices(tatolabAppLog: TatolabAppLog): ServiceManagementAgentServices {
  return {
    agentServiceStatus(agentPlistName) {
      try {
        return app.getLoginItemSettings({ type: "agentService", serviceName: agentPlistName }).status;
      } catch (statusFailure) {
        tatolabAppLog.warn("Service Management's status could not be read", { agent_plist: agentPlistName, failure: describeCaughtFailure(statusFailure) });
        return null;
      }
    },
    requestAgentServiceRegistered(agentPlistName, agentServiceRegistered) {
      try {
        app.setLoginItemSettings({ openAtLogin: agentServiceRegistered, type: "agentService", serviceName: agentPlistName });
        return succeeded(undefined);
      } catch (requestFailure) {
        return failedWith(describeCaughtFailure(requestFailure));
      }
    },
    async openSystemSettingsLoginItems() {
      try {
        await shell.openExternal(LOGIN_ITEMS_SETTINGS_URL);
        return succeeded(undefined);
      } catch (openFailure) {
        return failedWith(`Login Items could not be opened: ${describeCaughtFailure(openFailure)}`);
      }
    },
  };
}
