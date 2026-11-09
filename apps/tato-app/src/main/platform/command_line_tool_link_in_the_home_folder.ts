// `~/.local/bin/tatolab`, linked to the CLI the app carries, with no administrator prompt. A link
// to some other `tatolab` command, such as the retired installer's, is replaced; a file that is not
// a link to one is someone else's and is left alone.

import { lstat, mkdir, readlink, rename, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import type { CommandLineToolLink } from "../../shared/tatolab_backend_contract.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "../result.js";

/** Where the link goes, relative to the home folder: a folder the XDG layout and most shells' PATH hold. */
export const COMMAND_LINE_TOOL_LINK_INSIDE_THE_HOME_FOLDER = ".local/bin/tatolab";

/** The file names a `tatolab` command goes by: the CLI's own, and the name a macOS bundle keeps it under. */
const TATOLAB_COMMAND_FILE_NAMES: readonly string[] = ["tatolab", "tatolab-cli"];

/** What sits where the link goes: the link to the carried CLI; nothing Tatolab must keep, so it may be linked; or something else, left alone. */
export type CommandLineToolLinkPlace = "linked_to_the_carried_command" | "free_to_link" | "taken_by_something_else";

/** What sits at `linkPath` for the CLI at `carriedCommandLineTool`: nothing, or a link to any `tatolab` command, is free to link. */
export async function commandLineToolLinkPlace(linkPath: string, carriedCommandLineTool: string): Promise<CommandLineToolLinkPlace> {
  const entry = await lstat(linkPath).catch(() => null);
  if (entry === null) return "free_to_link";
  if (!entry.isSymbolicLink()) return "taken_by_something_else";
  const linkTarget = await readlink(linkPath).catch(() => null);
  if (linkTarget === carriedCommandLineTool) return "linked_to_the_carried_command";
  return linkTarget !== null && TATOLAB_COMMAND_FILE_NAMES.includes(path.basename(linkTarget)) ? "free_to_link" : "taken_by_something_else";
}

/** Why `linkPath` was left alone. */
export function commandLineToolLinkTakenRefusal(linkPath: string): string {
  return `${linkPath} is not a link to Tatolab, so Tato Studio left it alone.`;
}

/** The `tatolab` link that puts the carried CLI on a terminal's PATH. */
export interface TatolabCommandLineToolLink {
  /** The link as it is now; changes nothing. */
  observeTheLink(): Promise<CommandLineToolLink>;
  /** Link `tatolab` to the carried CLI; refused in words when something else holds the name or the build offers none. */
  linkTheCommandLineTool(): Promise<Result<void, string>>;
}

/** The `tatolab` link in the home folder; `not_offered` with why where the build carries no CLI or has no home folder. */
export class CommandLineToolLinkInTheHomeFolder implements TatolabCommandLineToolLink {
  private constructor(
    private readonly linkPlaces: { linkPath: string; carriedCommandLineTool: string } | null,
    private readonly notOfferedBecause: string,
  ) {}

  /** The link at `linkPath` to `carriedCommandLineTool`. */
  static at(linkPath: string, carriedCommandLineTool: string): CommandLineToolLinkInTheHomeFolder {
    return new CommandLineToolLinkInTheHomeFolder({ linkPath, carriedCommandLineTool }, "");
  }

  /** No link, for `reason`. */
  static notOffered(reason: string): CommandLineToolLinkInTheHomeFolder {
    return new CommandLineToolLinkInTheHomeFolder(null, reason);
  }

  async observeTheLink(): Promise<CommandLineToolLink> {
    if (this.linkPlaces === null) return { kind: "not_offered", reason: this.notOfferedBecause };
    const { linkPath, carriedCommandLineTool } = this.linkPlaces;
    switch (await commandLineToolLinkPlace(linkPath, carriedCommandLineTool)) {
      case "linked_to_the_carried_command":
        return { kind: "linked", path: linkPath };
      case "free_to_link":
        return { kind: "not_linked", path: linkPath };
      case "taken_by_something_else":
        return { kind: "taken_by_something_else", path: linkPath };
    }
  }

  /** Makes `~/.local/bin` when it is missing and replaces the link in one rename. */
  async linkTheCommandLineTool(): Promise<Result<void, string>> {
    if (this.linkPlaces === null) return failedWith(this.notOfferedBecause);
    const { linkPath, carriedCommandLineTool } = this.linkPlaces;
    switch (await commandLineToolLinkPlace(linkPath, carriedCommandLineTool)) {
      case "linked_to_the_carried_command":
        return succeeded(undefined);
      case "taken_by_something_else":
        return failedWith(commandLineToolLinkTakenRefusal(linkPath));
      case "free_to_link":
        break;
    }
    const linkBeingMade = `${linkPath}.tato-studio-link`;
    try {
      await mkdir(path.dirname(linkPath), { recursive: true });
      await unlink(linkBeingMade).catch(() => undefined);
      await symlink(carriedCommandLineTool, linkBeingMade);
      await rename(linkBeingMade, linkPath);
      return succeeded(undefined);
    } catch (linkFailure) {
      await unlink(linkBeingMade).catch(() => undefined);
      return failedWith(`tatolab couldn't be linked at ${linkPath}: ${describeCaughtFailure(linkFailure)}`);
    }
  }
}
