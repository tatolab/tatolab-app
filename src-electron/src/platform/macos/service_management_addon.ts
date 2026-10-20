// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Service Management's agent services through the app's Node-API addon
// (`src-electron/native/service_management_agent_services/`), which calls `SMAppService` and
// answers its `NSError` text; Electron's own login item API keeps that text to its log.

import { createRequire } from "node:module";
import path from "node:path";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { ServiceManagementAgentServices, ServiceManagementAgentServiceStatus } from "./service_management_agent_services.js";

/** The addon's file name, as `node-gyp` builds it into `build/Release/`. */
export const SERVICE_MANAGEMENT_ADDON_FILE_NAME = "service_management_agent_services.node";

/** Where an unpackaged app finds the addon `npm run build:service-management-addon` built, under the app's root `appPath`. */
export function serviceManagementAddonBuiltUnder(appPath: string): string {
  return path.join(appPath, "src-electron", "native", "service_management_agent_services", "build", "Release", SERVICE_MANAGEMENT_ADDON_FILE_NAME);
}

const SERVICE_MANAGEMENT_AGENT_SERVICE_STATUSES: readonly ServiceManagementAgentServiceStatus[] = [
  "enabled",
  "requires-approval",
  "not-registered",
  "not-found",
];

/** The addon's four functions, as its exports must carry them. */
interface ServiceManagementAddonFunctions {
  agentServiceStatus: (agentPlistName: string) => unknown;
  registerAgentService: (agentPlistName: string) => unknown;
  unregisterAgentService: (agentPlistName: string) => unknown;
  openSystemSettingsLoginItems: () => unknown;
}

function serviceManagementAddonFunctionsIn(addonExports: unknown): ServiceManagementAddonFunctions | null {
  if (typeof addonExports !== "object" || addonExports === null) return null;
  if (!("agentServiceStatus" in addonExports) || typeof addonExports.agentServiceStatus !== "function") return null;
  if (!("registerAgentService" in addonExports) || typeof addonExports.registerAgentService !== "function") return null;
  if (!("unregisterAgentService" in addonExports) || typeof addonExports.unregisterAgentService !== "function") return null;
  if (!("openSystemSettingsLoginItems" in addonExports) || typeof addonExports.openSystemSettingsLoginItems !== "function") return null;
  const { agentServiceStatus, registerAgentService, unregisterAgentService, openSystemSettingsLoginItems } = addonExports;
  return {
    agentServiceStatus: (agentPlistName) => agentServiceStatus(agentPlistName),
    registerAgentService: (agentPlistName) => registerAgentService(agentPlistName),
    unregisterAgentService: (agentPlistName) => unregisterAgentService(agentPlistName),
    openSystemSettingsLoginItems: () => openSystemSettingsLoginItems(),
  };
}

/** Service Management as unreachable: every status reads as none and every request is refused with `whyUnreachable`. */
function unreachableServiceManagement(whyUnreachable: string): ServiceManagementAgentServices {
  return {
    agentServiceStatus: () => null,
    registerAgentService: () => failedWith(whyUnreachable),
    unregisterAgentService: () => failedWith(whyUnreachable),
    openSystemSettingsLoginItems: async () => failedWith(whyUnreachable),
  };
}

/** A registration call's answer: the addon answers `null` when Service Management did it, or the `NSError`'s own description. */
function registrationAnswered(addonAnswer: () => unknown): Result<void, string> {
  try {
    const refusal = addonAnswer();
    if (refusal === null) return succeeded(undefined);
    return failedWith(typeof refusal === "string" ? refusal : `the Service Management addon answered ${String(refusal)}`);
  } catch (addonFailure) {
    return failedWith(`the Service Management addon failed: ${describeCaughtFailure(addonFailure)}`);
  }
}

/** Service Management's agent services over the addon's `addonExports`, or unreachable ones, logged, when the exports lack its functions. */
export function serviceManagementAgentServicesFromTheAddonExports(addonExports: unknown, tatolabAppLog: TatolabAppLog): ServiceManagementAgentServices {
  const addonFunctions = serviceManagementAddonFunctionsIn(addonExports);
  if (addonFunctions === null) {
    tatolabAppLog.error("the Service Management addon does not export its functions");
    return unreachableServiceManagement("the Service Management addon does not export its functions");
  }
  return {
    agentServiceStatus(agentPlistName) {
      try {
        const status = addonFunctions.agentServiceStatus(agentPlistName);
        return SERVICE_MANAGEMENT_AGENT_SERVICE_STATUSES.find((knownStatus) => knownStatus === status) ?? null;
      } catch (statusFailure) {
        tatolabAppLog.warn("Service Management's status could not be read", { agent_plist: agentPlistName, failure: describeCaughtFailure(statusFailure) });
        return null;
      }
    },
    registerAgentService: (agentPlistName) => registrationAnswered(() => addonFunctions.registerAgentService(agentPlistName)),
    unregisterAgentService: (agentPlistName) => registrationAnswered(() => addonFunctions.unregisterAgentService(agentPlistName)),
    async openSystemSettingsLoginItems() {
      try {
        addonFunctions.openSystemSettingsLoginItems();
        return succeeded(undefined);
      } catch (openFailure) {
        return failedWith(`Login Items could not be opened: ${describeCaughtFailure(openFailure)}`);
      }
    },
  };
}

/** Service Management's agent services through the addon at `addonPath`, or unreachable ones, logged, when it cannot be loaded. */
export function loadServiceManagementAddon(addonPath: string, tatolabAppLog: TatolabAppLog): ServiceManagementAgentServices {
  try {
    return serviceManagementAgentServicesFromTheAddonExports(createRequire(import.meta.url)(addonPath), tatolabAppLog);
  } catch (loadFailure) {
    const whyUnreachable = `the Service Management addon could not be loaded from ${addonPath}: ${describeCaughtFailure(loadFailure)}`;
    tatolabAppLog.error("the Service Management addon could not be loaded", { addon_path: addonPath, failure: describeCaughtFailure(loadFailure) });
    return unreachableServiceManagement(whyUnreachable);
  }
}
