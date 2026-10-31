import { lstat, mkdir, mkdtemp, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import type { AdministratorPrompt, AdministratorPromptFailure } from "./administrator_prompt.js";
import {
  CommandLineToolLinksOnThisMac,
  commandLineToolLinkPlace,
  commandLineToolLinkTakenRefusal,
  LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL,
  USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT,
  USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL,
  USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL,
  usrLocalBinLinkAdministratorShellScript,
} from "./command_line_tool_links_on_this_mac.js";
import {
  installedCommandLineToolIn,
  tatolabMachinePathsOnMacosForTheRealMachine,
  tatolabMachinePathsOnMacosUnderALocalProofTestRoot,
  type TatolabMachinePathsOnMacos,
} from "./tatolab_machine_paths.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  // macOS: os.tmpdir() is under /var, a link to /private/var.
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "tatolab-command-links-")));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** A real-shaped machine under a temporary root, with the installer's build of the CLI in place. */
async function realShapedMachine() {
  const root = await temporaryRoot();
  const runtimeInstallDirectory = path.join(root, "home/Library/Application Support/com.tatolab.runtime");
  const installedCommandLineTool = installedCommandLineToolIn(runtimeInstallDirectory);
  const installedBuild = path.join(runtimeInstallDirectory, `0.68.0-${"1".repeat(40)}`);
  await mkdir(path.join(installedBuild, "Tatolab Runtime.app/Contents/MacOS"), { recursive: true });
  await writeFile(path.join(installedBuild, "Tatolab Runtime.app/Contents/MacOS/tatolab-cli"), "");
  await symlink(path.basename(installedBuild), path.join(runtimeInstallDirectory, "current"));
  const machinePaths: TatolabMachinePathsOnMacos = {
    ...tatolabMachinePathsOnMacosForTheRealMachine(501, path.join(root, "home")),
    commandLineToolUsrLocalBinLink: path.join(root, "usr/local/bin/tatolab"),
  };
  return { root, installedCommandLineTool, machinePaths };
}

/** An administrator prompt that records each script and answers as the test says, or holds until the test answers it. */
function fakeAdministratorPrompt(answer: Result<void, AdministratorPromptFailure> | "held") {
  const promptsShown: { shellScript: string; promptText: string }[] = [];
  const heldPrompts: ((answer: Result<void, AdministratorPromptFailure>) => void)[] = [];
  const administratorPrompt: AdministratorPrompt = {
    runBehindOneAdministratorPrompt: (shellScript, promptText) => {
      promptsShown.push({ shellScript, promptText });
      if (answer === "held") return new Promise((answerThePrompt) => heldPrompts.push(answerThePrompt));
      return Promise.resolve(answer);
    },
  };
  return { administratorPrompt, promptsShown, heldPrompts };
}

test("the_home_folder_link_is_the_installers_read_with_no_prompt", async () => {
  const { installedCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, installedCommandLineTool, administratorPrompt, quietTatolabAppLog);
  const homeFolderLink = machinePaths.commandLineToolHomeFolderLink ?? "";

  expect((await commandLineToolLinks.observeCommandLineToolLinks()).homeFolderLinkedAt).toBeNull();
  await mkdir(path.dirname(homeFolderLink), { recursive: true });
  await symlink(installedCommandLineTool, homeFolderLink);
  expect(await commandLineToolLinks.observeCommandLineToolLinks()).toEqual({ homeFolderLinkedAt: homeFolderLink, usrLocalBinLink: { kind: "not_linked" } });
  expect(promptsShown).toEqual([]);
});

test("a_dangling_link_or_one_into_another_tatolab_bundle_is_free_to_link_and_someone_elses_is_not", async () => {
  const { root, installedCommandLineTool, machinePaths } = await realShapedMachine();
  const usrLocalBinLink = machinePaths.commandLineToolUsrLocalBinLink ?? "";
  await mkdir(path.dirname(usrLocalBinLink), { recursive: true });

  for (const earlierTarget of [path.join(root, "Gone/Nothing"), path.join(root, "Downloads/Tatolab.app/Contents/MacOS/tatolab-cli")]) {
    await rm(usrLocalBinLink, { force: true });
    await symlink(earlierTarget, usrLocalBinLink);
    expect(await commandLineToolLinkPlace(usrLocalBinLink, installedCommandLineTool), earlierTarget).toBe("free_to_link");
  }

  const someoneElsesTool = path.join(root, "opt/tatolab");
  await mkdir(path.dirname(someoneElsesTool), { recursive: true });
  await writeFile(someoneElsesTool, "");
  await rm(usrLocalBinLink);
  await symlink(someoneElsesTool, usrLocalBinLink);
  expect(await commandLineToolLinkPlace(usrLocalBinLink, installedCommandLineTool)).toBe("taken_by_something_else");
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(
    machinePaths,
    installedCommandLineTool,
    fakeAdministratorPrompt(succeeded(undefined)).administratorPrompt,
    quietTatolabAppLog,
  );
  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(
    failedWith({ kind: "refused", refusal: commandLineToolLinkTakenRefusal(usrLocalBinLink) }),
  );
  expect(await readlink(usrLocalBinLink)).toBe(someoneElsesTool);
  expect((await lstat(someoneElsesTool)).isFile()).toBe(true);
});

test("the_usr_local_bin_link_is_made_behind_one_administrator_prompt", async () => {
  const { installedCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, installedCommandLineTool, administratorPrompt, quietTatolabAppLog);
  const usrLocalBinLink = machinePaths.commandLineToolUsrLocalBinLink ?? "";

  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(succeeded(undefined));
  expect(promptsShown).toEqual([
    { shellScript: usrLocalBinLinkAdministratorShellScript(usrLocalBinLink, installedCommandLineTool), promptText: USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT },
  ]);
});

test("the_usr_local_bin_script_makes_the_link_and_its_folder", async () => {
  const { installedCommandLineTool, machinePaths } = await realShapedMachine();
  const usrLocalBinLink = machinePaths.commandLineToolUsrLocalBinLink ?? "";
  const { runProgramToCompletion } = await import("../run_program_to_completion.js");

  const linking = await runProgramToCompletion("/bin/sh", ["-c", usrLocalBinLinkAdministratorShellScript(usrLocalBinLink, installedCommandLineTool)]);
  expect(linking.ok && linking.value.exitStatus, JSON.stringify(linking)).toBe(0);
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(
    machinePaths,
    installedCommandLineTool,
    fakeAdministratorPrompt(succeeded(undefined)).administratorPrompt,
    quietTatolabAppLog,
  );
  expect((await commandLineToolLinks.observeCommandLineToolLinks()).usrLocalBinLink).toEqual({ kind: "linked", path: usrLocalBinLink });
  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin(), "an existing link needs no prompt").toEqual(succeeded(undefined));
});

test("a_cancelled_or_failed_prompt_says_so_and_a_second_waits_for_the_first", async () => {
  const { installedCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown, heldPrompts } = fakeAdministratorPrompt("held");
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, installedCommandLineTool, administratorPrompt, quietTatolabAppLog);

  const firstLinking = commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin();
  await expect.poll(() => heldPrompts.length).toBe(1);
  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(
    failedWith({ kind: "refused", refusal: USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL }),
  );
  heldPrompts[0]?.(failedWith({ kind: "cancelled" }));
  expect(await firstLinking).toEqual(failedWith({ kind: "refused", refusal: USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL }));

  const secondLinking = commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin();
  await expect.poll(() => heldPrompts.length).toBe(2);
  heldPrompts[1]?.(failedWith({ kind: "failed", failureDescription: "ln: Operation not permitted (exit status: 1)" }));
  expect(await secondLinking).toEqual(
    failedWith({ kind: "refused", refusal: "tatolab couldn't be linked in /usr/local/bin: ln: Operation not permitted (exit status: 1)" }),
  );
  expect(promptsShown).toHaveLength(2);
});

test("a_local_proof_build_never_links_in_usr_local_bin", async () => {
  const { root, installedCommandLineTool } = await realShapedMachine();
  const machinePaths = tatolabMachinePathsOnMacosUnderALocalProofTestRoot(path.join(root, "proof"));
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, installedCommandLineTool, administratorPrompt, quietTatolabAppLog);

  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(
    failedWith({ kind: "not_offered", reason: LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL }),
  );
  expect(await commandLineToolLinks.observeCommandLineToolLinks()).toEqual({
    homeFolderLinkedAt: null,
    usrLocalBinLink: { kind: "not_offered", reason: LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL },
  });
  expect(promptsShown).toEqual([]);
});

test("two links asked for at once show one prompt, and the second is refused while it shows", async () => {
  const { installedCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown, heldPrompts } = fakeAdministratorPrompt("held");
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, installedCommandLineTool, administratorPrompt, quietTatolabAppLog);

  const firstLinking = commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin();
  const secondLinking = commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin();

  expect(await secondLinking).toEqual(failedWith({ kind: "refused", refusal: USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL }));
  await expect.poll(() => heldPrompts.length).toBe(1);
  heldPrompts[0]?.(succeeded(undefined));
  expect(await firstLinking).toEqual(succeeded(undefined));
  expect(promptsShown).toHaveLength(1);
});
