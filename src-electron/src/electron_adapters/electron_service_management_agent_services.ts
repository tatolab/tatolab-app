// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Service Management's agent services through Electron's login item API, which reaches
// `SMAppService agentServiceWithPlistName:` for `type: "agentService"` on macOS 13 and later.

import { app, shell } from "electron";
import { describeCaughtFailure, failedWith, succeeded } from "../result.js";
import type { ServiceManagementAgentServices } from "../platform/macos/service_management_runtime_launch_agent.js";

/** System Settings' Login Items pane, which `SMAppService openSystemSettingsLoginItems` opens and Electron has no call for. */
const LOGIN_ITEMS_SETTINGS_URL = "x-apple.systempreferences:com.apple.LoginItems-Settings.extension";

/** Service Management's agent services as Electron's `app` reaches them. */
export const ELECTRON_SERVICE_MANAGEMENT_AGENT_SERVICES: ServiceManagementAgentServices = {
  agentServiceStatus(agentPlistName) {
    try {
      return app.getLoginItemSettings({ type: "agentService", serviceName: agentPlistName }).status;
    } catch {
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
    return shell.openExternal(LOGIN_ITEMS_SETTINGS_URL).then(
      () => succeeded(undefined),
      (openFailure: unknown) => failedWith(`Login Items could not be opened: ${describeCaughtFailure(openFailure)}`),
    );
  },
};
