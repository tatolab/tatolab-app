// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Linux's machine setup, which the installer did: it installed the runtime, its systemd user
//! service and the CLI's link, and the machine runtime lock is an abstract socket the runtime
//! binds itself. Nothing is ever missing and nothing prompts; the app only reads where the CLI is
//! linked.

use std::path::PathBuf;

use crate::platform::{MachineSetupObservation, MachineSetupTrigger, TatolabMachineSetup};
use crate::tatolab_status::MachineSetupState;

/// Why Linux refuses "Set Up Tatolab…".
pub const LINUX_NEEDS_NO_MACHINE_SETUP: &str =
    "Linux needs no machine setup: the installer set up the runtime and its service";

/// The machine as the installer set it up.
#[derive(Debug, Clone)]
pub struct MachineSetUpByTheInstaller {
    command_line_tool_link: Option<PathBuf>,
}

impl MachineSetUpByTheInstaller {
    /// The machine whose CLI the installer links at `command_line_tool_link`.
    pub fn new(command_line_tool_link: Option<PathBuf>) -> Self {
        Self {
            command_line_tool_link,
        }
    }
}

impl TatolabMachineSetup for MachineSetUpByTheInstaller {
    fn observe_machine_setup(&self) -> MachineSetupObservation {
        MachineSetupObservation {
            machine_setup_state: MachineSetupState::Complete,
            command_line_tool_linked_at: self
                .command_line_tool_link
                .clone()
                .filter(|command_line_tool_link| command_line_tool_link.exists()),
        }
    }

    /// The installer left nothing for the app to set up, so no trigger shows a prompt.
    fn set_up_the_machine(&self, _trigger: MachineSetupTrigger) -> bool {
        false
    }

    fn set_up_tatolab_refusal(&self) -> Option<&'static str> {
        Some(LINUX_NEEDS_NO_MACHINE_SETUP)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_machine_is_set_up_and_the_cli_reads_linked_only_while_its_link_resolves() {
        let home = tempfile::tempdir().unwrap();
        let link_path = home.path().join(".local/bin/tatolab");
        let installed_command_line_tool =
            home.path().join(".local/share/tatolab/0.46.0/bin/tatolab");
        let machine_setup = MachineSetUpByTheInstaller::new(Some(link_path.clone()));
        let observed_link = || {
            let observation = machine_setup.observe_machine_setup();
            assert_eq!(observation.machine_setup_state, MachineSetupState::Complete);
            observation.command_line_tool_linked_at
        };

        assert_eq!(observed_link(), None);

        std::fs::create_dir_all(link_path.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&installed_command_line_tool, &link_path).unwrap();
        assert_eq!(observed_link(), None, "a dangling link runs nothing");

        std::fs::create_dir_all(installed_command_line_tool.parent().unwrap()).unwrap();
        std::fs::write(&installed_command_line_tool, b"").unwrap();
        assert_eq!(observed_link(), Some(link_path));
    }

    #[test]
    fn nothing_is_ever_set_up_and_set_up_tatolab_is_refused() {
        let machine_setup = MachineSetUpByTheInstaller::new(None);

        for trigger in [
            MachineSetupTrigger::ReconcilingTheSwitch,
            MachineSetupTrigger::AppOpened,
            MachineSetupTrigger::UserAsked,
        ] {
            assert!(!machine_setup.set_up_the_machine(trigger), "{trigger:?}");
        }
        assert_eq!(
            machine_setup.set_up_tatolab_refusal(),
            Some(LINUX_NEEDS_NO_MACHINE_SETUP)
        );
        assert_eq!(
            machine_setup.observe_machine_setup(),
            MachineSetupObservation {
                machine_setup_state: MachineSetupState::Complete,
                command_line_tool_linked_at: None,
            }
        );
    }
}
