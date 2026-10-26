import { lstat, mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { RunTatolabReconciliation } from "../../run_tatolab_switch.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import type { AdministratorPromptFailure } from "./administrator_prompt.js";
import { runProgramToCompletion } from "../run_program_to_completion.js";
import { tatolabMachinePathsOnMacosUnderALocalProofTestRoot, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";
import {
  machineFilesToRemove,
  removeTheAppConfigDirectoryNamedFor,
  runTatolabTurnedOff,
  TatolabUninstallOnThisMac,
  tatolabUninstallAdministratorShellScript,
  uninstallTatolabInOrder,
  type MachineFilesToRemove,
  type TatolabUninstallSteps,
} from "./tatolab_uninstall_on_this_mac.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  // macOS: os.tmpdir() is under /var, a link to /private/var, and the code under test realpaths.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-uninstall-")));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type FakeUninstallStep =
  | { kind: "administrator_prompt"; removalScript: string }
  | { kind: "remove_the_home_folder_link"; homeFolderLink: string }
  | { kind: "remove_the_local_proof_test_root"; testMachineRoot: string }
  | { kind: "turn_run_tatolab_off" }
  | { kind: "remove_the_app_config_directory" }
  | { kind: "move_this_app_bundle_to_the_trash" }
  | { kind: "quit_the_app" };

/** Records every step it is asked to take; the prompt answers as the test says, and one step may fail. */
function fakeUninstallStepsAnsweringThePrompt(
  administratorPromptAnswer: Result<void, AdministratorPromptFailure>,
  failingStepKind: FakeUninstallStep["kind"] | null = null,
) {
  const stepsTaken: FakeUninstallStep[] = [];
  const take = async (uninstallStep: FakeUninstallStep): Promise<Result<void, string>> => {
    stepsTaken.push(uninstallStep);
    return uninstallStep.kind === failingStepKind ? failedWith(`${uninstallStep.kind} failed`) : succeeded(undefined);
  };
  const steps: TatolabUninstallSteps = {
    runBehindTheAdministratorPrompt: async (removalScript) => {
      stepsTaken.push({ kind: "administrator_prompt", removalScript });
      return administratorPromptAnswer;
    },
    removeTheHomeFolderLink: (homeFolderLink) => take({ kind: "remove_the_home_folder_link", homeFolderLink }),
    removeTheLocalProofTestRoot: (testMachineRoot) => take({ kind: "remove_the_local_proof_test_root", testMachineRoot }),
    turnRunTatolabOff: () => take({ kind: "turn_run_tatolab_off" }),
    removeTheAppConfigDirectory: () => take({ kind: "remove_the_app_config_directory" }),
    moveThisAppBundleToTheTrash: () => take({ kind: "move_this_app_bundle_to_the_trash" }),
    quitTheApp: () => {
      stepsTaken.push({ kind: "quit_the_app" });
    },
  };
  return { steps, stepsTaken };
}

const REMOVAL_BEHIND_THE_PROMPT: MachineFilesToRemove = {
  kind: "this_users_and_the_machines",
  homeFolderLink: "/Users/someone/.local/bin/tatolab",
  removalScriptBehindTheAdministratorPrompt: `case "$(readlink '/usr/local/bin/tatolab')" in '/Applications/Tatolab.app'/*) rm -f '/usr/local/bin/tatolab' ;; esac`,
};

test("a_real_build_prompts_once_then_removes_the_home_link_stops_the_runtime_removes_the_app_and_quits", async () => {
  const { steps, stepsTaken } = fakeUninstallStepsAnsweringThePrompt(succeeded(undefined));

  expect(await uninstallTatolabInOrder(steps, REMOVAL_BEHIND_THE_PROMPT)).toEqual(succeeded(undefined));
  expect(stepsTaken).toEqual([
    { kind: "administrator_prompt", removalScript: `case "$(readlink '/usr/local/bin/tatolab')" in '/Applications/Tatolab.app'/*) rm -f '/usr/local/bin/tatolab' ;; esac` },
    { kind: "remove_the_home_folder_link", homeFolderLink: "/Users/someone/.local/bin/tatolab" },
    { kind: "turn_run_tatolab_off" },
    { kind: "remove_the_app_config_directory" },
    { kind: "move_this_app_bundle_to_the_trash" },
    { kind: "quit_the_app" },
  ]);
});

test("a_cancelled_prompt_changes_nothing", async () => {
  const { steps, stepsTaken } = fakeUninstallStepsAnsweringThePrompt(failedWith({ kind: "cancelled" }));

  expect(await uninstallTatolabInOrder(steps, REMOVAL_BEHIND_THE_PROMPT)).toEqual(
    failedWith("the administrator prompt was cancelled, so nothing was uninstalled"),
  );
  expect(stepsTaken).toHaveLength(1);
});

test("a_failed_prompt_changes_nothing_else_and_says_why", async () => {
  const { steps, stepsTaken } = fakeUninstallStepsAnsweringThePrompt(
    failedWith({ kind: "failed", failureDescription: "rm: Operation not permitted (exit status: 1)" }),
  );

  expect(await uninstallTatolabInOrder(steps, REMOVAL_BEHIND_THE_PROMPT)).toEqual(
    failedWith("the machine's Tatolab files could not be removed: rm: Operation not permitted (exit status: 1)"),
  );
  expect(stepsTaken).toHaveLength(1);
});

test("with_nothing_only_root_may_remove_no_prompt_shows", async () => {
  const { steps, stepsTaken } = fakeUninstallStepsAnsweringThePrompt(failedWith({ kind: "cancelled" }));

  expect(
    await uninstallTatolabInOrder(steps, { ...REMOVAL_BEHIND_THE_PROMPT, removalScriptBehindTheAdministratorPrompt: null }),
  ).toEqual(succeeded(undefined));
  expect(stepsTaken.map((stepTaken) => stepTaken.kind)).toEqual([
    "remove_the_home_folder_link",
    "turn_run_tatolab_off",
    "remove_the_app_config_directory",
    "move_this_app_bundle_to_the_trash",
    "quit_the_app",
  ]);
});

test("a_local_proof_build_removes_its_test_root_with_no_prompt", async () => {
  const { steps, stepsTaken } = fakeUninstallStepsAnsweringThePrompt(failedWith({ kind: "cancelled" }));

  expect(await uninstallTatolabInOrder(steps, { kind: "local_proof_test_root", testMachineRoot: "/tmp/tatolab-proof" })).toEqual(
    succeeded(undefined),
  );
  expect(stepsTaken).toEqual([
    { kind: "remove_the_local_proof_test_root", testMachineRoot: "/tmp/tatolab-proof" },
    { kind: "turn_run_tatolab_off" },
    { kind: "remove_the_app_config_directory" },
    { kind: "move_this_app_bundle_to_the_trash" },
    { kind: "quit_the_app" },
  ]);
});

test("the_first_failing_step_stops_the_rest_and_the_app_stays_open", async () => {
  const { steps, stepsTaken } = fakeUninstallStepsAnsweringThePrompt(succeeded(undefined), "move_this_app_bundle_to_the_trash");

  expect(await uninstallTatolabInOrder(steps, REMOVAL_BEHIND_THE_PROMPT)).toEqual(failedWith("move_this_app_bundle_to_the_trash failed"));
  expect(stepsTaken.at(-1)).toEqual({ kind: "move_this_app_bundle_to_the_trash" });
});

/** A real-shaped machine under a temporary root, its `/usr/local/bin` link to `usrLocalBinLinkTargetInsideRoot` when given. */
async function realShapedMachineUnder(usrLocalBinLinkTargetInsideRoot: string | null) {
  const root = await temporaryRoot();
  const machinePaths: TatolabMachinePathsOnMacos = {
    localApiSocket: path.join(root, "run/local-api.sock"),
    commandLineToolHomeFolderLink: path.join(root, "home/.local/bin/tatolab"),
    commandLineToolUsrLocalBinLink: path.join(root, "usr/local/bin/tatolab"),
    localProofTestMachineRoot: null,
  };
  if (usrLocalBinLinkTargetInsideRoot !== null) {
    await mkdir(path.join(root, "usr/local/bin"), { recursive: true });
    await symlink(path.join(root, usrLocalBinLinkTargetInsideRoot), path.join(root, "usr/local/bin/tatolab"));
  }
  return { root, machinePaths };
}

test("the_password_is_asked_only_for_a_usr_local_bin_link_into_this_app", async () => {
  const linkedHere = await realShapedMachineUnder("Apps/Tatolab.app/Contents/MacOS/tatolab-cli");
  const appBundle = path.join(linkedHere.root, "Apps/Tatolab.app");
  expect(await machineFilesToRemove(linkedHere.machinePaths, appBundle)).toEqual({
    kind: "this_users_and_the_machines",
    homeFolderLink: path.join(linkedHere.root, "home/.local/bin/tatolab"),
    removalScriptBehindTheAdministratorPrompt: tatolabUninstallAdministratorShellScript(path.join(linkedHere.root, "usr/local/bin/tatolab"), appBundle),
  });

  const intoAnotherBundle = await realShapedMachineUnder("Apps/Other.app/Contents/MacOS/tatolab-cli");
  expect(await machineFilesToRemove(intoAnotherBundle.machinePaths, path.join(intoAnotherBundle.root, "Apps/Tatolab.app"))).toMatchObject({
    removalScriptBehindTheAdministratorPrompt: null,
  });

  const notLinked = await realShapedMachineUnder(null);
  expect(await machineFilesToRemove(notLinked.machinePaths, path.join(notLinked.root, "Apps/Tatolab.app"))).toMatchObject({
    removalScriptBehindTheAdministratorPrompt: null,
  });
});

test("a_local_proof_build_removes_its_test_root", async () => {
  expect(await machineFilesToRemove(tatolabMachinePathsOnMacosUnderALocalProofTestRoot("/tmp/tatolab-proof"), "/Applications/Tatolab.app")).toEqual({
    kind: "local_proof_test_root",
    testMachineRoot: "/tmp/tatolab-proof",
  });
});

test("a_bundle_path_with_quotes_and_glob_characters_stays_one_literal_shell_word", () => {
  expect(
    tatolabUninstallAdministratorShellScript("/usr/local/bin/tatolab", '/Users/o\'neil/My Apps/T*tolab "x" \\ $HOME.app'),
  ).toBe(String.raw`case "$(readlink '/usr/local/bin/tatolab')" in '/Users/o'\''neil/My Apps/T*tolab "x" \ $HOME.app'/*) rm -f '/usr/local/bin/tatolab' ;; esac`);
});

/** A machine under a temporary root with the CLI linked to `linkTargetInsideRoot` when given. */
async function machineFilesWithTheCliLinkedTo(linkTargetInsideRoot: string | null) {
  const root = await temporaryRoot();
  const commandLineToolLink = path.join(root, "bin/tatolab");
  await mkdir(path.dirname(commandLineToolLink), { recursive: true });
  if (linkTargetInsideRoot !== null) await symlink(path.join(root, linkTargetInsideRoot), commandLineToolLink);
  return {
    /** Run the uninstall's removal script as this user, for the bundle at `appBundleInsideRoot`. */
    async runTheRemovalScriptFor(appBundleInsideRoot: string) {
      const removalScript = tatolabUninstallAdministratorShellScript(commandLineToolLink, path.join(root, appBundleInsideRoot)) ?? "";
      const removal = await runProgramToCompletion("/bin/sh", ["-c", removalScript]);
      expect(removal.ok && removal.value.exitStatus, `${removalScript}: ${JSON.stringify(removal)}`).toBe(0);
    },
    async commandLineToolLinkRemains() {
      return (await lstat(commandLineToolLink).catch(() => null)) !== null;
    },
  };
}

test("with_no_usr_local_bin_link_there_is_no_removal_script", () => {
  expect(tatolabUninstallAdministratorShellScript(null, "/Applications/Tatolab.app")).toBeNull();
});

test("the_removal_script_removes_the_cli_link_only_while_it_points_into_this_bundle", async () => {
  const intoThisBundle = await machineFilesWithTheCliLinkedTo("Apps/Tatolab.app/Contents/MacOS/tatolab-cli");
  await intoThisBundle.runTheRemovalScriptFor("Apps/Tatolab.app");
  expect(await intoThisBundle.commandLineToolLinkRemains()).toBe(false);

  const intoAnotherBundle = await machineFilesWithTheCliLinkedTo("Apps/Tatolab.app.old/Contents/MacOS/tatolab-cli");
  await intoAnotherBundle.runTheRemovalScriptFor("Apps/Tatolab.app");
  expect(await intoAnotherBundle.commandLineToolLinkRemains()).toBe(true);

  const withoutALink = await machineFilesWithTheCliLinkedTo(null);
  await withoutALink.runTheRemovalScriptFor("Apps/Tatolab.app");
  expect(await withoutALink.commandLineToolLinkRemains()).toBe(false);
});

test("the_removal_script_matches_a_bundle_named_with_quotes_and_globs_literally", async () => {
  const intoAQuotedBundle = await machineFilesWithTheCliLinkedTo("Apps/o'neil \"T\".app/Contents/MacOS/tatolab-cli");
  await intoAQuotedBundle.runTheRemovalScriptFor("Apps/o'neil \"T\".app");
  expect(await intoAQuotedBundle.commandLineToolLinkRemains()).toBe(false);

  const intoABundleAGlobWouldMatch = await machineFilesWithTheCliLinkedTo("Apps/Tatolab.app/Contents/MacOS/tatolab-cli");
  await intoABundleAGlobWouldMatch.runTheRemovalScriptFor("Apps/T*.app");
  expect(await intoABundleAGlobWouldMatch.commandLineToolLinkRemains()).toBe(true);
});

test("only_an_unregistered_agent_lets_the_uninstall_go_on_past_run_tatolab", () => {
  expect(runTatolabTurnedOff({ kind: "unregistered" })).toEqual(succeeded(undefined));
  expect(runTatolabTurnedOff({ kind: "unregistration_failed", failureDescription: "Operation not permitted" })).toEqual(
    failedWith("the runtime's launch agent could not be unregistered: Operation not permitted"),
  );
  const unexpectedReconciliations: RunTatolabReconciliation[] = [
    { kind: "switch_is_off" },
    { kind: "already_enabled" },
    { kind: "needs_approval_in_login_items", openedLoginItemsSettings: false },
  ];
  for (const unexpectedReconciliation of unexpectedReconciliations) {
    const turnedOff = runTatolabTurnedOff(unexpectedReconciliation);
    expect(turnedOff.ok ? "" : turnedOff.failure).toContain(JSON.stringify(unexpectedReconciliation));
  }
});

test("only_a_config_directory_named_for_the_app_is_removed", async () => {
  const root = await temporaryRoot();
  const appConfigDirectory = path.join(root, "com.tatolab.tatolab");
  await mkdir(appConfigDirectory, { recursive: true });
  await writeFile(path.join(appConfigDirectory, "run-tatolab.json"), "{}");

  const misnamed = await removeTheAppConfigDirectoryNamedFor(root, "com.tatolab.tatolab");
  expect(misnamed.ok ? "" : misnamed.failure).toContain("not named for the app's identifier");
  expect(await stat(root).catch(() => null)).not.toBeNull();

  expect(await removeTheAppConfigDirectoryNamedFor(appConfigDirectory, "com.tatolab.tatolab")).toEqual(succeeded(undefined));
  expect(await stat(appConfigDirectory).catch(() => null)).toBeNull();
  expect(await removeTheAppConfigDirectoryNamedFor(appConfigDirectory, "com.tatolab.tatolab"), "an absent config directory is already removed").toEqual(
    succeeded(undefined),
  );
});

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

test("an unpackaged app has no bundle to uninstall and changes nothing", async () => {
  const appSurfaceCalls: string[] = [];
  const tatolabUninstall = new TatolabUninstallOnThisMac(
    (await realShapedMachineUnder("Tatolab.app/Contents/MacOS/tatolab-cli")).machinePaths,
    null,
    "/nowhere/com.tatolab.tatolab",
    "com.tatolab.tatolab",
    {
      runBehindOneAdministratorPrompt: async (removalScript) => {
        appSurfaceCalls.push(`prompt ${removalScript}`);
        return succeeded(undefined);
      },
    },
    {
      moveToTheTrash: async (itemPath) => {
        appSurfaceCalls.push(`trash ${itemPath}`);
        return succeeded(undefined);
      },
      quitTheApp: () => appSurfaceCalls.push("quit"),
    },
    quietTatolabAppLog,
  );
  const runTatolabSwitch = {
    setRunTatolab: async (): Promise<RunTatolabReconciliation> => {
      appSurfaceCalls.push("turn Run Tatolab off");
      return { kind: "unregistered" };
    },
  };

  expect(await tatolabUninstall.uninstallTatolab(runTatolabSwitch)).toEqual(
    failedWith("this Tatolab is not running from Tatolab.app, so there is no app to uninstall"),
  );
  expect(appSurfaceCalls).toEqual([]);
});

test("a second uninstall while one is under way is refused, and a refused one can be tried again", async () => {
  const root = await temporaryRoot();
  const appExecutable = path.join(root, "Tatolab.app/Contents/MacOS/Tatolab");
  await mkdir(path.dirname(appExecutable), { recursive: true });
  await writeFile(appExecutable, "");
  const appConfigDirectory = path.join(root, "config", "com.tatolab.tatolab");
  await mkdir(appConfigDirectory, { recursive: true });
  const homeFolderLink = path.join(root, "home/.local/bin/tatolab");
  await mkdir(path.dirname(homeFolderLink), { recursive: true });
  await symlink(path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli"), homeFolderLink);
  await mkdir(path.join(root, "usr/local/bin"), { recursive: true });
  await symlink(path.join(root, "Tatolab.app/Contents/MacOS/tatolab-cli"), path.join(root, "usr/local/bin/tatolab"));
  const promptsShowing: ((answer: Result<void, AdministratorPromptFailure>) => void)[] = [];
  const appSurfaceCalls: string[] = [];
  const tatolabUninstall = new TatolabUninstallOnThisMac(
    { ...(await realShapedMachineUnder(null)).machinePaths, commandLineToolUsrLocalBinLink: path.join(root, "usr/local/bin/tatolab"), commandLineToolHomeFolderLink: path.join(root, "home/.local/bin/tatolab") },
    appExecutable,
    appConfigDirectory,
    "com.tatolab.tatolab",
    { runBehindOneAdministratorPrompt: () => new Promise((answerThePrompt) => promptsShowing.push(answerThePrompt)) },
    {
      moveToTheTrash: async (itemPath) => {
        appSurfaceCalls.push(`trash ${path.relative(root, itemPath)}`);
        return succeeded(undefined);
      },
      quitTheApp: () => appSurfaceCalls.push("quit"),
    },
    quietTatolabAppLog,
  );
  const runTatolabSwitch = { setRunTatolab: async (): Promise<RunTatolabReconciliation> => ({ kind: "unregistered" }) };

  const firstUninstall = tatolabUninstall.uninstallTatolab(runTatolabSwitch);
  await expect.poll(() => promptsShowing.length).toBe(1);
  expect(await tatolabUninstall.uninstallTatolab(runTatolabSwitch)).toEqual(failedWith("Tatolab is already being uninstalled"));
  promptsShowing[0]?.(failedWith({ kind: "cancelled" }));
  expect(await firstUninstall).toEqual(failedWith("the administrator prompt was cancelled, so nothing was uninstalled"));
  expect(appSurfaceCalls).toEqual([]);
  expect(await lstat(homeFolderLink).catch(() => null)).not.toBeNull();

  const secondUninstall = tatolabUninstall.uninstallTatolab(runTatolabSwitch);
  await expect.poll(() => promptsShowing.length).toBe(2);
  promptsShowing[1]?.(succeeded(undefined));
  expect(await secondUninstall).toEqual(succeeded(undefined));
  expect(appSurfaceCalls).toEqual(["trash Tatolab.app", "quit"]);
  expect(await stat(appConfigDirectory).catch(() => null)).toBeNull();
  expect(await lstat(homeFolderLink).catch(() => null)).toBeNull();
});
