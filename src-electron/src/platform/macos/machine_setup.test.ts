// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { chmod, lstat, mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith, type Result } from "../../result.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import { currentProcessUid } from "../mod.js";
import type { MachineSetupAdministratorPromptOutcome, MachineSetupObservation, MachineSetupTrigger } from "../tatolab_machine_setup.js";
import { administratorPromptApplescript, type AdministratorPromptFailure } from "./administrator_prompt.js";
import {
  AdministratorPromptThisLaunch,
  commandLineToolLinkedAt,
  MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT,
  MachineSetupBehindAnAdministratorPrompt,
  machineSetupAdministratorShellScript,
  machineSetupBehindOneAdministratorPrompt,
  machineSetupStateFrom,
  missingMachineSetupPieces,
  prepareLocalProofTestMachineRoot,
  type MissingMachineSetupPiece,
} from "./machine_setup.js";
import { tatolabMachinePathsOnMacosUnderALocalProofTestRoot, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  // macOS: os.tmpdir() is under /var, a link to /private/var, and the code under test realpaths.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-machine-setup-")));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

function pathsUnder(root: string): TatolabMachinePathsOnMacos {
  return tatolabMachinePathsOnMacosUnderALocalProofTestRoot(root, currentProcessUid());
}

function realShapedPathsUnder(root: string): TatolabMachinePathsOnMacos {
  return {
    ...pathsUnder(root),
    machineRuntimeLockOwner: { kind: "this_user", uid: currentProcessUid() },
    commandLineToolLink: path.join(root, "bin", "tatolab"),
  };
}

function missesTheCliLink(missing: readonly MissingMachineSetupPiece[]): boolean {
  return missing.some((missingPiece) => missingPiece.kind === "command_line_tool_link");
}

async function modeOf(entryPath: string): Promise<number> {
  return (await lstat(entryPath)).mode & 0o7777;
}

test("a_fresh_machine_misses_the_lock_directory_lock_file_and_cli_link", async () => {
  const root = await temporaryRoot();
  const machinePaths = realShapedPathsUnder(root);
  const bundled = path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli");

  expect(await missingMachineSetupPieces(machinePaths, bundled)).toEqual([
    { kind: "machine_runtime_lock_directory", path: machinePaths.machineRuntimeLockDirectory },
    { kind: "machine_runtime_lock_file", path: machinePaths.machineRuntimeLockFile },
    { kind: "command_line_tool_link", linkPath: path.join(root, "bin", "tatolab"), bundledCommandLineTool: bundled },
  ]);
});

test("outside_a_bundle_no_cli_link_is_required", async () => {
  const root = await temporaryRoot();
  expect(missesTheCliLink(await missingMachineSetupPieces(realShapedPathsUnder(root), null))).toBe(false);
});

test("a_prepared_test_root_passes_the_runtimes_lock_trust_rules", async () => {
  const root = await temporaryRoot();
  const machinePaths = pathsUnder(root);

  expect((await prepareLocalProofTestMachineRoot(machinePaths)).ok).toBe(true);

  expect(await missingMachineSetupPieces(machinePaths, null)).toEqual([]);
  expect(await modeOf(machinePaths.machineRuntimeLockFile)).toBe(0o666);
  expect(await modeOf(machinePaths.machineRuntimeLockDirectory)).toBe(0o755);
  expect(await stat(path.join(root, "run")).catch(() => null)).toBeNull();
});

test("preparing_a_test_root_corrects_a_lock_left_at_the_wrong_mode", async () => {
  const root = await temporaryRoot();
  const machinePaths = pathsUnder(root);
  await mkdir(machinePaths.machineRuntimeLockDirectory, { recursive: true });
  await chmod(machinePaths.machineRuntimeLockDirectory, 0o777);
  await writeFile(machinePaths.machineRuntimeLockFile, "");
  await chmod(machinePaths.machineRuntimeLockFile, 0o644);
  expect(await missingMachineSetupPieces(machinePaths, null)).toHaveLength(2);

  expect((await prepareLocalProofTestMachineRoot(machinePaths)).ok).toBe(true);

  expect(await missingMachineSetupPieces(machinePaths, null)).toEqual([]);
});

test("a_lock_file_that_is_a_symlink_is_refused", async () => {
  const root = await temporaryRoot();
  const machinePaths = pathsUnder(root);
  await mkdir(machinePaths.machineRuntimeLockDirectory, { recursive: true });
  await symlink(path.join(root, "elsewhere"), machinePaths.machineRuntimeLockFile);

  expect((await missingMachineSetupPieces(machinePaths, null)).some((missingPiece) => missingPiece.kind === "machine_runtime_lock_file")).toBe(true);
  const prepared = await prepareLocalProofTestMachineRoot(machinePaths);
  expect(prepared.ok).toBe(false);
  expect(prepared.ok ? "" : prepared.failure).toContain("runtime.lock");
  expect(await stat(path.join(root, "elsewhere")).catch(() => null)).toBeNull();
});

test("a_cli_link_counts_as_set_up_only_while_it_points_at_this_bundle", async () => {
  const root = await temporaryRoot();
  const machinePaths = realShapedPathsUnder(root);
  const bundled = path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli");
  await mkdir(path.join(root, "bin"), { recursive: true });
  await symlink(bundled, path.join(root, "bin", "tatolab"));

  expect(missesTheCliLink(await missingMachineSetupPieces(machinePaths, bundled))).toBe(false);
  expect(missesTheCliLink(await missingMachineSetupPieces(machinePaths, path.join(root, "Old.app/Contents/MacOS/tatolab-cli")))).toBe(true);
});

test("the_cli_reads_linked_only_while_its_link_points_at_this_bundle", async () => {
  const root = await temporaryRoot();
  const machinePaths = realShapedPathsUnder(root);
  const linkPath = path.join(root, "bin", "tatolab");
  const bundled = path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli");
  const linkedAt = async (bundledCommandLineTool: string) =>
    commandLineToolLinkedAt(machinePaths, bundledCommandLineTool, await missingMachineSetupPieces(machinePaths, bundledCommandLineTool));

  expect(await linkedAt(bundled)).toBeNull();

  await mkdir(path.join(root, "bin"), { recursive: true });
  await symlink(bundled, linkPath);
  expect(await linkedAt(bundled)).toBe(linkPath);
  expect(await linkedAt(path.join(root, "Old.app/Contents/MacOS/tatolab-cli"))).toBeNull();
});

test("outside_a_bundle_or_in_a_local_proof_build_the_cli_reads_unlinked", async () => {
  const root = await temporaryRoot();
  const bundled = path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli");

  expect(commandLineToolLinkedAt(realShapedPathsUnder(root), null, [])).toBeNull();
  expect(commandLineToolLinkedAt(pathsUnder(root), bundled, [])).toBeNull();
});

test("the_administrator_script_creates_only_what_is_missing_in_one_root_shell", () => {
  const missing: MissingMachineSetupPiece[] = [
    { kind: "machine_runtime_lock_directory", path: "/Library/Application Support/Tatolab" },
    { kind: "machine_runtime_lock_file", path: "/Library/Application Support/Tatolab/runtime.lock" },
    {
      kind: "command_line_tool_link",
      linkPath: "/usr/local/bin/tatolab",
      bundledCommandLineTool: "/Applications/Tatolab.app/Contents/MacOS/tatolab-cli",
    },
  ];

  expect(machineSetupAdministratorShellScript(missing)).toBe(
    "if [ -L '/Library/Application Support/Tatolab' ]; then rm -f '/Library/Application Support/Tatolab'; fi" +
      " && mkdir -p '/Library/Application Support/Tatolab'" +
      " && chown root:wheel '/Library/Application Support/Tatolab'" +
      " && chmod 0755 '/Library/Application Support/Tatolab'" +
      " && if [ -L '/Library/Application Support/Tatolab/runtime.lock' ]; then rm -f '/Library/Application Support/Tatolab/runtime.lock'; fi" +
      " && touch '/Library/Application Support/Tatolab/runtime.lock'" +
      " && chown root:wheel '/Library/Application Support/Tatolab/runtime.lock'" +
      " && chmod 0666 '/Library/Application Support/Tatolab/runtime.lock'" +
      " && mkdir -p '/usr/local/bin'" +
      " && ln -sfn '/Applications/Tatolab.app/Contents/MacOS/tatolab-cli' '/usr/local/bin/tatolab'",
  );
  expect(machineSetupAdministratorShellScript(missing.slice(2))).toBe(
    "mkdir -p '/usr/local/bin' && ln -sfn '/Applications/Tatolab.app/Contents/MacOS/tatolab-cli' '/usr/local/bin/tatolab'",
  );
});

test("paths_with_quotes_stay_one_shell_word_and_one_applescript_string", () => {
  const script = machineSetupAdministratorShellScript([
    {
      kind: "command_line_tool_link",
      linkPath: "/usr/local/bin/tatolab",
      bundledCommandLineTool: "/Users/o'neil/Apps/\"Tatolab\" \\ copy.app/Contents/MacOS/tatolab-cli",
    },
  ]);
  expect(script).toContain(String.raw`ln -sfn '/Users/o'\''neil/Apps/"Tatolab" \ copy.app/Contents/MacOS/tatolab-cli' '/usr/local/bin/tatolab'`);

  const applescript = administratorPromptApplescript(script, MACHINE_SETUP_ADMINISTRATOR_PROMPT_TEXT);
  expect(applescript.startsWith(String.raw`do shell script "mkdir -p '/usr/local/bin' && ln -sfn '/Users/o'\\''neil/Apps/\"Tatolab\" \\ copy.app`)).toBe(true);
  expect(
    applescript.endsWith(
      'with prompt "Tatolab needs to create the machine runtime lock and link the tatolab command so the runtime can start." with administrator privileges',
    ),
  ).toBe(true);
});

test("machine_setup_waits_for_the_administrator_only_while_the_prompt_shows", () => {
  expect(machineSetupStateFrom(false, false)).toBe("complete");
  expect(machineSetupStateFrom(false, true)).toBe("complete");
  expect(machineSetupStateFrom(true, true)).toBe("waiting_for_administrator");
  expect(machineSetupStateFrom(true, false)).toBe("needs_administrator");
});

test("opening_the_app_shows_the_administrator_prompt_once_per_launch_even_when_cancelled", () => {
  const administratorPrompt = new AdministratorPromptThisLaunch();

  expect(administratorPrompt.beginPrompt("app_opened")).toBe(true);
  expect(administratorPrompt.showing()).toBe(true);
  administratorPrompt.finishPrompt();
  expect(administratorPrompt.showing()).toBe(false);

  expect(administratorPrompt.beginPrompt("app_opened")).toBe(false);
  expect(administratorPrompt.showing()).toBe(false);
});

test("set_up_tatolab_shows_the_prompt_again_after_a_cancelled_one", () => {
  const administratorPrompt = new AdministratorPromptThisLaunch();
  expect(administratorPrompt.beginPrompt("app_opened")).toBe(true);
  administratorPrompt.finishPrompt();

  expect(administratorPrompt.beginPrompt("user_asked")).toBe(true);
  administratorPrompt.finishPrompt();
  expect(administratorPrompt.beginPrompt("user_asked")).toBe(true);
});

test("no_second_prompt_shows_while_one_is_showing", () => {
  const administratorPrompt = new AdministratorPromptThisLaunch();
  expect(administratorPrompt.beginPrompt("user_asked")).toBe(true);

  expect(administratorPrompt.beginPrompt("user_asked")).toBe(false);
  expect(administratorPrompt.beginPrompt("app_opened")).toBe(false);
});

test("a_prompt_the_user_asked_for_counts_as_the_launch_prompt", () => {
  const administratorPrompt = new AdministratorPromptThisLaunch();
  expect(administratorPrompt.beginPrompt("user_asked")).toBe(true);
  administratorPrompt.finishPrompt();

  expect(administratorPrompt.beginPrompt("app_opened")).toBe(false);
});

test("reconciling_the_switch_never_shows_the_prompt_nor_counts_as_the_launch_prompt", () => {
  const administratorPrompt = new AdministratorPromptThisLaunch();

  expect(administratorPrompt.beginPrompt("reconciling_the_switch")).toBe(false);
  expect(administratorPrompt.showing()).toBe(false);
  expect(administratorPrompt.beginPrompt("app_opened")).toBe(true);
});

/** A real build's setup under `root` whose administrator prompt is a fake: it records the pieces it is shown for, then creates them when `thePromptCreatesThem`, as an administrator's answer would, or else answers as a cancelled prompt does. */
function realBuildSetupWithAFakeAdministratorPrompt(root: string, thePromptCreatesThem: boolean) {
  const machinePaths: TatolabMachinePathsOnMacos = { ...realShapedPathsUnder(root), localProofTestMachineRoot: null };
  const promptsShown: (readonly MissingMachineSetupPiece[])[] = [];
  const machineSetup = MachineSetupBehindAnAdministratorPrompt.withTheAdministratorPromptRunBy(
    machinePaths,
    null,
    async (missing): Promise<Result<void, string>> => {
      promptsShown.push(missing);
      return thePromptCreatesThem ? prepareLocalProofTestMachineRoot(machinePaths) : failedWith("the administrator prompt was cancelled");
    },
    quietTatolabAppLog,
  );
  return { machineSetup, promptsShown };
}

test("a_real_build_prompts_once_on_opening_and_again_on_request_but_never_while_reconciling", async () => {
  const root = await temporaryRoot();
  const { machineSetup, promptsShown } = realBuildSetupWithAFakeAdministratorPrompt(root, false);
  const missingLock: MissingMachineSetupPiece[] = [
    { kind: "machine_runtime_lock_directory", path: path.join(root, "lock") },
    { kind: "machine_runtime_lock_file", path: path.join(root, "lock", "runtime.lock") },
  ];

  const triggersAndOutcomes: [MachineSetupTrigger, MachineSetupAdministratorPromptOutcome][] = [
    ["reconciling_the_switch", "no_administrator_prompt_shown"],
    ["app_opened", "administrator_prompt_shown"],
    ["app_opened", "no_administrator_prompt_shown"],
    ["reconciling_the_switch", "no_administrator_prompt_shown"],
    ["user_asked", "administrator_prompt_shown"],
  ];
  for (const [trigger, expectedOutcome] of triggersAndOutcomes) {
    expect(await machineSetup.setUpTheMachine(trigger), trigger).toBe(expectedOutcome);
  }
  expect(promptsShown).toEqual([missingLock, missingLock]);
  expect((await machineSetup.observeMachineSetup()).machineSetupState).toBe("needs_administrator");
});

test("a_prompt_that_creates_the_setup_leaves_nothing_to_prompt_for", async () => {
  const root = await temporaryRoot();
  const { machineSetup, promptsShown } = realBuildSetupWithAFakeAdministratorPrompt(root, true);

  expect(await machineSetup.setUpTheMachine("app_opened")).toBe("administrator_prompt_shown");
  expect((await machineSetup.observeMachineSetup()).machineSetupState).toBe("complete");
  expect(await machineSetup.setUpTheMachine("user_asked")).toBe("no_administrator_prompt_shown");
  expect(promptsShown).toHaveLength(1);
});

test("a_local_proof_build_prepares_its_test_root_only_when_reconciling_and_never_prompts", async () => {
  const root = await temporaryRoot();
  const administratorPromptRequests: string[] = [];
  const machineSetup = MachineSetupBehindAnAdministratorPrompt.create(
    pathsUnder(root),
    null,
    {
      runBehindOneAdministratorPrompt: async (shellScript) => {
        administratorPromptRequests.push(shellScript);
        return failedWith({ kind: "cancelled" });
      },
    },
    quietTatolabAppLog,
  );

  for (const trigger of ["app_opened", "user_asked"] as const) {
    expect(await machineSetup.setUpTheMachine(trigger), trigger).toBe("no_administrator_prompt_shown");
  }
  expect((await machineSetup.observeMachineSetup()).machineSetupState).toBe("needs_administrator");

  expect(await machineSetup.setUpTheMachine("reconciling_the_switch")).toBe("no_administrator_prompt_shown");
  expect(await machineSetup.observeMachineSetup()).toEqual({ machineSetupState: "complete", commandLineToolLinkedAt: null });
  expect(administratorPromptRequests).toEqual([]);
});

test("a_set_up_machine_shows_no_prompt_and_reads_the_cli_linked", async () => {
  const root = await temporaryRoot();
  expect((await prepareLocalProofTestMachineRoot(pathsUnder(root))).ok).toBe(true);
  const machinePaths: TatolabMachinePathsOnMacos = { ...realShapedPathsUnder(root), localProofTestMachineRoot: null };
  const linkPath = path.join(root, "bin", "tatolab");
  const bundled = path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli");
  await mkdir(path.join(root, "bin"), { recursive: true });
  await symlink(bundled, linkPath);
  const administratorPromptRequests: string[] = [];
  const machineSetup = MachineSetupBehindAnAdministratorPrompt.create(
    machinePaths,
    bundled,
    {
      runBehindOneAdministratorPrompt: async (shellScript) => {
        administratorPromptRequests.push(shellScript);
        return failedWith({ kind: "cancelled" });
      },
    },
    quietTatolabAppLog,
  );
  const setUpMachine: MachineSetupObservation = { machineSetupState: "complete", commandLineToolLinkedAt: linkPath };
  expect(await machineSetup.observeMachineSetup()).toEqual(setUpMachine);

  for (const trigger of ["reconciling_the_switch", "app_opened", "user_asked"] as const) {
    expect(await machineSetup.setUpTheMachine(trigger), trigger).toBe("no_administrator_prompt_shown");
  }
  expect(await machineSetup.observeMachineSetup()).toEqual(setUpMachine);
  expect(machineSetup.setUpTatolabRefusal()).toBeNull();
  expect(administratorPromptRequests).toEqual([]);
});

test("the administrator prompt's refusal is described in its own words", async () => {
  const runBehindThePrompt = (answer: Result<void, AdministratorPromptFailure>) =>
    machineSetupBehindOneAdministratorPrompt({ runBehindOneAdministratorPrompt: async () => answer })([
      { kind: "machine_runtime_lock_file", path: "/Library/Application Support/Tatolab/runtime.lock" },
    ]);

  expect(await runBehindThePrompt(failedWith({ kind: "cancelled" }))).toEqual(failedWith("the administrator prompt was cancelled"));
  expect(await runBehindThePrompt(failedWith({ kind: "failed", failureDescription: "chown: Operation not permitted (exit status: 1)" }))).toEqual(
    failedWith("machine setup failed: chown: Operation not permitted (exit status: 1)"),
  );
});

test("while the prompt shows, setup waits for the administrator and no second prompt shows, and a prompt that fails to settle still ends", async () => {
  const root = await temporaryRoot();
  const machinePaths: TatolabMachinePathsOnMacos = { ...realShapedPathsUnder(root), localProofTestMachineRoot: null };
  const promptsShowing: ((answer: Result<void, string>) => void)[] = [];
  let theNextPromptRejects = false;
  const machineSetup = MachineSetupBehindAnAdministratorPrompt.withTheAdministratorPromptRunBy(
    machinePaths,
    null,
    (_missing) =>
      theNextPromptRejects
        ? Promise.reject(new Error("the prompt's runner broke"))
        : new Promise((answerThePrompt) => promptsShowing.push(answerThePrompt)),
    quietTatolabAppLog,
  );

  const promptOnOpening = machineSetup.setUpTheMachine("app_opened");
  await expect.poll(() => promptsShowing.length).toBe(1);
  expect((await machineSetup.observeMachineSetup()).machineSetupState).toBe("waiting_for_administrator");
  expect(await machineSetup.setUpTheMachine("user_asked")).toBe("no_administrator_prompt_shown");
  promptsShowing[0]?.(failedWith("the administrator prompt was cancelled"));
  expect(await promptOnOpening).toBe("administrator_prompt_shown");
  expect((await machineSetup.observeMachineSetup()).machineSetupState).toBe("needs_administrator");

  theNextPromptRejects = true;
  await expect(machineSetup.setUpTheMachine("user_asked")).rejects.toThrow("the prompt's runner broke");
  expect((await machineSetup.observeMachineSetup()).machineSetupState).toBe("needs_administrator");
  theNextPromptRejects = false;
  const promptOnRequest = machineSetup.setUpTheMachine("user_asked");
  await expect.poll(() => promptsShowing.length).toBe(2);
  promptsShowing[1]?.(failedWith("the administrator prompt was cancelled"));
  expect(await promptOnRequest).toBe("administrator_prompt_shown");
});
