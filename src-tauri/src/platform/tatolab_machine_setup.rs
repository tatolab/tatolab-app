// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The machine-wide setup a platform's runtime needs before it can start: on macOS the machine
//! runtime lock and the CLI's PATH link, created behind one administrator prompt. Linux's
//! installer sets its machine up, so there it is always complete.

use std::path::PathBuf;

use crate::tatolab_status::MachineSetupState;

/// Machine setup as one status round observes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MachineSetupObservation {
    pub machine_setup_state: MachineSetupState,
    /// The CLI's PATH link; `None` when there is none.
    pub command_line_tool_linked_at: Option<PathBuf>,
}

/// What asks for machine setup.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MachineSetupTrigger {
    /// The switch is about to be reconciled, which sets up only what needs no prompt and never
    /// shows the administrator prompt.
    ReconcilingTheSwitch,
    /// Opening the app, which shows the administrator prompt at most once per launch.
    AppOpened,
    /// "Set Up Tatolab…", which shows it again whenever none is showing.
    UserAsked,
}

/// Whether setting up the machine showed the administrator prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MachineSetupAdministratorPromptOutcome {
    AdministratorPromptShown,
    NoAdministratorPromptShown,
}

/// The machine setup a platform's runtime needs before it can start.
pub trait TatolabMachineSetup: Send + Sync {
    /// Machine setup as observed now; opens nothing.
    fn observe_machine_setup(&self) -> MachineSetupObservation;

    /// Set up whatever is missing as `trigger` asks, blocking while an administrator prompt
    /// shows.
    fn set_up_the_machine(
        &self,
        trigger: MachineSetupTrigger,
    ) -> MachineSetupAdministratorPromptOutcome;

    /// Why "Set Up Tatolab…" is refused on this platform, answered at once with no lock or I/O;
    /// `None` where it runs.
    fn set_up_tatolab_refusal(&self) -> Option<&'static str>;
}
