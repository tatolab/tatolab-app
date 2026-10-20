// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Linux's machine setup, which the installer did: it installed the runtime, its systemd user
// service and the CLI's link, and the machine runtime lock is an abstract socket the runtime
// binds itself. Nothing is ever missing and nothing prompts; the app only reads where the CLI is
// linked.

import { stat } from "node:fs/promises";
import type {
  MachineSetupAdministratorPromptOutcome,
  MachineSetupObservation,
  MachineSetupTrigger,
  TatolabMachineSetup,
} from "../tatolab_machine_setup.js";

/** Why Linux refuses "Set Up Tatolab…". */
export const LINUX_NEEDS_NO_MACHINE_SETUP = "Linux needs no machine setup: the installer set up the runtime and its service";

/** The machine as the installer set it up. */
export class MachineSetUpByTheInstaller implements TatolabMachineSetup {
  /** The machine whose CLI the installer links at `commandLineToolLink`. */
  constructor(private readonly commandLineToolLink: string | null) {}

  async observeMachineSetup(): Promise<MachineSetupObservation> {
    return {
      machineSetupState: "complete",
      commandLineToolLinkedAt:
        this.commandLineToolLink !== null && (await pathResolvesToSomething(this.commandLineToolLink)) ? this.commandLineToolLink : null,
    };
  }

  /** The installer left nothing for the app to set up, so no trigger shows a prompt. */
  async setUpTheMachine(_trigger: MachineSetupTrigger): Promise<MachineSetupAdministratorPromptOutcome> {
    return "no_administrator_prompt_shown";
  }

  setUpTatolabRefusal(): string | null {
    return LINUX_NEEDS_NO_MACHINE_SETUP;
  }
}

/** Whether `candidatePath` names something once every link in it is followed, as Rust's `Path::exists` answers. */
async function pathResolvesToSomething(candidatePath: string): Promise<boolean> {
  try {
    await stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}
