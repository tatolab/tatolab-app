import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { succeeded, type Result } from "../../result.js";
import type { ProgramCompletion } from "../run_program_to_completion.js";
import { LaunchctlRuntimeLaunchAgent, whyLaunchdGaveUpOnTheJob, type LaunchctlRunner } from "./launchctl_runtime_launch_agent.js";
import type { OpenRunner } from "./terminal_app_opened_by_open.js";

const LABEL = "com.tatolab.tatolabd";
const JOB = `gui/501/${LABEL}`;

function launchctlExiting(exitStatus: number, standardError = "", standardOutput = ""): Result<ProgramCompletion, string> {
  return succeeded({
    exitStatus,
    endingSignal: null,
    standardOutput,
    standardError,
  });
}

const NO_SUCH_SERVICE = launchctlExiting(113, `Could not find service "${LABEL}" in domain for user gui: 501`);

/** launchd's user domain as a fake: it loads the one plist, refuses to while `loginItemsHoldTheAgentOff`, and records every `launchctl` call. */
class FakeLaunchdUserDomain {
  readonly launchctlCalls: string[] = [];
  jobLoaded = false;
  jobEnabled = true;
  loginItemsHoldTheAgentOff = false;
  kickstartAnswer: Result<ProgramCompletion, string> | null = null;
  printedJob = "";

  readonly launchctlRunner: LaunchctlRunner = async (launchctlArguments) => {
    const call = launchctlArguments.join(" ");
    this.launchctlCalls.push(call);
    const [verb] = launchctlArguments;
    switch (verb) {
      case "print":
        return this.jobLoaded ? launchctlExiting(0, "", this.printedJob) : NO_SUCH_SERVICE;
      case "enable":
        this.jobEnabled = true;
        return launchctlExiting(0);
      case "disable":
        this.jobEnabled = false;
        return launchctlExiting(0);
      case "bootstrap":
        if (this.jobLoaded || this.loginItemsHoldTheAgentOff || !this.jobEnabled)
          return launchctlExiting(5, "Bootstrap failed: 5: Input/output error");
        this.jobLoaded = true;
        return launchctlExiting(0);
      case "bootout":
        if (!this.jobLoaded) return launchctlExiting(3, "Boot-out failed: 3: No such process");
        this.jobLoaded = false;
        return launchctlExiting(0);
      case "kickstart":
        if (this.kickstartAnswer !== null) return this.kickstartAnswer;
        return this.jobLoaded ? launchctlExiting(0) : NO_SUCH_SERVICE;
      default:
        throw new Error(`launchctl ${call} is not a command the app runs`);
    }
  };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function launchAgentsFolder(withThePlist: boolean): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-launch-agents-"));
  temporaryDirectories.push(folder);
  const plistPath = path.join(folder, `${LABEL}.plist`);
  if (withThePlist) await writeFile(plistPath, "<plist/>");
  return plistPath;
}

async function launchAgentOver(launchd: FakeLaunchdUserDomain, withThePlist = true, runOpen: OpenRunner = async () => launchctlExiting(0)) {
  const plistPath = await launchAgentsFolder(withThePlist);
  return {
    plistPath,
    launchAgent: new LaunchctlRuntimeLaunchAgent(501, { label: LABEL, plistPath }, launchd.launchctlRunner, runOpen),
  };
}

test("the_agent_is_not_found_before_the_installer_wrote_its_plist_and_enabled_once_launchd_holds_its_job", async () => {
  const launchd = new FakeLaunchdUserDomain();
  expect(await (await launchAgentOver(launchd, false)).launchAgent.registrationStatus()).toBe("not_found");

  const { launchAgent } = await launchAgentOver(launchd);
  expect(await launchAgent.registrationStatus()).toBe("not_registered");
  launchd.jobLoaded = true;
  expect(await launchAgent.registrationStatus()).toBe("enabled");
});

test("registering_enables_the_job_and_bootstraps_the_installers_plist", async () => {
  const launchd = new FakeLaunchdUserDomain();
  launchd.jobEnabled = false;
  const { launchAgent, plistPath } = await launchAgentOver(launchd);

  expect(await launchAgent.registerRuntimeAgent()).toEqual(succeeded(undefined));

  expect(launchd.launchctlCalls).toEqual([`enable ${JOB}`, `print ${JOB}`, `bootstrap gui/501 ${plistPath}`]);
  expect(await launchAgent.registrationStatus()).toBe("enabled");
});

test("registering_a_job_launchd_already_holds_only_enables_it", async () => {
  const launchd = new FakeLaunchdUserDomain();
  launchd.jobLoaded = true;
  const { launchAgent } = await launchAgentOver(launchd);

  expect(await launchAgent.registerRuntimeAgent()).toEqual(succeeded(undefined));

  expect(launchd.launchctlCalls).toEqual([`enable ${JOB}`, `print ${JOB}`]);
});

test("a_bootstrap_login_items_refuses_reads_as_needing_approval_in_launchctls_words_until_the_job_loads", async () => {
  const launchd = new FakeLaunchdUserDomain();
  launchd.loginItemsHoldTheAgentOff = true;
  const { launchAgent, plistPath } = await launchAgentOver(launchd);

  const registered = await launchAgent.registerRuntimeAgent();

  expect(registered.ok ? "" : registered.failure).toBe(
    `launchctl bootstrap gui/501 ${plistPath} failed (exit status: 5): Bootstrap failed: 5: Input/output error`,
  );
  expect(await launchAgent.registrationStatus()).toBe("requires_approval");
  launchd.loginItemsHoldTheAgentOff = false;
  launchd.jobLoaded = true;
  expect(await launchAgent.registrationStatus()).toBe("enabled");
  launchd.jobLoaded = false;
  expect(await launchAgent.registrationStatus()).toBe("not_registered");
});

test("unregistering_disables_the_job_and_boots_it_out_and_a_job_not_loaded_is_already_out", async () => {
  const launchd = new FakeLaunchdUserDomain();
  launchd.jobLoaded = true;
  const { launchAgent } = await launchAgentOver(launchd);

  expect(await launchAgent.unregisterRuntimeAgent()).toEqual(succeeded(undefined));
  expect(launchd.launchctlCalls).toEqual([`disable ${JOB}`, `bootout ${JOB}`]);
  expect(await launchAgent.registrationStatus()).toBe("not_registered");

  expect(await launchAgent.unregisterRuntimeAgent()).toEqual(succeeded(undefined));
});

test("starting_kickstarts_the_job_restarting_kills_it_first_and_launchd_holding_no_job_is_told_apart", async () => {
  const launchd = new FakeLaunchdUserDomain();
  const { launchAgent } = await launchAgentOver(launchd);

  expect(await launchAgent.startRuntimeAgentIfNotRunning()).toEqual({
    ok: false,
    failure: { kind: "no_job_for_the_registered_agent" },
  });
  launchd.jobLoaded = true;
  expect(await launchAgent.startRuntimeAgentIfNotRunning()).toEqual(succeeded(undefined));
  expect(await launchAgent.restartRuntimeAgent()).toEqual(succeeded(undefined));
  launchd.kickstartAnswer = launchctlExiting(37, "Operation already in progress");
  expect(await launchAgent.restartRuntimeAgent()).toEqual({
    ok: false,
    failure: {
      kind: "refused",
      refusal: `launchctl kickstart -k ${JOB} failed (exit status: 37): Operation already in progress`,
    },
  });

  expect(launchd.launchctlCalls.filter((call) => call.startsWith("kickstart"))).toEqual([
    `kickstart ${JOB}`,
    `kickstart ${JOB}`,
    `kickstart -k ${JOB}`,
    `kickstart -k ${JOB}`,
  ]);
});

test("login_items_opens_at_its_system_settings_pane", async () => {
  const openCalls: (readonly string[])[] = [];
  const { launchAgent } = await launchAgentOver(new FakeLaunchdUserDomain(), true, async (openArguments) => {
    openCalls.push(openArguments);
    return launchctlExiting(0);
  });

  expect(await launchAgent.openLoginItemsSettings()).toEqual(succeeded(undefined));
  expect(openCalls).toEqual([["x-apple.systempreferences:com.apple.LoginItems-Settings.extension"]]);
});

/** `launchctl print gui/501/com.tatolab.tatolabd`, trimmed, as macOS 26.7 printed it for the running agent. */
const LAUNCHCTL_PRINT_OF_THE_RUNNING_AGENT = [
  "gui/501/com.tatolab.tatolabd = {",
  "\tactive count = 2",
  "\tpath = /Users/u/Library/LaunchAgents/com.tatolab.tatolabd.plist",
  "\ttype = LaunchAgent",
  "\tstate = running",
  "",
  "\tprogram = /Users/u/Library/Application Support/com.tatolab.runtime/current/Tatolab Runtime.app/Contents/MacOS/tatolabd",
  "\truns = 5",
  "\tpid = 5242",
  "\tlast exit code = 0",
  "}",
  "",
].join("\n");

/** The same job not running, in `jobState`, its last spawn as `lastExitLines` describe it. */
function launchctlPrintOfTheAgentNotRunning(lastExitLines: readonly string[], jobState = "not running"): string {
  return LAUNCHCTL_PRINT_OF_THE_RUNNING_AGENT.replace("\tstate = running", `\tstate = ${jobState}`)
    .replace("\tpid = 5242\n", "")
    .replace("\tlast exit code = 0", lastExitLines.join("\n"));
}

test("launchd_gave_up_only_on_a_job_not_running_whose_spawn_was_refused_or_killed_for_its_signature", () => {
  expect(whyLaunchdGaveUpOnTheJob(LAUNCHCTL_PRINT_OF_THE_RUNNING_AGENT)).toBeNull();
  expect(whyLaunchdGaveUpOnTheJob(launchctlPrintOfTheAgentNotRunning(["\tlast exit code = 78: EX_CONFIG"]))).toEqual({
    serviceManagerWords: "launchd: last exit code = 78: EX_CONFIG",
    registeringAgainWaitsForTheNextSpawn: false,
  });
  expect(
    whyLaunchdGaveUpOnTheJob(
      launchctlPrintOfTheAgentNotRunning([
        "\tlast terminating signal = Killed: 9",
        "\tlast exit reason = OS_REASON_CODESIGNING | Launch Constraint Violation",
      ]),
    ),
  ).toEqual({
    serviceManagerWords: "launchd: last exit reason = OS_REASON_CODESIGNING | Launch Constraint Violation",
    registeringAgainWaitsForTheNextSpawn: true,
  });
  expect(whyLaunchdGaveUpOnTheJob(launchctlPrintOfTheAgentNotRunning(["\tlast exit code = 1"])), "a crash launchd restarts").toBeNull();
  expect(
    whyLaunchdGaveUpOnTheJob(LAUNCHCTL_PRINT_OF_THE_RUNNING_AGENT.replace("\tlast exit code = 0", "\tlast exit code = 78: EX_CONFIG")),
    "a job running again has been given another go",
  ).toBeNull();
});

test("the_launch_agent_reads_launchds_give_up_from_launchctl_print_and_none_when_launchctl_finds_no_job", async () => {
  const launchd = new FakeLaunchdUserDomain();
  const { launchAgent } = await launchAgentOver(launchd);
  expect(await launchAgent.whyTheServiceManagerGaveUpOnTheRuntime()).toBeNull();

  launchd.jobLoaded = true;
  launchd.printedJob = launchctlPrintOfTheAgentNotRunning(["\tlast exit code = 78: EX_CONFIG"]);
  expect(await launchAgent.whyTheServiceManagerGaveUpOnTheRuntime()).toEqual({
    serviceManagerWords: "launchd: last exit code = 78: EX_CONFIG",
    registeringAgainWaitsForTheNextSpawn: false,
  });
});
