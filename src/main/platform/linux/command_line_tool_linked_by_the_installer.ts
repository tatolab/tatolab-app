// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Linux's `tatolab` command, which the installer links into `~/.local/bin` with the runtime and
// its service. The app only reads where it is linked, and links nothing itself.

import { somethingIsAt } from "../../file_system_entries_on_this_machine.js";
import { failedWith, type Result } from "../../result.js";
import type { CommandLineToolLinkRefusal, CommandLineToolLinksObservation, TatolabCommandLineToolLinks } from "../tatolab_command_line_tool_links.js";

/** Why Linux links neither in the home folder nor in `/usr/local/bin`. */
export const LINUX_INSTALLER_LINKS_THE_COMMAND = "On Linux the installer links tatolab into ~/.local/bin with the runtime.";

/** The command as the installer linked it. */
export class CommandLineToolLinkedByTheInstaller implements TatolabCommandLineToolLinks {
  /** The command the installer links at `commandLineToolLink`, `null` where this build reads no link. */
  constructor(private readonly commandLineToolLink: string | null) {}

  async observeCommandLineToolLinks(): Promise<CommandLineToolLinksObservation> {
    return {
      homeFolderLinkedAt:
        this.commandLineToolLink !== null && (await somethingIsAt(this.commandLineToolLink)) ? this.commandLineToolLink : null,
      usrLocalBinLink: { kind: "not_offered", reason: LINUX_INSTALLER_LINKS_THE_COMMAND },
    };
  }

  async linkTheCommandLineToolInTheHomeFolder(): Promise<Result<void, CommandLineToolLinkRefusal>> {
    return failedWith({ kind: "not_offered", reason: LINUX_INSTALLER_LINKS_THE_COMMAND });
  }

  async linkTheCommandLineToolInUsrLocalBin(): Promise<Result<void, CommandLineToolLinkRefusal>> {
    return failedWith({ kind: "not_offered", reason: LINUX_INSTALLER_LINKS_THE_COMMAND });
  }
}
