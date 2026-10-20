// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import { loadServiceManagementAddon, serviceManagementAddonBuiltUnder } from "./service_management_addon.js";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { ProgramCompletion } from "./run_program_to_completion.js";
import {
  runtimeAgentRegistrationStatusFrom,
  ServiceManagementRuntimeLaunchAgent,
  type LaunchctlRunner,
} from "./service_management_runtime_launch_agent.js";
import type { ServiceManagementAgentServices, ServiceManagementAgentServiceStatus } from "./service_management_agent_services.js";

/** Service Management as a fake: it holds the status of the agent plists it knows, moves them as a request asks unless it refuses, and records every call. */
function fakeServiceManagementAgentServices(
  statusByAgentPlistName: Map<string, ServiceManagementAgentServiceStatus>,
  registrationRefusal: string | null = null,
) {
  const serviceManagementCalls: string[] = [];
  const answerTheRequest = (agentPlistName: string, statusAfterTheRequest: ServiceManagementAgentServiceStatus): Result<void, string> => {
    if (registrationRefusal !== null) return failedWith(registrationRefusal);
    statusByAgentPlistName.set(agentPlistName, statusAfterTheRequest);
    return succeeded(undefined);
  };
  const serviceManagementAgentServices: ServiceManagementAgentServices = {
    async agentServiceStatus(agentPlistName) {
      serviceManagementCalls.push(`status ${agentPlistName}`);
      return statusByAgentPlistName.get(agentPlistName) ?? null;
    },
    async registerAgentService(agentPlistName) {
      serviceManagementCalls.push(`register ${agentPlistName}`);
      return answerTheRequest(agentPlistName, "enabled");
    },
    async unregisterAgentService(agentPlistName) {
      serviceManagementCalls.push(`unregister ${agentPlistName}`);
      return answerTheRequest(agentPlistName, "not-registered");
    },
    async openSystemSettingsLoginItems() {
      serviceManagementCalls.push("open Login Items");
      return succeeded(undefined);
    },
  };
  return { serviceManagementAgentServices, serviceManagementCalls };
}

function launchctlAnswering(launchctlAnswer: Result<ProgramCompletion, string>) {
  const launchctlCalls: (readonly string[])[] = [];
  const launchctlRunner: LaunchctlRunner = async (launchctlArguments) => {
    launchctlCalls.push(launchctlArguments);
    return launchctlAnswer;
  };
  return { launchctlRunner, launchctlCalls };
}

function launchctlExiting(exitStatus: number, standardError = ""): Result<ProgramCompletion, string> {
  return succeeded({ exitStatus, endingSignal: null, standardOutput: "", standardError });
}

test("every_service_management_status_maps_to_the_contract_spelling", () => {
  expect(runtimeAgentRegistrationStatusFrom("enabled")).toBe("enabled");
  expect(runtimeAgentRegistrationStatusFrom("requires-approval")).toBe("requires_approval");
  expect(runtimeAgentRegistrationStatusFrom("not-registered")).toBe("not_registered");
  expect(runtimeAgentRegistrationStatusFrom("not-found")).toBe("not_found");
  expect(runtimeAgentRegistrationStatusFrom(null)).toBe("not_found");
});

const SERVICE_MANAGEMENT_RUNS_HERE = process.platform === "darwin";

/** The repository's root, above `src-electron/src/platform/macos/`. */
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

test.skipIf(!SERVICE_MANAGEMENT_RUNS_HERE)("an_unbundled_test_binary_finds_no_agent_plist", async () => {
  const addonLogLines: string[] = [];
  const serviceManagementAgentServices = loadServiceManagementAddon(
    serviceManagementAddonBuiltUnder(REPOSITORY_ROOT),
    createTatolabAppLog("debug", (logLine) => addonLogLines.push(logLine)),
  );
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(
    501,
    serviceManagementAgentServices,
    launchctlAnswering(launchctlExiting(0)).launchctlRunner,
  );

  expect(await runtimeLaunchAgent.registrationStatus()).toBe("not_found");
  expect(addonLogLines).toEqual([]);
});

test("an agent plist Service Management does not know reads as not found", async () => {
  const { serviceManagementAgentServices, serviceManagementCalls } = fakeServiceManagementAgentServices(new Map());
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(
    501,
    serviceManagementAgentServices,
    launchctlAnswering(launchctlExiting(0)).launchctlRunner,
  );

  expect(await runtimeLaunchAgent.registrationStatus()).toBe("not_found");
  expect(serviceManagementCalls).toEqual(["status com.tatolab.tatolabd.plist"]);
});

test("registering and unregistering go to Service Management, and a refusal is answered in its own words", async () => {
  const launchctl = launchctlAnswering(launchctlExiting(0)).launchctlRunner;
  const accepting = fakeServiceManagementAgentServices(new Map([["com.tatolab.tatolabd.plist", "not-registered"]]));
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(501, accepting.serviceManagementAgentServices, launchctl);

  expect(await runtimeLaunchAgent.registerRuntimeAgent()).toEqual(succeeded(undefined));
  expect(await runtimeLaunchAgent.registrationStatus()).toBe("enabled");
  expect(await runtimeLaunchAgent.unregisterRuntimeAgent()).toEqual(succeeded(undefined));
  expect(await runtimeLaunchAgent.registrationStatus()).toBe("not_registered");
  expect(accepting.serviceManagementCalls).toEqual([
    "register com.tatolab.tatolabd.plist",
    "status com.tatolab.tatolabd.plist",
    "unregister com.tatolab.tatolabd.plist",
    "status com.tatolab.tatolabd.plist",
  ]);

  const refusing = fakeServiceManagementAgentServices(new Map(), "Operation not permitted");
  const refusedLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(501, refusing.serviceManagementAgentServices, launchctl);
  expect(await refusedLaunchAgent.registerRuntimeAgent()).toEqual(failedWith("Operation not permitted"));
  expect(await refusedLaunchAgent.unregisterRuntimeAgent()).toEqual(failedWith("Operation not permitted"));
});

test("the kickstart leaves a running job alone and maps launchctl's no-such-service exit to its own case", async () => {
  const { serviceManagementAgentServices } = fakeServiceManagementAgentServices(new Map());
  const startWith = async (launchctlAnswer: Result<ProgramCompletion, string>) => {
    const launchctl = launchctlAnswering(launchctlAnswer);
    const started = await ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(
      501,
      serviceManagementAgentServices,
      launchctl.launchctlRunner,
    ).startRuntimeAgentIfNotRunning();
    return { started, launchctlCalls: launchctl.launchctlCalls };
  };

  expect(await startWith(launchctlExiting(0))).toEqual({
    started: succeeded(undefined),
    launchctlCalls: [["kickstart", "gui/501/com.tatolab.tatolabd"]],
  });
  expect((await startWith(launchctlExiting(113, "Could not find service"))).started).toEqual(
    failedWith({ kind: "no_job_for_the_registered_agent" }),
  );
  expect((await startWith(launchctlExiting(5, "Input/output error\n"))).started).toEqual(
    failedWith({ kind: "refused", refusal: "launchctl kickstart gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error" }),
  );
  expect((await startWith(failedWith("/bin/launchctl could not be started: spawn /bin/launchctl ENOENT"))).started).toEqual(
    failedWith({ kind: "refused", refusal: "launchctl could not be run: /bin/launchctl could not be started: spawn /bin/launchctl ENOENT" }),
  );
});

test("opening Login Items goes to Service Management's settings", async () => {
  const { serviceManagementAgentServices, serviceManagementCalls } = fakeServiceManagementAgentServices(new Map());
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(
    501,
    serviceManagementAgentServices,
    launchctlAnswering(launchctlExiting(0)).launchctlRunner,
  );

  expect(await runtimeLaunchAgent.openLoginItemsSettings()).toEqual(succeeded(undefined));
  expect(serviceManagementCalls).toEqual(["open Login Items"]);
});
