// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The `tatolab` command's links on macOS: `~/.local/bin/tatolab`, which the app makes with no
// prompt each time it opens, and `/usr/local/bin/tatolab`, which it makes behind the
// administrator prompt only when the person asks. Either is replaced only when it is missing, a
// dangling link, or a link into a Tatolab bundle, never when it is someone else's file.

import { lstat, mkdir, readlink, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";
import type { CommandLineToolUsrLocalBinLink } from "../../../../src/backend/tatolab_backend_contract.js";
import { somethingIsAt } from "../../file_system_entries_on_this_machine.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { CommandLineToolLinkRefusal, CommandLineToolLinksObservation, TatolabCommandLineToolLinks } from "../tatolab_command_line_tool_links.js";
import { shellWordForPath, type AdministratorPrompt } from "./administrator_prompt.js";
import { isABundledCommandLineToolPath, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

/** The words the `/usr/local/bin` link's administrator prompt shows under "osascript wants to make changes." */
export const USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT = "Tatolab wants to link the tatolab command in /usr/local/bin, so it works in every terminal.";

/** Why a local-proof build offers no `/usr/local/bin` link. */
export const LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL = "A local-proof build never links tatolab in /usr/local/bin.";

/** Why an app with no CLI in its bundle links nothing: an unpackaged app runs from Electron's. */
export const NO_BUNDLED_COMMAND_LINE_TOOL_LINK_REFUSAL = "Only Tatolab.app carries a tatolab command to link.";

/** Why there is no home-folder link without an absolute home folder. */
const NO_HOME_FOLDER_LINK_REFUSAL = "There is no home folder to link tatolab in.";

/** Why a second `/usr/local/bin` link waits: one administrator prompt at a time. */
export const USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL = "The password prompt is already open.";

/** Why a cancelled `/usr/local/bin` prompt changed nothing. */
export const USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL = "The password prompt was cancelled, so nothing changed.";

/** What sits where a link goes: this app's link; nothing Tatolab must keep, so it may be linked; or something else, left alone. */
export type CommandLineToolLinkPlace = "linked_to_this_app" | "free_to_link" | "taken_by_something_else";

/** What sits at `linkPath` for the CLI at `bundledCommandLineTool`: nothing, a dangling link or a link into a Tatolab bundle are free to link. */
export async function commandLineToolLinkPlace(linkPath: string, bundledCommandLineTool: string): Promise<CommandLineToolLinkPlace> {
  const entry = await lstat(linkPath).catch(() => null);
  if (entry === null) return "free_to_link";
  if (!entry.isSymbolicLink()) return "taken_by_something_else";
  const linkTarget = await readlink(linkPath).catch(() => null);
  if (linkTarget === bundledCommandLineTool) return "linked_to_this_app";
  if (linkTarget !== null && isABundledCommandLineToolPath(linkTarget)) return "free_to_link";
  return (await somethingIsAt(linkPath)) ? "taken_by_something_else" : "free_to_link";
}

/** Why `linkPath` was left alone. */
export function commandLineToolLinkTakenRefusal(linkPath: string): string {
  return `${linkPath} is not a link to Tatolab, so Tatolab left it alone.`;
}

/** Whether a link at `linkPath` is still to be made: already made, or free to make; refused when something else holds the name. */
async function linkStillToBeMade(linkPath: string, bundledCommandLineTool: string): Promise<Result<boolean, CommandLineToolLinkRefusal>> {
  switch (await commandLineToolLinkPlace(linkPath, bundledCommandLineTool)) {
    case "linked_to_this_app":
      return succeeded(false);
    case "free_to_link":
      return succeeded(true);
    case "taken_by_something_else":
      return failedWith({ kind: "refused", refusal: commandLineToolLinkTakenRefusal(linkPath) });
  }
}

/** The one root shell script that links `/usr/local/bin/tatolab` to `bundledCommandLineTool`, making the folder when it is missing. */
export function usrLocalBinLinkAdministratorShellScript(usrLocalBinLink: string, bundledCommandLineTool: string): string {
  return `mkdir -p ${shellWordForPath(path.dirname(usrLocalBinLink))} && ln -sfn ${shellWordForPath(bundledCommandLineTool)} ${shellWordForPath(usrLocalBinLink)}`;
}

/** Point `linkPath` at `linkTarget` in one rename, making its folder when it is missing, so a terminal never finds it half made. */
async function linkReplacedWhole(linkPath: string, linkTarget: string): Promise<Result<void, string>> {
  const linkBeingMade = path.join(path.dirname(linkPath), `.${path.basename(linkPath)}.tatolab-${process.pid}`);
  try {
    await mkdir(path.dirname(linkPath), { recursive: true });
    await rm(linkBeingMade, { force: true });
    await symlink(linkTarget, linkBeingMade);
    await rename(linkBeingMade, linkPath);
    return succeeded(undefined);
  } catch (linkFailure) {
    await rm(linkBeingMade, { force: true }).catch(() => undefined);
    return failedWith(`${linkPath} could not be linked: ${describeCaughtFailure(linkFailure)}`);
  }
}

/** A link this build makes: where it goes and the CLI it points at. */
interface OfferedCommandLineToolLink {
  linkPath: string;
  bundledCommandLineTool: string;
}

/** macOS's links of the bundled CLI: the home folder's with no prompt, `/usr/local/bin`'s behind the administrator prompt, at most one prompt at a time. */
export class CommandLineToolLinksOnThisMac implements TatolabCommandLineToolLinks {
  private usrLocalBinPromptShowing = false;

  /** The links of `machinePaths` to the CLI this bundle carries, `null` outside a bundle, with `/usr/local/bin`'s made behind `administratorPrompt`. */
  constructor(
    private readonly machinePaths: TatolabMachinePathsOnMacos,
    private readonly bundledCommandLineTool: string | null,
    private readonly administratorPrompt: AdministratorPrompt,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  async observeCommandLineToolLinks(): Promise<CommandLineToolLinksObservation> {
    return { homeFolderLinkedAt: await this.homeFolderLinkedAt(), usrLocalBinLink: await this.observeUsrLocalBinLink() };
  }

  async linkTheCommandLineToolInTheHomeFolder(): Promise<Result<void, CommandLineToolLinkRefusal>> {
    const offered = this.homeFolderLinkOffered();
    if (!offered.ok) return offered;
    const { linkPath, bundledCommandLineTool } = offered.value;
    const stillToBeMade = await linkStillToBeMade(linkPath, bundledCommandLineTool);
    if (!stillToBeMade.ok) return stillToBeMade;
    if (!stillToBeMade.value) return succeeded(undefined);
    const linked = await linkReplacedWhole(linkPath, bundledCommandLineTool);
    if (!linked.ok) return failedWith({ kind: "refused", refusal: linked.failure });
    this.tatolabAppLog.info("linked the tatolab command in the home folder", { link: linkPath, target: bundledCommandLineTool });
    return linked;
  }

  async linkTheCommandLineToolInUsrLocalBin(): Promise<Result<void, CommandLineToolLinkRefusal>> {
    const offered = this.usrLocalBinLinkOffered();
    if (!offered.ok) return offered;
    if (this.usrLocalBinPromptShowing) return failedWith({ kind: "refused", refusal: USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL });
    this.usrLocalBinPromptShowing = true;
    try {
      return await this.linkInUsrLocalBinBehindThePrompt(offered.value);
    } finally {
      this.usrLocalBinPromptShowing = false;
    }
  }

  /** Link `/usr/local/bin/tatolab` behind the administrator prompt, unless it is already linked or someone else's file holds the name. */
  private async linkInUsrLocalBinBehindThePrompt({ linkPath, bundledCommandLineTool }: OfferedCommandLineToolLink): Promise<Result<void, CommandLineToolLinkRefusal>> {
    const stillToBeMade = await linkStillToBeMade(linkPath, bundledCommandLineTool);
    if (!stillToBeMade.ok) return stillToBeMade;
    if (!stillToBeMade.value) return succeeded(undefined);
    this.tatolabAppLog.info("showing the administrator prompt to link the tatolab command in /usr/local/bin", { link: linkPath });
    const linked = await this.administratorPrompt.runBehindOneAdministratorPrompt(
      usrLocalBinLinkAdministratorShellScript(linkPath, bundledCommandLineTool),
      USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT,
    );
    if (linked.ok) return linked;
    if (linked.failure.kind === "cancelled") return failedWith({ kind: "refused", refusal: USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL });
    return failedWith({ kind: "refused", refusal: `tatolab couldn't be linked in /usr/local/bin: ${linked.failure.failureDescription}` });
  }

  private homeFolderLinkOffered(): Result<OfferedCommandLineToolLink, CommandLineToolLinkRefusal> {
    if (this.bundledCommandLineTool === null) return failedWith({ kind: "not_offered", reason: NO_BUNDLED_COMMAND_LINE_TOOL_LINK_REFUSAL });
    const linkPath = this.machinePaths.commandLineToolHomeFolderLink;
    if (linkPath === null) return failedWith({ kind: "not_offered", reason: NO_HOME_FOLDER_LINK_REFUSAL });
    return succeeded({ linkPath, bundledCommandLineTool: this.bundledCommandLineTool });
  }

  private usrLocalBinLinkOffered(): Result<OfferedCommandLineToolLink, CommandLineToolLinkRefusal> {
    const linkPath = this.machinePaths.commandLineToolUsrLocalBinLink;
    if (linkPath === null) return failedWith({ kind: "not_offered", reason: LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL });
    if (this.bundledCommandLineTool === null) return failedWith({ kind: "not_offered", reason: NO_BUNDLED_COMMAND_LINE_TOOL_LINK_REFUSAL });
    return succeeded({ linkPath, bundledCommandLineTool: this.bundledCommandLineTool });
  }

  private async homeFolderLinkedAt(): Promise<string | null> {
    const offered = this.homeFolderLinkOffered();
    if (!offered.ok) return null;
    const { linkPath, bundledCommandLineTool } = offered.value;
    return (await commandLineToolLinkPlace(linkPath, bundledCommandLineTool)) === "linked_to_this_app" ? linkPath : null;
  }

  private async observeUsrLocalBinLink(): Promise<CommandLineToolUsrLocalBinLink> {
    const offered = this.usrLocalBinLinkOffered();
    if (!offered.ok) return offered.failure.kind === "not_offered" ? { kind: "not_offered", reason: offered.failure.reason } : { kind: "not_linked" };
    const { linkPath, bundledCommandLineTool } = offered.value;
    return (await commandLineToolLinkPlace(linkPath, bundledCommandLineTool)) === "linked_to_this_app" ? { kind: "linked", path: linkPath } : { kind: "not_linked" };
  }
}
