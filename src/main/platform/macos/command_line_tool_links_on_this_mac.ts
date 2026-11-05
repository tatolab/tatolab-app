// The `tatolab` command's links on macOS: `~/.local/bin/tatolab`, which the installer makes with
// the runtime and the app only reads, and `/usr/local/bin/tatolab`, which the app makes behind the
// administrator prompt only when the person asks, to the CLI of the build the installer runs. It is
// replaced only when it is missing, a dangling link, or a link into a Tatolab bundle, never when it
// is someone else's file.

import { lstat, readlink } from "node:fs/promises";
import path from "node:path";
import type { CommandLineToolUsrLocalBinLink } from "../../../shared/tatolab_backend_contract.js";
import { somethingIsAt } from "../../file_system_entries_on_this_machine.js";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { TatolabAppLog } from "../../tatolab_app_log.js";
import type { CommandLineToolLinkRefusal, CommandLineToolLinksObservation, TatolabCommandLineToolLinks } from "../tatolab_command_line_tool_links.js";
import { shellWordForPath, type AdministratorPrompt } from "./administrator_prompt.js";
import { isABundledCommandLineToolPath, type TatolabMachinePathsOnMacos } from "./tatolab_machine_paths.js";

/** The words the `/usr/local/bin` link's administrator prompt shows under "osascript wants to make changes." */
export const USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT = "Tato Studio wants to link the tatolab command in /usr/local/bin, so it works in every terminal.";

/** Why a local-proof build offers no `/usr/local/bin` link. */
export const LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL = "A local-proof build never links tatolab in /usr/local/bin.";


/** Why a second `/usr/local/bin` link waits: one administrator prompt at a time. */
export const USR_LOCAL_BIN_LINK_PROMPT_ALREADY_SHOWING_REFUSAL = "The password prompt is already open.";

/** Why a cancelled `/usr/local/bin` prompt changed nothing. */
export const USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL = "The password prompt was cancelled, so nothing changed.";

/** What sits where a link goes: the link to the installed CLI; nothing Tatolab must keep, so it may be linked; or something else, left alone. */
export type CommandLineToolLinkPlace = "linked_to_the_installed_command" | "free_to_link" | "taken_by_something_else";

/** What sits at `linkPath` for the CLI at `installedCommandLineTool`: nothing, a dangling link or a link into a Tatolab bundle are free to link. */
export async function commandLineToolLinkPlace(linkPath: string, installedCommandLineTool: string): Promise<CommandLineToolLinkPlace> {
  const entry = await lstat(linkPath).catch(() => null);
  if (entry === null) return "free_to_link";
  if (!entry.isSymbolicLink()) return "taken_by_something_else";
  const linkTarget = await readlink(linkPath).catch(() => null);
  if (linkTarget === installedCommandLineTool) return "linked_to_the_installed_command";
  if (linkTarget !== null && isABundledCommandLineToolPath(linkTarget)) return "free_to_link";
  return (await somethingIsAt(linkPath)) ? "taken_by_something_else" : "free_to_link";
}

/** Why `linkPath` was left alone. */
export function commandLineToolLinkTakenRefusal(linkPath: string): string {
  return `${linkPath} is not a link to Tatolab, so Tato Studio left it alone.`;
}

/** Whether a link at `linkPath` is still to be made: already made, or free to make; refused when something else holds the name. */
async function linkStillToBeMade(linkPath: string, installedCommandLineTool: string): Promise<Result<boolean, CommandLineToolLinkRefusal>> {
  switch (await commandLineToolLinkPlace(linkPath, installedCommandLineTool)) {
    case "linked_to_the_installed_command":
      return succeeded(false);
    case "free_to_link":
      return succeeded(true);
    case "taken_by_something_else":
      return failedWith({ kind: "refused", refusal: commandLineToolLinkTakenRefusal(linkPath) });
  }
}

/** The one root shell script that links `/usr/local/bin/tatolab` to `installedCommandLineTool`, making the folder when it is missing. */
export function usrLocalBinLinkAdministratorShellScript(usrLocalBinLink: string, installedCommandLineTool: string): string {
  return `mkdir -p ${shellWordForPath(path.dirname(usrLocalBinLink))} && ln -sfn ${shellWordForPath(installedCommandLineTool)} ${shellWordForPath(usrLocalBinLink)}`;
}

/** Why this build makes no such link. */
type CommandLineToolLinkNotOffered = Extract<CommandLineToolLinkRefusal, { kind: "not_offered" }>;

/** macOS's `tatolab` links: the installer's in the home folder, read only, and `/usr/local/bin`'s behind the administrator prompt, at most one prompt at a time. */
export class CommandLineToolLinksOnThisMac implements TatolabCommandLineToolLinks {
  private usrLocalBinPromptShowing = false;

  /** The links of `machinePaths` to `installedCommandLineTool`, the CLI of the build the installer runs, with `/usr/local/bin`'s made behind `administratorPrompt`. */
  constructor(
    private readonly machinePaths: TatolabMachinePathsOnMacos,
    private readonly installedCommandLineTool: string,
    private readonly administratorPrompt: AdministratorPrompt,
    private readonly tatolabAppLog: TatolabAppLog,
  ) {}

  async observeCommandLineToolLinks(): Promise<CommandLineToolLinksObservation> {
    const homeFolderLink = this.machinePaths.commandLineToolHomeFolderLink;
    return {
      homeFolderLinkedAt: homeFolderLink !== null && (await somethingIsAt(homeFolderLink)) ? homeFolderLink : null,
      usrLocalBinLink: await this.observeUsrLocalBinLink(),
    };
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

  /** Link `/usr/local/bin/tatolab` at `linkPath` behind the administrator prompt, unless it is already linked or someone else's file holds the name. */
  private async linkInUsrLocalBinBehindThePrompt(linkPath: string): Promise<Result<void, CommandLineToolLinkRefusal>> {
    const stillToBeMade = await linkStillToBeMade(linkPath, this.installedCommandLineTool);
    if (!stillToBeMade.ok) return stillToBeMade;
    if (!stillToBeMade.value) return succeeded(undefined);
    this.tatolabAppLog.info("showing the administrator prompt to link the tatolab command in /usr/local/bin", { link: linkPath });
    const linked = await this.administratorPrompt.runBehindOneAdministratorPrompt(
      usrLocalBinLinkAdministratorShellScript(linkPath, this.installedCommandLineTool),
      USR_LOCAL_BIN_LINK_ADMINISTRATOR_PROMPT_TEXT,
    );
    if (linked.ok) return linked;
    if (linked.failure.kind === "cancelled") return failedWith({ kind: "refused", refusal: USR_LOCAL_BIN_LINK_PROMPT_CANCELLED_REFUSAL });
    return failedWith({ kind: "refused", refusal: `tatolab couldn't be linked in /usr/local/bin: ${linked.failure.failureDescription}` });
  }

  private usrLocalBinLinkOffered(): Result<string, CommandLineToolLinkNotOffered> {
    const linkPath = this.machinePaths.commandLineToolUsrLocalBinLink;
    return linkPath === null ? failedWith({ kind: "not_offered", reason: LOCAL_PROOF_USR_LOCAL_BIN_LINK_REFUSAL }) : succeeded(linkPath);
  }

  private async observeUsrLocalBinLink(): Promise<CommandLineToolUsrLocalBinLink> {
    const offered = this.usrLocalBinLinkOffered();
    if (!offered.ok) return offered.failure;
    const linkPath = offered.value;
    return (await commandLineToolLinkPlace(linkPath, this.installedCommandLineTool)) === "linked_to_the_installed_command"
      ? { kind: "linked", path: linkPath }
      : { kind: "not_linked" };
  }
}
