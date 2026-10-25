// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
  NO_BUNDLED_COMMAND_LINE_TOOL_LINK_REFUSAL,
  USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT,
  USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL,
  USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL,
  usrLocalBinLinkAdministratorShellScript,
} from "./command_line_tool_links_on_this_mac.js";
import { tatolabMachinePathsOnMacosUnderALocalProofTestRoot, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

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

/** A real-shaped machine under a temporary root, with this bundle's CLI in place. */
async function realShapedMachine() {
  const root = await temporaryRoot();
  const bundledCommandLineTool = path.join(root, "Applications/Tatolab.app/Contents/MacOS/tatolab-cli");
  await mkdir(path.dirname(bundledCommandLineTool), { recursive: true });
  await writeFile(bundledCommandLineTool, "");
  const machinePaths: TatolabMachinePathsOnMacos = {
    localApiSocket: path.join(root, "run/local-api.sock"),
    commandLineToolHomeFolderLink: path.join(root, "home/.local/bin/tatolab"),
    commandLineToolUsrLocalBinLink: path.join(root, "usr/local/bin/tatolab"),
    earlierMachineRuntimeLockDirectory: path.join(root, "Library/Application Support/Tatolab"),
    localProofTestMachineRoot: null,
  };
  return { root, bundledCommandLineTool, machinePaths };
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

test("the_home_folder_link_is_made_with_no_prompt_and_its_folder_with_it", async () => {
  const { bundledCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, bundledCommandLineTool, administratorPrompt, quietTatolabAppLog);

  expect((await commandLineToolLinks.observeCommandLineToolLinks()).homeFolderLinkedAt).toBeNull();
  expect(await commandLineToolLinks.linkTheCommandLineToolInTheHomeFolder()).toEqual(succeeded(undefined));

  const homeFolderLink = machinePaths.commandLineToolHomeFolderLink ?? "";
  expect(await readlink(homeFolderLink)).toBe(bundledCommandLineTool);
  expect(await readdir(path.dirname(homeFolderLink)), "no half-made link is left beside it").toEqual(["tatolab"]);
  expect(await commandLineToolLinks.observeCommandLineToolLinks()).toEqual({ homeFolderLinkedAt: homeFolderLink, usrLocalBinLink: { kind: "not_linked" } });
  expect(promptsShown).toEqual([]);
});

test("a_dangling_link_or_one_into_another_tatolab_bundle_is_repointed", async () => {
  const { root, bundledCommandLineTool, machinePaths } = await realShapedMachine();
  const homeFolderLink = machinePaths.commandLineToolHomeFolderLink ?? "";
  await mkdir(path.dirname(homeFolderLink), { recursive: true });
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(
    machinePaths,
    bundledCommandLineTool,
    fakeAdministratorPrompt(succeeded(undefined)).administratorPrompt,
    quietTatolabAppLog,
  );

  for (const earlierTarget of [path.join(root, "Gone/Nothing"), path.join(root, "Downloads/Tatolab.app/Contents/MacOS/tatolab-cli")]) {
    await rm(homeFolderLink, { force: true });
    await symlink(earlierTarget, homeFolderLink);
    expect(await commandLineToolLinkPlace(homeFolderLink, bundledCommandLineTool), earlierTarget).toBe("free_to_link");
    expect(await commandLineToolLinks.linkTheCommandLineToolInTheHomeFolder()).toEqual(succeeded(undefined));
    expect(await readlink(homeFolderLink)).toBe(bundledCommandLineTool);
  }
});

test("someone_elses_file_or_working_link_is_left_alone", async () => {
  const { root, bundledCommandLineTool, machinePaths } = await realShapedMachine();
  const homeFolderLink = machinePaths.commandLineToolHomeFolderLink ?? "";
  await mkdir(path.dirname(homeFolderLink), { recursive: true });
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(
    machinePaths,
    bundledCommandLineTool,
    fakeAdministratorPrompt(succeeded(undefined)).administratorPrompt,
    quietTatolabAppLog,
  );

  await writeFile(homeFolderLink, "#!/bin/sh\n");
  expect(await commandLineToolLinks.linkTheCommandLineToolInTheHomeFolder()).toEqual(
    failedWith({ kind: "refused", refusal: commandLineToolLinkTakenRefusal(homeFolderLink) }),
  );
  expect((await lstat(homeFolderLink)).isFile()).toBe(true);

  const someoneElsesTool = path.join(root, "opt/tatolab");
  await mkdir(path.dirname(someoneElsesTool), { recursive: true });
  await writeFile(someoneElsesTool, "");
  await rm(homeFolderLink);
  await symlink(someoneElsesTool, homeFolderLink);
  expect(await commandLineToolLinkPlace(homeFolderLink, bundledCommandLineTool)).toBe("taken_by_something_else");
  expect(await readlink(homeFolderLink)).toBe(someoneElsesTool);
});

test("an_app_with_no_cli_in_its_bundle_links_nothing_and_offers_no_usr_local_bin_link", async () => {
  const { machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, null, administratorPrompt, quietTatolabAppLog);

  expect(await commandLineToolLinks.linkTheCommandLineToolInTheHomeFolder()).toEqual(
    failedWith({ kind: "not_offered", reason: NO_BUNDLED_COMMAND_LINE_TOOL_LINK_REFUSAL }),
  );
  expect(await commandLineToolLinks.observeCommandLineToolLinks()).toEqual({
    homeFolderLinkedAt: null,
    usrLocalBinLink: { kind: "not_offered", reason: NO_BUNDLED_COMMAND_LINE_TOOL_LINK_REFUSAL },
  });
  expect(promptsShown).toEqual([]);
});

test("the_usr_local_bin_link_is_made_behind_one_administrator_prompt", async () => {
  const { bundledCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, bundledCommandLineTool, administratorPrompt, quietTatolabAppLog);
  const usrLocalBinLink = machinePaths.commandLineToolUsrLocalBinLink ?? "";

  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(succeeded(undefined));
  expect(promptsShown).toEqual([
    { shellScript: usrLocalBinLinkAdministratorShellScript(usrLocalBinLink, bundledCommandLineTool), promptText: USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT },
  ]);
});

test("the_usr_local_bin_script_makes_the_link_and_its_folder", async () => {
  const { bundledCommandLineTool, machinePaths } = await realShapedMachine();
  const usrLocalBinLink = machinePaths.commandLineToolUsrLocalBinLink ?? "";
  const { runProgramToCompletion } = await import("../run_program_to_completion.js");

  const linking = await runProgramToCompletion("/bin/sh", ["-c", usrLocalBinLinkAdministratorShellScript(usrLocalBinLink, bundledCommandLineTool)]);
  expect(linking.ok && linking.value.exitStatus, JSON.stringify(linking)).toBe(0);
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(
    machinePaths,
    bundledCommandLineTool,
    fakeAdministratorPrompt(succeeded(undefined)).administratorPrompt,
    quietTatolabAppLog,
  );
  expect((await commandLineToolLinks.observeCommandLineToolLinks()).usrLocalBinLink).toEqual({ kind: "linked", path: usrLocalBinLink });
  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin(), "an existing link needs no prompt").toEqual(succeeded(undefined));
});

test("a_cancelled_or_failed_prompt_says_so_and_a_second_waits_for_the_first", async () => {
  const { bundledCommandLineTool, machinePaths } = await realShapedMachine();
  const { administratorPrompt, promptsShown, heldPrompts } = fakeAdministratorPrompt("held");
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, bundledCommandLineTool, administratorPrompt, quietTatolabAppLog);

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

test("a_local_proof_build_links_under_its_test_root_and_never_in_usr_local_bin", async () => {
  const { root, bundledCommandLineTool } = await realShapedMachine();
  const machinePaths = tatolabMachinePathsOnMacosUnderALocalProofTestRoot(path.join(root, "proof"));
  const { administratorPrompt, promptsShown } = fakeAdministratorPrompt(succeeded(undefined));
  const commandLineToolLinks = new CommandLineToolLinksOnThisMac(machinePaths, bundledCommandLineTool, administratorPrompt, quietTatolabAppLog);

  expect(await commandLineToolLinks.linkTheCommandLineToolInTheHomeFolder()).toEqual(succeeded(undefined));
  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(
    failedWith({ kind: "not_offered", reason: LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL }),
  );
  expect(await commandLineToolLinks.observeCommandLineToolLinks()).toEqual({
    homeFolderLinkedAt: path.join(root, "proof/home/.local/bin/tatolab"),
    usrLocalBinLink: { kind: "not_offered", reason: LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL },
  });
  expect(promptsShown).toEqual([]);
});
