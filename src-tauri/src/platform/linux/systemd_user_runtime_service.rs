// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The runtime's agent on Linux: the systemd user unit `tatolabd.service` the installer
//! (`curl -fsSL https://get.tatolab.com/install.sh | sh`) writes and enables, driven over
//! `systemctl --user`. "Run Tatolab" is the unit's enablement, `enable --now` and
//! `disable --now`, and starting a runtime the poller found down is `start`, which leaves an
//! active unit alone.

use std::process::Command;

use crate::condition_onset_latch::ConditionOnsetLatch;
use crate::platform::{RuntimeAgentRegistration, RuntimeAgentStartFailure};
use crate::tatolab_status::RuntimeAgentRegistrationStatus;

/// The installer's systemd user unit that runs `tatolabd`.
pub const RUNTIME_SYSTEMD_USER_UNIT_NAME: &str = "tatolabd.service";

/// Why Linux refuses to open Login Items.
pub const LINUX_HAS_NO_LOGIN_ITEMS: &str = "Linux has no Login Items: \"Run Tatolab\" enables and \
     disables the systemd user service tatolabd.service";

/// What one `systemctl --user` run answered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemctlUserCommandOutput {
    /// Its exit code; `None` when a signal ended it.
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// Runs `systemctl --user` with the arguments given; a test's fake answers as systemctl does.
pub trait SystemctlUserCommandRunner: Send + Sync {
    /// What `systemctl --user <arguments>` answered; `Err` when systemctl could not be run at all.
    fn run_systemctl_user(&self, arguments: &[&str]) -> Result<SystemctlUserCommandOutput, String>;
}

/// The `systemctl` on the PATH.
#[derive(Debug, Clone, Copy)]
pub struct SystemctlOnThePath;

impl SystemctlUserCommandRunner for SystemctlOnThePath {
    fn run_systemctl_user(&self, arguments: &[&str]) -> Result<SystemctlUserCommandOutput, String> {
        let output = Command::new("systemctl")
            .arg("--user")
            .args(arguments)
            .output()
            .map_err(|failure| format!("systemctl could not be run: {failure}"))?;
        Ok(SystemctlUserCommandOutput {
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

/// The runtime's systemd user unit, driven through `systemctl --user`.
pub struct SystemdUserRuntimeService {
    systemctl: Box<dyn SystemctlUserCommandRunner>,
    /// When `is-enabled` starts reading no unit to drive, so why is logged once per drop.
    unit_not_found_onset: ConditionOnsetLatch,
}

impl SystemdUserRuntimeService {
    /// The unit, driven through `systemctl`.
    pub fn new(systemctl: Box<dyn SystemctlUserCommandRunner>) -> Self {
        Self {
            systemctl,
            unit_not_found_onset: ConditionOnsetLatch::default(),
        }
    }

    /// Run `systemctl --user <arguments>`, refused in systemctl's own words unless it exits 0.
    fn run_systemctl_user_expecting_success(&self, arguments: &[&str]) -> Result<(), String> {
        let output = self.systemctl.run_systemctl_user(arguments)?;
        if output.exit_code == Some(0) {
            return Ok(());
        }
        let how_it_ended = match output.exit_code {
            Some(exit_code) => format!("exit {exit_code}"),
            None => "ended by a signal".to_string(),
        };
        Err(format!(
            "systemctl --user {} failed ({how_it_ended}): {}",
            arguments.join(" "),
            output.stderr.trim()
        ))
    }
}

impl RuntimeAgentRegistration for SystemdUserRuntimeService {
    fn registration_status(&self) -> RuntimeAgentRegistrationStatus {
        let is_enabled_answer_or_run_failure = self
            .systemctl
            .run_systemctl_user(&["is-enabled", RUNTIME_SYSTEMD_USER_UNIT_NAME]);
        let registration_status = match &is_enabled_answer_or_run_failure {
            Ok(is_enabled_answer) => {
                runtime_agent_registration_status_from_systemctl_is_enabled(is_enabled_answer)
            }
            Err(_systemctl_could_not_be_run) => RuntimeAgentRegistrationStatus::NotFound,
        };
        if self.unit_not_found_onset.condition_just_started_holding(
            registration_status == RuntimeAgentRegistrationStatus::NotFound,
        ) {
            match &is_enabled_answer_or_run_failure {
                Ok(is_enabled_answer) => tracing::warn!(
                    exit_code = ?is_enabled_answer.exit_code,
                    stdout = %is_enabled_answer.stdout.trim(),
                    stderr = %is_enabled_answer.stderr.trim(),
                    "systemctl --user is-enabled {RUNTIME_SYSTEMD_USER_UNIT_NAME} names no unit to drive"
                ),
                Err(run_failure) => tracing::warn!(
                    %run_failure,
                    "{RUNTIME_SYSTEMD_USER_UNIT_NAME} reads as no unit to drive"
                ),
            }
        }
        registration_status
    }

    fn register_runtime_agent(&self) -> Result<(), String> {
        self.run_systemctl_user_expecting_success(&[
            "enable",
            "--now",
            RUNTIME_SYSTEMD_USER_UNIT_NAME,
        ])
    }

    fn start_runtime_agent_if_not_running(&self) -> Result<(), RuntimeAgentStartFailure> {
        self.run_systemctl_user_expecting_success(&["start", RUNTIME_SYSTEMD_USER_UNIT_NAME])
            .map_err(RuntimeAgentStartFailure::Refused)
    }

    fn unregister_runtime_agent(&self) -> Result<(), String> {
        self.run_systemctl_user_expecting_success(&[
            "disable",
            "--now",
            RUNTIME_SYSTEMD_USER_UNIT_NAME,
        ])
    }

    fn open_login_items_settings(&self) -> Result<(), String> {
        Err(LINUX_HAS_NO_LOGIN_ITEMS.to_string())
    }
}

/// The registration `systemctl --user is-enabled` answered: `enabled` (exit 0) is enabled; any
/// other state it prints, such as `disabled`, `masked` or `linked` (exit 1), is a unit installed
/// but not enabled; `not-found` (exit 4), or no state at all, is no unit to drive. Older systemd
/// names a missing unit only on stderr, and with no user manager to ask the bus refuses.
pub fn runtime_agent_registration_status_from_systemctl_is_enabled(
    is_enabled_answer: &SystemctlUserCommandOutput,
) -> RuntimeAgentRegistrationStatus {
    match is_enabled_answer.stdout.lines().next().map(str::trim) {
        Some("enabled" | "enabled-runtime") => RuntimeAgentRegistrationStatus::Enabled,
        None | Some("" | "not-found") => RuntimeAgentRegistrationStatus::NotFound,
        Some(_installed_but_not_enabled) => RuntimeAgentRegistrationStatus::NotRegistered,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    use super::*;
    use crate::run_tatolab_preference::RunTatolabPreferenceFile;
    use crate::run_tatolab_switch::{RunTatolabReconciliation, RunTatolabSwitch};

    fn systemctl_answered(
        exit_code: i32,
        stdout: &str,
        stderr: &str,
    ) -> SystemctlUserCommandOutput {
        SystemctlUserCommandOutput {
            exit_code: Some(exit_code),
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
        }
    }

    const NO_USER_MANAGER_ON_THE_BUS: &str = "Failed to connect to bus: No medium found\n";

    const NO_SESSION_BUS_ADDRESS: &str = "Failed to connect to bus: $DBUS_SESSION_BUS_ADDRESS and \
         $XDG_RUNTIME_DIR not defined (consider using --machine=<user>@.host --user to connect to \
         bus of other user)\n";

    #[test]
    fn is_enabled_reads_enabled_installed_or_no_unit_as_systemctl_answers_it() {
        for (is_enabled_answer, expected) in [
            (
                systemctl_answered(0, "enabled\n", ""),
                RuntimeAgentRegistrationStatus::Enabled,
            ),
            (
                systemctl_answered(0, "enabled-runtime\n", ""),
                RuntimeAgentRegistrationStatus::Enabled,
            ),
            (
                systemctl_answered(1, "disabled\n", ""),
                RuntimeAgentRegistrationStatus::NotRegistered,
            ),
            (
                systemctl_answered(1, "masked\n", ""),
                RuntimeAgentRegistrationStatus::NotRegistered,
            ),
            (
                systemctl_answered(1, "linked\n", ""),
                RuntimeAgentRegistrationStatus::NotRegistered,
            ),
            (
                systemctl_answered(4, "not-found\n", ""),
                RuntimeAgentRegistrationStatus::NotFound,
            ),
            (
                systemctl_answered(
                    1,
                    "",
                    "Failed to get unit file state for tatolabd.service: No such file or directory\n",
                ),
                RuntimeAgentRegistrationStatus::NotFound,
            ),
            (
                systemctl_answered(1, "", NO_USER_MANAGER_ON_THE_BUS),
                RuntimeAgentRegistrationStatus::NotFound,
            ),
            (
                systemctl_answered(1, "", NO_SESSION_BUS_ADDRESS),
                RuntimeAgentRegistrationStatus::NotFound,
            ),
        ] {
            assert_eq!(
                runtime_agent_registration_status_from_systemctl_is_enabled(&is_enabled_answer),
                expected,
                "{is_enabled_answer:?}"
            );
        }
    }

    /// A user systemd that knows one unit, answering as `systemctl --user` does, recording every
    /// command it is given.
    #[derive(Clone)]
    struct FakeUserSystemd {
        unit_file_installed: bool,
        user_manager_answers: bool,
        unit_enabled: Arc<Mutex<bool>>,
        unit_active: Arc<Mutex<bool>>,
        commands: Arc<Mutex<Vec<String>>>,
    }

    impl FakeUserSystemd {
        fn with_the_unit(unit_enabled: bool, unit_active: bool) -> Self {
            Self {
                unit_file_installed: true,
                user_manager_answers: true,
                unit_enabled: Arc::new(Mutex::new(unit_enabled)),
                unit_active: Arc::new(Mutex::new(unit_active)),
                commands: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn before_the_installer_ran() -> Self {
            Self {
                unit_file_installed: false,
                ..Self::with_the_unit(false, false)
            }
        }

        fn with_no_user_manager() -> Self {
            Self {
                user_manager_answers: false,
                ..Self::with_the_unit(false, false)
            }
        }

        fn commands(&self) -> Vec<String> {
            self.commands.lock().unwrap().clone()
        }

        fn unit_enabled(&self) -> bool {
            *self.unit_enabled.lock().unwrap()
        }

        fn unit_active(&self) -> bool {
            *self.unit_active.lock().unwrap()
        }
    }

    impl SystemctlUserCommandRunner for FakeUserSystemd {
        fn run_systemctl_user(
            &self,
            arguments: &[&str],
        ) -> Result<SystemctlUserCommandOutput, String> {
            self.commands.lock().unwrap().push(arguments.join(" "));
            if !self.user_manager_answers {
                return Ok(systemctl_answered(1, "", NO_USER_MANAGER_ON_THE_BUS));
            }
            let mut unit_enabled = self.unit_enabled.lock().unwrap();
            let mut unit_active = self.unit_active.lock().unwrap();
            Ok(match (arguments, self.unit_file_installed) {
                (["is-enabled", RUNTIME_SYSTEMD_USER_UNIT_NAME], false) => {
                    systemctl_answered(4, "not-found\n", "")
                }
                (["is-enabled", RUNTIME_SYSTEMD_USER_UNIT_NAME], true) if *unit_enabled => {
                    systemctl_answered(0, "enabled\n", "")
                }
                (["is-enabled", RUNTIME_SYSTEMD_USER_UNIT_NAME], true) => {
                    systemctl_answered(1, "disabled\n", "")
                }
                (["enable", "--now", RUNTIME_SYSTEMD_USER_UNIT_NAME], false) => systemctl_answered(
                    1,
                    "",
                    "Failed to enable unit: Unit file tatolabd.service does not exist.\n",
                ),
                (["enable", "--now", RUNTIME_SYSTEMD_USER_UNIT_NAME], true) => {
                    *unit_enabled = true;
                    *unit_active = true;
                    systemctl_answered(
                        0,
                        "",
                        "Created symlink /home/u/.config/systemd/user/default.target.wants/tatolabd.service → /home/u/.config/systemd/user/tatolabd.service.\n",
                    )
                }
                (["disable", "--now", RUNTIME_SYSTEMD_USER_UNIT_NAME], _) => {
                    *unit_enabled = false;
                    *unit_active = false;
                    systemctl_answered(0, "", "")
                }
                (["start", RUNTIME_SYSTEMD_USER_UNIT_NAME], false) => systemctl_answered(
                    5,
                    "",
                    "Failed to start tatolabd.service: Unit tatolabd.service not found.\n",
                ),
                (["start", RUNTIME_SYSTEMD_USER_UNIT_NAME], true) => {
                    *unit_active = true;
                    systemctl_answered(0, "", "")
                }
                _ => panic!(
                    "systemctl --user {} is not a command the app runs",
                    arguments.join(" ")
                ),
            })
        }
    }

    fn switch_over(
        user_systemd: &FakeUserSystemd,
        config_directory: &tempfile::TempDir,
    ) -> RunTatolabSwitch {
        RunTatolabSwitch::load(
            Box::new(SystemdUserRuntimeService::new(Box::new(
                user_systemd.clone(),
            ))),
            RunTatolabPreferenceFile::in_app_config_directory(config_directory.path()),
            Instant::now(),
        )
    }

    #[test]
    fn opening_the_app_with_the_switch_on_enables_a_disabled_unit_now() {
        let user_systemd = FakeUserSystemd::with_the_unit(false, false);
        let config_directory = tempfile::tempdir().unwrap();
        let mut switch = switch_over(&user_systemd, &config_directory);

        let reconciliation =
            switch.reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now());

        assert_eq!(reconciliation, RunTatolabReconciliation::Registered);
        assert_eq!(
            user_systemd.commands(),
            vec![
                "is-enabled tatolabd.service",
                "enable --now tatolabd.service",
                "is-enabled tatolabd.service",
                "start tatolabd.service",
            ]
        );
        assert!(user_systemd.unit_enabled() && user_systemd.unit_active());
    }

    #[test]
    fn turning_the_switch_off_disables_the_unit_now_and_on_again_enables_it() {
        let user_systemd = FakeUserSystemd::with_the_unit(true, true);
        let config_directory = tempfile::tempdir().unwrap();
        let mut switch = switch_over(&user_systemd, &config_directory);

        assert_eq!(
            switch.set_run_tatolab(false, true, Instant::now()),
            RunTatolabReconciliation::Unregistered
        );
        assert!(!user_systemd.unit_enabled() && !user_systemd.unit_active());
        assert_eq!(
            switch.set_run_tatolab(true, true, Instant::now()),
            RunTatolabReconciliation::Registered
        );
        assert!(user_systemd.unit_enabled() && user_systemd.unit_active());
        assert_eq!(
            user_systemd.commands(),
            vec![
                "is-enabled tatolabd.service",
                "disable --now tatolabd.service",
                "is-enabled tatolabd.service",
                "enable --now tatolabd.service",
                "is-enabled tatolabd.service",
                "start tatolabd.service",
            ]
        );
    }

    #[test]
    fn the_poller_starts_an_enabled_unit_whose_runtime_is_down() {
        let user_systemd = FakeUserSystemd::with_the_unit(true, false);
        let config_directory = tempfile::tempdir().unwrap();
        let mut switch = switch_over(&user_systemd, &config_directory);

        switch.start_the_runtime_if_the_poller_found_it_down(
            switch.runtime_agent_registration_status(),
            crate::tatolab_status::RuntimeHealthObservation::Failing,
            Instant::now(),
        );

        assert_eq!(
            user_systemd.commands(),
            vec!["is-enabled tatolabd.service", "start tatolabd.service"]
        );
        assert!(user_systemd.unit_active());
    }

    #[test]
    fn before_the_installer_ran_there_is_no_unit_and_enabling_it_fails_in_systemctls_words() {
        let user_systemd = FakeUserSystemd::before_the_installer_ran();
        let config_directory = tempfile::tempdir().unwrap();
        let mut switch = switch_over(&user_systemd, &config_directory);

        assert_eq!(
            switch.runtime_agent_registration_status(),
            RuntimeAgentRegistrationStatus::NotFound
        );
        assert_eq!(
            switch.reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
            RunTatolabReconciliation::RegistrationFailed {
                failure_description: "systemctl --user enable --now tatolabd.service failed \
                     (exit 1): Failed to enable unit: Unit file tatolabd.service does not exist."
                    .to_string()
            }
        );
    }

    #[test]
    fn with_no_user_manager_there_is_no_unit_to_drive() {
        let user_systemd = FakeUserSystemd::with_no_user_manager();
        let runtime_service = SystemdUserRuntimeService::new(Box::new(user_systemd.clone()));

        assert_eq!(
            runtime_service.registration_status(),
            RuntimeAgentRegistrationStatus::NotFound
        );
        assert_eq!(
            runtime_service.start_runtime_agent_if_not_running(),
            Err(RuntimeAgentStartFailure::Refused(
                "systemctl --user start tatolabd.service failed (exit 1): Failed to connect to \
                 bus: No medium found"
                    .to_string()
            ))
        );
    }

    #[test]
    fn systemctl_that_cannot_be_run_reads_as_no_unit_and_refuses_every_change() {
        struct SystemctlMissing;
        impl SystemctlUserCommandRunner for SystemctlMissing {
            fn run_systemctl_user(
                &self,
                _arguments: &[&str],
            ) -> Result<SystemctlUserCommandOutput, String> {
                Err("systemctl could not be run: No such file or directory (os error 2)".into())
            }
        }
        let runtime_service = SystemdUserRuntimeService::new(Box::new(SystemctlMissing));

        assert_eq!(
            runtime_service.registration_status(),
            RuntimeAgentRegistrationStatus::NotFound
        );
        assert_eq!(
            runtime_service.register_runtime_agent(),
            Err("systemctl could not be run: No such file or directory (os error 2)".to_string())
        );
    }

    #[test]
    fn a_runtime_crash_looping_past_its_start_limit_is_refused_in_systemctls_words() {
        struct StartLimitHit;
        impl SystemctlUserCommandRunner for StartLimitHit {
            fn run_systemctl_user(
                &self,
                _arguments: &[&str],
            ) -> Result<SystemctlUserCommandOutput, String> {
                Ok(systemctl_answered(
                    1,
                    "",
                    "Job for tatolabd.service failed because start of the service was attempted too often.\n\
                     See \"systemctl --user status tatolabd.service\" and \"journalctl --user -xeu tatolabd.service\" for details.\n",
                ))
            }
        }
        let runtime_service = SystemdUserRuntimeService::new(Box::new(StartLimitHit));

        let RuntimeAgentStartFailure::Refused(refusal) = runtime_service
            .start_runtime_agent_if_not_running()
            .unwrap_err()
        else {
            panic!("a start past systemd's start limit is a refusal");
        };
        assert!(
            refusal.starts_with(
                "systemctl --user start tatolabd.service failed (exit 1): Job for \
                 tatolabd.service failed because start of the service was attempted too often."
            ),
            "{refusal}"
        );
    }

    #[test]
    fn linux_refuses_to_open_login_items() {
        let runtime_service =
            SystemdUserRuntimeService::new(Box::new(FakeUserSystemd::with_the_unit(true, true)));

        assert_eq!(
            runtime_service.open_login_items_settings(),
            Err(LINUX_HAS_NO_LOGIN_ITEMS.to_string())
        );
    }
}
