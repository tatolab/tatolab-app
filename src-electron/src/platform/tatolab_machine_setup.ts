// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The machine-wide setup a platform's runtime needs before it can start: on macOS the machine
// runtime lock and the CLI's PATH link, created behind one administrator prompt. Linux's
// installer sets its machine up, so there it is always complete.

import type { MachineSetupState } from "../../../src/backend/tatolab_backend_contract.js";

/** Machine setup as one status round observes it. */
export interface MachineSetupObservation {
  machineSetupState: MachineSetupState;
  /** The CLI's PATH link; `null` when there is none. */
  commandLineToolLinkedAt: string | null;
}

/**
 * What asks for machine setup: `reconciling_the_switch` sets up only what needs no prompt and never shows
 * the administrator prompt; `app_opened` shows it at most once per launch; `user_asked` ("Set Up
 * Tatolab…") shows it again whenever none is showing.
 */
export type MachineSetupTrigger = "reconciling_the_switch" | "app_opened" | "user_asked";

/** Whether setting up the machine showed the administrator prompt. */
export type MachineSetupAdministratorPromptOutcome = "administrator_prompt_shown" | "no_administrator_prompt_shown";

/** The machine setup a platform's runtime needs before it can start. */
export interface TatolabMachineSetup {
  /** Machine setup as observed now; opens nothing. */
  observeMachineSetup(): Promise<MachineSetupObservation>;

  /** Set up whatever is missing as `trigger` asks, settling once any administrator prompt closes. */
  setUpTheMachine(trigger: MachineSetupTrigger): Promise<MachineSetupAdministratorPromptOutcome>;

  /** Why "Set Up Tatolab…" is refused on this platform, answered at once with no I/O; `null` where it runs. */
  setUpTatolabRefusal(): string | null;
}
