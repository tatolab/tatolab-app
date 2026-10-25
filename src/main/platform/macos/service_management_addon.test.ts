// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { failedWith, succeeded } from "../../result.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import {
  loadServiceManagementAddon,
  serviceManagementAddonBuiltUnder,
  serviceManagementAddonInTheAppBundle,
  serviceManagementAgentServicesFromTheAddonExports,
} from "./service_management_addon.js";

function capturedTatolabAppLog() {
  const logLines: string[] = [];
  return { tatolabAppLog: createTatolabAppLog("debug", (logLine) => logLines.push(logLine)), logLines };
}

/** The addon's exports as a fake: each call is recorded and answered as the test says. */
function fakeAddonExports(answers: { status?: unknown; register?: unknown; unregister?: unknown; throwing?: boolean }) {
  const addonCalls: string[] = [];
  const answer = (call: string, addonAnswer: unknown) => {
    addonCalls.push(call);
    if (answers.throwing) throw new TypeError("the agent plist name is missing");
    return Promise.resolve(addonAnswer);
  };
  return {
    addonCalls,
    addonExports: {
      agentServiceStatus: (agentPlistName: string) => answer(`status ${agentPlistName}`, answers.status),
      registerAgentService: (agentPlistName: string) => answer(`register ${agentPlistName}`, answers.register),
      unregisterAgentService: (agentPlistName: string) => answer(`unregister ${agentPlistName}`, answers.unregister),
      openSystemSettingsLoginItems: () => {
        addonCalls.push("open Login Items");
        if (answers.throwing) throw new TypeError("the agent plist name is missing");
      },
    },
  };
}

test("the addon's answers become statuses and registrations, its refusals kept in Service Management's own words", async () => {
  const { tatolabAppLog } = capturedTatolabAppLog();
  const { addonExports, addonCalls } = fakeAddonExports({ status: "requires-approval", register: null, unregister: "Operation not permitted" });
  const serviceManagementAgentServices = serviceManagementAgentServicesFromTheAddonExports(addonExports, tatolabAppLog);

  expect(await serviceManagementAgentServices.agentServiceStatus("com.tatolab.tatolabd.plist")).toBe("requires-approval");
  expect(await serviceManagementAgentServices.registerAgentService("com.tatolab.tatolabd.plist")).toEqual(succeeded(undefined));
  expect(await serviceManagementAgentServices.unregisterAgentService("com.tatolab.tatolabd.plist")).toEqual(failedWith("Operation not permitted"));
  expect(await serviceManagementAgentServices.openSystemSettingsLoginItems()).toEqual(succeeded(undefined));
  expect(addonCalls).toEqual([
    "status com.tatolab.tatolabd.plist",
    "register com.tatolab.tatolabd.plist",
    "unregister com.tatolab.tatolabd.plist",
    "open Login Items",
  ]);
});

test("an answer the addon should never give reads as no status or a refusal, and a throw is caught and logged", async () => {
  const unexpected = capturedTatolabAppLog();
  const unexpectedAnswers = serviceManagementAgentServicesFromTheAddonExports(fakeAddonExports({ status: "bogus", register: 7 }).addonExports, unexpected.tatolabAppLog);
  expect(await unexpectedAnswers.agentServiceStatus("com.tatolab.tatolabd.plist")).toBeNull();
  expect(await unexpectedAnswers.registerAgentService("com.tatolab.tatolabd.plist")).toEqual(failedWith("the Service Management addon answered 7"));

  const throwing = capturedTatolabAppLog();
  const throwingAddon = serviceManagementAgentServicesFromTheAddonExports(fakeAddonExports({ throwing: true }).addonExports, throwing.tatolabAppLog);
  expect(await throwingAddon.agentServiceStatus("com.tatolab.tatolabd.plist")).toBeNull();
  expect(throwing.logLines.join("\n")).toContain("Service Management's status could not be read");
  expect(await throwingAddon.registerAgentService("com.tatolab.tatolabd.plist")).toEqual(
    failedWith("the Service Management addon failed: the agent plist name is missing"),
  );
  expect(await throwingAddon.openSystemSettingsLoginItems()).toEqual(failedWith("Login Items could not be opened: the agent plist name is missing"));
});

test("an addon that cannot be loaded, or exports the wrong functions, leaves Service Management unreachable and says why", async () => {
  const missing = capturedTatolabAppLog();
  const unloadable = loadServiceManagementAddon("/nonexistent/service_management_agent_services.node", missing.tatolabAppLog);
  expect(await unloadable.agentServiceStatus("com.tatolab.tatolabd.plist")).toBeNull();
  const refusal = await unloadable.registerAgentService("com.tatolab.tatolabd.plist");
  expect(refusal.ok ? "" : refusal.failure).toMatch(
    /^the Service Management addon could not be loaded from \/nonexistent\/service_management_agent_services\.node: /,
  );
  expect(missing.logLines.join("\n")).toContain("the Service Management addon could not be loaded");

  const misshapen = capturedTatolabAppLog();
  const withoutItsFunctions = serviceManagementAgentServicesFromTheAddonExports({ agentServiceStatus: () => "enabled" }, misshapen.tatolabAppLog);
  expect(await withoutItsFunctions.agentServiceStatus("com.tatolab.tatolabd.plist")).toBeNull();
  expect(await withoutItsFunctions.openSystemSettingsLoginItems()).toEqual(failedWith("the Service Management addon does not export its functions"));
});

test("an unpackaged app finds the addon where node-gyp builds it", () => {
  expect(serviceManagementAddonBuiltUnder("/repo")).toBe(
    "/repo/native/service_management_agent_services/build/Release/service_management_agent_services.node",
  );
});

test("a packaged app finds the addon in its bundle's Frameworks", () => {
  expect(serviceManagementAddonInTheAppBundle("/Applications/Tatolab.app")).toBe(
    "/Applications/Tatolab.app/Contents/Frameworks/tatolab-app-native/service_management_agent_services.node",
  );
});
