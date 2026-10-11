// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The "Run Tatolab" switch: one registration is both "the runtime runs now" and "the runtime
//! starts at login". Opening the app with the switch on registers the agent once the machine is
//! set up; turning it off unregisters it, which stops the runtime, and is remembered.

use std::time::{Duration, Instant};

use crate::run_tatolab_preference::RunTatolabPreferenceFile;
use crate::runtime_launch_agent_registration::RuntimeLaunchAgentRegistration;
use crate::tatolab_status::RuntimeAgentRegistrationStatus;

/// What reconciling the switch with the agent's registration did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunTatolabReconciliation {
    /// The switch is off; the agent is left as it is.
    SwitchIsOff,
    /// The switch is on, but the machine lock and CLI link are not set up yet.
    WaitingForMachineSetup,
    /// The agent was already enabled.
    AlreadyEnabled,
    /// The agent was registered just now and is enabled.
    Registered,
    /// The agent is registered but the user has to approve it in Login Items.
    NeedsApprovalInLoginItems { opened_login_items_settings: bool },
    /// Registering the agent failed.
    RegistrationFailed { failure_description: String },
    /// The switch was turned off and the agent unregistered (or was not registered).
    Unregistered,
    /// The switch was turned off but unregistering the agent failed.
    UnregistrationFailed { failure_description: String },
}

/// The switch's remembered value, the agent it drives, and what this launch has already done.
pub struct RunTatolabSwitch {
    runtime_launch_agent: Box<dyn RuntimeLaunchAgentRegistration>,
    preference_file: RunTatolabPreferenceFile,
    run_tatolab: bool,
    login_items_settings_opened_this_launch: bool,
    runtime_expected_up_since: Instant,
    last_registration_failure: Option<String>,
}

impl RunTatolabSwitch {
    /// The switch as remembered in `preference_file`, driving `runtime_launch_agent`, as the app
    /// launches at `app_launched_at`.
    pub fn load(
        runtime_launch_agent: Box<dyn RuntimeLaunchAgentRegistration>,
        preference_file: RunTatolabPreferenceFile,
        app_launched_at: Instant,
    ) -> Self {
        let run_tatolab = preference_file.load_run_tatolab();
        Self {
            runtime_launch_agent,
            preference_file,
            run_tatolab,
            login_items_settings_opened_this_launch: false,
            runtime_expected_up_since: app_launched_at,
            last_registration_failure: None,
        }
    }

    /// Whether the switch is on.
    pub fn run_tatolab(&self) -> bool {
        self.run_tatolab
    }

    /// Why the last registration attempt failed, until one succeeds.
    pub fn last_registration_failure(&self) -> Option<&str> {
        self.last_registration_failure.as_deref()
    }

    /// The agent's registration status now.
    pub fn runtime_agent_registration_status(&self) -> RuntimeAgentRegistrationStatus {
        self.runtime_launch_agent.registration_status()
    }

    /// Open System Settings at Login Items.
    pub fn open_login_items_settings(&self) {
        self.runtime_launch_agent.open_login_items_settings();
    }

    /// Note that the runtime answered its health check at `now`, so a later failure gets the
    /// starting grace period again, as when launchd restarts a runtime that crashed.
    pub fn note_runtime_healthy(&mut self, now: Instant) {
        self.runtime_expected_up_since = now;
    }

    /// How long the runtime has had to come up since the app launched, the agent was
    /// registered, or the runtime last answered.
    pub fn time_since_the_runtime_was_expected_up(&self, now: Instant) -> Duration {
        now.saturating_duration_since(self.runtime_expected_up_since)
    }

    /// Bring the agent in line with the switch, as when the app is opened: with the switch on and
    /// the machine set up, an unregistered agent is registered.
    pub fn reconcile_on_app_opened(
        &mut self,
        machine_setup_complete: bool,
        now: Instant,
    ) -> RunTatolabReconciliation {
        if !self.run_tatolab {
            return RunTatolabReconciliation::SwitchIsOff;
        }
        if !machine_setup_complete {
            return RunTatolabReconciliation::WaitingForMachineSetup;
        }
        match self.runtime_launch_agent.registration_status() {
            RuntimeAgentRegistrationStatus::Enabled => RunTatolabReconciliation::AlreadyEnabled,
            RuntimeAgentRegistrationStatus::RequiresApproval => {
                self.needs_approval_in_login_items()
            }
            RuntimeAgentRegistrationStatus::NotRegistered
            | RuntimeAgentRegistrationStatus::NotFound => self.register(now),
        }
    }

    /// Turn the switch on or off and remember it. On registers the agent once the machine is set
    /// up; off unregisters it, which stops the runtime.
    pub fn set_run_tatolab(
        &mut self,
        run_tatolab: bool,
        machine_setup_complete: bool,
        now: Instant,
    ) -> RunTatolabReconciliation {
        self.run_tatolab = run_tatolab;
        if let Err(failure) = self.preference_file.save_run_tatolab(run_tatolab) {
            tracing::warn!(%failure, run_tatolab, "the Run Tatolab switch could not be remembered");
        }
        if run_tatolab {
            return self.reconcile_on_app_opened(machine_setup_complete, now);
        }
        self.last_registration_failure = None;
        match self.runtime_launch_agent.registration_status() {
            RuntimeAgentRegistrationStatus::NotRegistered
            | RuntimeAgentRegistrationStatus::NotFound => RunTatolabReconciliation::Unregistered,
            RuntimeAgentRegistrationStatus::Enabled
            | RuntimeAgentRegistrationStatus::RequiresApproval => {
                match self.runtime_launch_agent.unregister_runtime_launch_agent() {
                    Ok(()) => RunTatolabReconciliation::Unregistered,
                    Err(failure_description) => {
                        tracing::warn!(%failure_description, "the runtime's launch agent could not be unregistered");
                        RunTatolabReconciliation::UnregistrationFailed {
                            failure_description,
                        }
                    }
                }
            }
        }
    }

    /// React to the agent's status as the poller saw it: the first time this launch the switch
    /// is on and the agent needs approval, Login Items opens by itself.
    pub fn notice_runtime_agent_registration_status(
        &mut self,
        runtime_agent: RuntimeAgentRegistrationStatus,
    ) {
        if self.run_tatolab && runtime_agent == RuntimeAgentRegistrationStatus::RequiresApproval {
            self.needs_approval_in_login_items();
        }
    }

    fn register(&mut self, now: Instant) -> RunTatolabReconciliation {
        let registered = self.runtime_launch_agent.register_runtime_launch_agent();
        self.runtime_expected_up_since = now;
        // Service Management refuses the registration of an agent the user has not approved yet,
        // while recording it as awaiting approval.
        match (registered, self.runtime_launch_agent.registration_status()) {
            (_, RuntimeAgentRegistrationStatus::RequiresApproval) => {
                self.last_registration_failure = None;
                self.needs_approval_in_login_items()
            }
            (Ok(()), _) => {
                self.last_registration_failure = None;
                RunTatolabReconciliation::Registered
            }
            (Err(failure_description), _) => {
                tracing::warn!(%failure_description, "the runtime's launch agent could not be registered");
                self.last_registration_failure = Some(failure_description.clone());
                RunTatolabReconciliation::RegistrationFailed {
                    failure_description,
                }
            }
        }
    }

    fn needs_approval_in_login_items(&mut self) -> RunTatolabReconciliation {
        let opened_login_items_settings = !self.login_items_settings_opened_this_launch;
        if opened_login_items_settings {
            self.runtime_launch_agent.open_login_items_settings();
            self.login_items_settings_opened_this_launch = true;
        }
        RunTatolabReconciliation::NeedsApprovalInLoginItems {
            opened_login_items_settings,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum FakeServiceManagementCall {
        Register,
        Unregister,
        OpenLoginItemsSettings,
    }

    /// A service manager whose agent status the test sets, recording every call it receives.
    #[derive(Clone)]
    struct FakeServiceManagement {
        status: Arc<Mutex<RuntimeAgentRegistrationStatus>>,
        status_after_register: Arc<Mutex<Result<RuntimeAgentRegistrationStatus, String>>>,
        calls: Arc<Mutex<Vec<FakeServiceManagementCall>>>,
    }

    impl FakeServiceManagement {
        fn with_status(status: RuntimeAgentRegistrationStatus) -> Self {
            Self {
                status: Arc::new(Mutex::new(status)),
                status_after_register: Arc::new(Mutex::new(Ok(
                    RuntimeAgentRegistrationStatus::Enabled,
                ))),
                calls: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn register_answers(&self, answer: Result<RuntimeAgentRegistrationStatus, String>) {
            *self.status_after_register.lock().unwrap() = answer;
        }

        fn calls(&self) -> Vec<FakeServiceManagementCall> {
            self.calls.lock().unwrap().clone()
        }

        fn status(&self) -> RuntimeAgentRegistrationStatus {
            *self.status.lock().unwrap()
        }
    }

    impl RuntimeLaunchAgentRegistration for FakeServiceManagement {
        fn registration_status(&self) -> RuntimeAgentRegistrationStatus {
            self.status()
        }

        fn register_runtime_launch_agent(&self) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(FakeServiceManagementCall::Register);
            match self.status_after_register.lock().unwrap().clone() {
                Ok(status) => {
                    *self.status.lock().unwrap() = status;
                    if status == RuntimeAgentRegistrationStatus::RequiresApproval {
                        Err("Operation not permitted".into())
                    } else {
                        Ok(())
                    }
                }
                Err(failure) => Err(failure),
            }
        }

        fn unregister_runtime_launch_agent(&self) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(FakeServiceManagementCall::Unregister);
            *self.status.lock().unwrap() = RuntimeAgentRegistrationStatus::NotRegistered;
            Ok(())
        }

        fn open_login_items_settings(&self) {
            self.calls
                .lock()
                .unwrap()
                .push(FakeServiceManagementCall::OpenLoginItemsSettings);
        }
    }

    struct SwitchUnderTest {
        switch: RunTatolabSwitch,
        service_management: FakeServiceManagement,
        preference_file: RunTatolabPreferenceFile,
        _config_directory: tempfile::TempDir,
    }

    fn switch_with(
        agent_status: RuntimeAgentRegistrationStatus,
        remembered_run_tatolab: Option<bool>,
    ) -> SwitchUnderTest {
        let config_directory = tempfile::tempdir().unwrap();
        let preference_file =
            RunTatolabPreferenceFile::in_app_config_directory(config_directory.path());
        if let Some(remembered) = remembered_run_tatolab {
            preference_file.save_run_tatolab(remembered).unwrap();
        }
        let service_management = FakeServiceManagement::with_status(agent_status);
        let switch = RunTatolabSwitch::load(
            Box::new(service_management.clone()),
            preference_file.clone(),
            Instant::now(),
        );
        SwitchUnderTest {
            switch,
            service_management,
            preference_file,
            _config_directory: config_directory,
        }
    }

    #[test]
    fn opening_the_app_with_the_switch_on_registers_an_unregistered_agent() {
        for agent_status in [
            RuntimeAgentRegistrationStatus::NotRegistered,
            RuntimeAgentRegistrationStatus::NotFound,
        ] {
            let mut under_test = switch_with(agent_status, None);
            assert!(under_test.switch.run_tatolab(), "the switch defaults on");

            let reconciliation = under_test
                .switch
                .reconcile_on_app_opened(true, Instant::now());

            assert_eq!(reconciliation, RunTatolabReconciliation::Registered);
            assert_eq!(
                under_test.service_management.calls(),
                vec![FakeServiceManagementCall::Register]
            );
        }
    }

    #[test]
    fn opening_the_app_registers_nothing_until_the_machine_is_set_up() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotRegistered, None);

        let reconciliation = under_test
            .switch
            .reconcile_on_app_opened(false, Instant::now());

        assert_eq!(
            reconciliation,
            RunTatolabReconciliation::WaitingForMachineSetup
        );
        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn opening_the_app_leaves_an_enabled_agent_alone() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);

        assert_eq!(
            under_test
                .switch
                .reconcile_on_app_opened(true, Instant::now()),
            RunTatolabReconciliation::AlreadyEnabled
        );
        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn a_switch_remembered_off_stays_off_after_reopening_the_app() {
        let mut under_test =
            switch_with(RuntimeAgentRegistrationStatus::NotRegistered, Some(false));

        assert!(!under_test.switch.run_tatolab());
        assert_eq!(
            under_test
                .switch
                .reconcile_on_app_opened(true, Instant::now()),
            RunTatolabReconciliation::SwitchIsOff
        );
        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn turning_the_switch_off_unregisters_the_agent_and_is_remembered() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);

        let reconciliation = under_test
            .switch
            .set_run_tatolab(false, true, Instant::now());

        assert_eq!(reconciliation, RunTatolabReconciliation::Unregistered);
        assert_eq!(
            under_test.service_management.calls(),
            vec![FakeServiceManagementCall::Unregister]
        );
        assert_eq!(
            under_test.service_management.status(),
            RuntimeAgentRegistrationStatus::NotRegistered
        );
        assert!(!under_test.preference_file.load_run_tatolab());
    }

    #[test]
    fn turning_the_switch_off_with_nothing_registered_calls_nothing() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotRegistered, None);

        assert_eq!(
            under_test
                .switch
                .set_run_tatolab(false, true, Instant::now()),
            RunTatolabReconciliation::Unregistered
        );
        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn turning_the_switch_back_on_registers_and_is_remembered() {
        let mut under_test =
            switch_with(RuntimeAgentRegistrationStatus::NotRegistered, Some(false));

        let reconciliation = under_test
            .switch
            .set_run_tatolab(true, true, Instant::now());

        assert_eq!(reconciliation, RunTatolabReconciliation::Registered);
        assert!(under_test.preference_file.load_run_tatolab());
    }

    #[test]
    fn an_agent_needing_approval_opens_login_items_once_per_launch() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::RequiresApproval, None);

        assert_eq!(
            under_test
                .switch
                .reconcile_on_app_opened(true, Instant::now()),
            RunTatolabReconciliation::NeedsApprovalInLoginItems {
                opened_login_items_settings: true
            }
        );
        under_test.switch.notice_runtime_agent_registration_status(
            RuntimeAgentRegistrationStatus::RequiresApproval,
        );
        assert_eq!(
            under_test
                .switch
                .reconcile_on_app_opened(true, Instant::now()),
            RunTatolabReconciliation::NeedsApprovalInLoginItems {
                opened_login_items_settings: false
            }
        );
        assert_eq!(
            under_test.service_management.calls(),
            vec![FakeServiceManagementCall::OpenLoginItemsSettings]
        );
    }

    #[test]
    fn a_registration_refused_for_approval_reports_approval_rather_than_failure() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotRegistered, None);
        under_test
            .service_management
            .register_answers(Ok(RuntimeAgentRegistrationStatus::RequiresApproval));

        let reconciliation = under_test
            .switch
            .reconcile_on_app_opened(true, Instant::now());

        assert_eq!(
            reconciliation,
            RunTatolabReconciliation::NeedsApprovalInLoginItems {
                opened_login_items_settings: true
            }
        );
        assert_eq!(under_test.switch.last_registration_failure(), None);
        assert_eq!(
            under_test.service_management.calls(),
            vec![
                FakeServiceManagementCall::Register,
                FakeServiceManagementCall::OpenLoginItemsSettings
            ]
        );
    }

    #[test]
    fn a_failed_registration_is_reported_and_remembered_until_one_succeeds() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotFound, None);
        under_test
            .service_management
            .register_answers(Err("Invalid argument".into()));

        assert_eq!(
            under_test
                .switch
                .reconcile_on_app_opened(true, Instant::now()),
            RunTatolabReconciliation::RegistrationFailed {
                failure_description: "Invalid argument".into()
            }
        );
        assert_eq!(
            under_test.switch.last_registration_failure(),
            Some("Invalid argument")
        );

        under_test
            .service_management
            .register_answers(Ok(RuntimeAgentRegistrationStatus::Enabled));
        under_test
            .switch
            .reconcile_on_app_opened(true, Instant::now());
        assert_eq!(under_test.switch.last_registration_failure(), None);
    }

    #[test]
    fn the_poller_seeing_approval_needed_with_the_switch_off_opens_nothing() {
        let mut under_test = switch_with(
            RuntimeAgentRegistrationStatus::RequiresApproval,
            Some(false),
        );

        under_test.switch.notice_runtime_agent_registration_status(
            RuntimeAgentRegistrationStatus::RequiresApproval,
        );

        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn registering_or_a_healthy_answer_restarts_the_starting_grace_period() {
        let launched_at = Instant::now();
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotRegistered, None);
        under_test.switch.runtime_expected_up_since = launched_at;

        let later = launched_at + Duration::from_secs(60);
        assert_eq!(
            under_test
                .switch
                .time_since_the_runtime_was_expected_up(later),
            Duration::from_secs(60)
        );
        under_test.switch.reconcile_on_app_opened(true, later);
        assert_eq!(
            under_test
                .switch
                .time_since_the_runtime_was_expected_up(later),
            Duration::ZERO
        );
        let healthy_at = later + Duration::from_secs(30);
        under_test.switch.note_runtime_healthy(healthy_at);
        assert_eq!(
            under_test
                .switch
                .time_since_the_runtime_was_expected_up(healthy_at + Duration::from_secs(5)),
            Duration::from_secs(5)
        );
    }
}
