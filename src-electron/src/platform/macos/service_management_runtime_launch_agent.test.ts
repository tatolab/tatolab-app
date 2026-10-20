// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { ProgramCompletion } from "./run_program_to_completion.js";
import {
  runtimeAgentRegistrationStatusFrom,
  ServiceManagementRuntimeLaunchAgent,
  type LaunchctlRunner,
  type ServiceManagementAgentServices,
  type ServiceManagementAgentServiceStatus,
} from "./service_management_runtime_launch_agent.js";

/** Service Management as a fake: it holds the status of the agent plists it knows, moves them as a request asks unless told to leave them, and records every call. */
function fakeServiceManagementAgentServices(
  statusByAgentPlistName: Map<string, ServiceManagementAgentServiceStatus>,
  statusAfterARegisterRequest: ServiceManagementAgentServiceStatus = "enabled",
) {
  const serviceManagementCalls: string[] = [];
  const serviceManagementAgentServices: ServiceManagementAgentServices = {
    agentServiceStatus(agentPlistName) {
      serviceManagementCalls.push(`status ${agentPlistName}`);
      return statusByAgentPlistName.get(agentPlistName) ?? null;
    },
    requestAgentServiceRegistered(agentPlistName, agentServiceRegistered) {
      serviceManagementCalls.push(`${agentServiceRegistered ? "register" : "unregister"} ${agentPlistName}`);
      statusByAgentPlistName.set(agentPlistName, agentServiceRegistered ? statusAfterARegisterRequest : "not-registered");
      return succeeded(undefined);
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

test("registering reads the agent back and names the status Service Management left it in", async () => {
  const enabling = fakeServiceManagementAgentServices(new Map([["com.tatolab.tatolabd.plist", "not-registered"]]));
  const launchctl = launchctlAnswering(launchctlExiting(0)).launchctlRunner;
  expect(await ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(501, enabling.serviceManagementAgentServices, launchctl).registerRuntimeAgent()).toEqual(
    succeeded(undefined),
  );
  expect(enabling.serviceManagementCalls).toEqual(["register com.tatolab.tatolabd.plist", "status com.tatolab.tatolabd.plist"]);

  const awaitingApproval = fakeServiceManagementAgentServices(new Map(), "requires-approval");
  expect(
    await ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(501, awaitingApproval.serviceManagementAgentServices, launchctl).registerRuntimeAgent(),
  ).toEqual(failedWith("Service Management did not register com.tatolab.tatolabd.plist: it reads requires_approval"));

  const unregistering = fakeServiceManagementAgentServices(new Map([["com.tatolab.tatolabd.plist", "enabled"]]));
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(501, unregistering.serviceManagementAgentServices, launchctl);
  expect(await runtimeLaunchAgent.unregisterRuntimeAgent()).toEqual(succeeded(undefined));
  expect(await runtimeLaunchAgent.registrationStatus()).toBe("not_registered");

  const ignoringTheUnregister: ServiceManagementAgentServices = {
    ...unregistering.serviceManagementAgentServices,
    agentServiceStatus: () => "enabled",
  };
  expect(await ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(501, ignoringTheUnregister, launchctl).unregisterRuntimeAgent()).toEqual(
    failedWith("Service Management did not unregister com.tatolab.tatolabd.plist: it reads enabled"),
  );
});

test("a refused registration request is answered in its own words without reading the status", async () => {
  const serviceManagementCalls: string[] = [];
  const refusingServiceManagement: ServiceManagementAgentServices = {
    agentServiceStatus: () => {
      serviceManagementCalls.push("status");
      return "not-registered";
    },
    requestAgentServiceRegistered: () => failedWith("Electron refused the login item settings"),
    openSystemSettingsLoginItems: async () => succeeded(undefined),
  };
  const runtimeLaunchAgent = ServiceManagementRuntimeLaunchAgent.forTheBundledRuntime(
    501,
    refusingServiceManagement,
    launchctlAnswering(launchctlExiting(0)).launchctlRunner,
  );

  expect(await runtimeLaunchAgent.registerRuntimeAgent()).toEqual(failedWith("Electron refused the login item settings"));
  expect(serviceManagementCalls).toEqual([]);
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
