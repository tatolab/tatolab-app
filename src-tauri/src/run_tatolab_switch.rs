// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The "Run Tatolab" switch: one registration is both "the runtime runs now" and "the runtime
//! starts at login". Opening the app with the switch on registers the agent once the machine is
//! set up; turning it off unregisters it, which stops the runtime, and is remembered. While the
//! app runs, the switch on also starts an enabled agent whose runtime the poller finds down.

use std::time::{Duration, Instant};

use crate::run_tatolab_preference::RunTatolabPreferenceFile;
use crate::runtime_launch_agent_registration::RuntimeLaunchAgentRegistration;
use crate::tatolab_status::{RuntimeAgentRegistrationStatus, RuntimeHealthObservation};

/// The least time between two starts of the runtime's launch agent: launchd's own minimum
/// runtime, the 10 s it lets pass before it spawns a job again.
const RUNTIME_LAUNCH_AGENT_START_MINIMUM_INTERVAL: Duration = Duration::from_secs(10);

/// Whether to start the runtime's launch agent now. launchd may leave even an enabled agent's job
/// pended as a speculative or nondemand spawn, so while the app runs it starts a runtime failing
/// its health check itself — only with the switch on and the agent enabled, and no sooner than
/// [`RUNTIME_LAUNCH_AGENT_START_MINIMUM_INTERVAL`] after the last start attempt.
fn the_runtime_launch_agent_should_be_started_now(
    run_tatolab: bool,
    runtime_agent: RuntimeAgentRegistrationStatus,
    runtime_health: RuntimeHealthObservation,
    time_since_the_last_start_attempt: Option<Duration>,
) -> bool {
    run_tatolab
        && runtime_agent == RuntimeAgentRegistrationStatus::Enabled
        && runtime_health == RuntimeHealthObservation::Failing
        && time_since_the_last_start_attempt.is_none_or(|time_since_the_last_start_attempt| {
            time_since_the_last_start_attempt >= RUNTIME_LAUNCH_AGENT_START_MINIMUM_INTERVAL
        })
}

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
    runtime_launch_agent_last_start_attempt_at: Option<Instant>,
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
            runtime_launch_agent_last_start_attempt_at: None,
        }
    }

    /// Whether the switch is on.
    pub fn run_tatolab(&self) -> bool {
        self.run_tatolab
    }

    /// The agent's registration status now.
    pub fn runtime_agent_registration_status(&self) -> RuntimeAgentRegistrationStatus {
        self.runtime_launch_agent.registration_status()
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

    /// Bring the agent in line with the switch: with the switch on and the machine set up, an
    /// unregistered agent is registered and an enabled one is started if it is not running.
    pub fn reconcile_the_agent_with_the_run_tatolab_switch(
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
            RuntimeAgentRegistrationStatus::Enabled => {
                self.start_the_runtime_if_not_running(now);
                RunTatolabReconciliation::AlreadyEnabled
            }
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
            return self
                .reconcile_the_agent_with_the_run_tatolab_switch(machine_setup_complete, now);
        }
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

    /// Flip the switch and reconcile the agent with its new value, as one step under one borrow.
    pub fn toggle(
        &mut self,
        machine_setup_complete: bool,
        now: Instant,
    ) -> RunTatolabReconciliation {
        self.set_run_tatolab(!self.run_tatolab, machine_setup_complete, now)
    }

    /// React to the agent's status as the poller saw it: the first time this launch the switch
    /// is on and the agent needs approval, Login Items opens by itself.
    pub fn notice_runtime_agent_registration_status(
        &mut self,
        runtime_agent: RuntimeAgentRegistrationStatus,
    ) {
        if self.run_tatolab && runtime_agent == RuntimeAgentRegistrationStatus::RequiresApproval {
            let _the_poller_reports_the_status_not_the_reconciliation =
                self.needs_approval_in_login_items();
        }
    }

    /// Open System Settings at Login Items because the user asked. It counts as this launch's
    /// opening, so the poller seeing the agent need approval does not open it again.
    pub fn open_login_items_settings_on_request(&mut self) {
        self.runtime_launch_agent.open_login_items_settings();
        self.login_items_settings_opened_this_launch = true;
    }

    fn register(&mut self, now: Instant) -> RunTatolabReconciliation {
        let registered = self.runtime_launch_agent.register_runtime_launch_agent();
        self.runtime_expected_up_since = now;
        // Service Management refuses the registration of an agent the user has not approved yet,
        // while recording it as awaiting approval.
        match (registered, self.runtime_launch_agent.registration_status()) {
            (_, RuntimeAgentRegistrationStatus::RequiresApproval) => {
                self.needs_approval_in_login_items()
            }
            (Ok(()), _) => {
                self.start_the_runtime_if_not_running(now);
                RunTatolabReconciliation::Registered
            }
            (Err(failure_description), _) => {
                tracing::warn!(%failure_description, "the runtime's launch agent could not be registered");
                RunTatolabReconciliation::RegistrationFailed {
                    failure_description,
                }
            }
        }
    }

    /// Start the runtime when the poller found it failing its health check at `now` and
    /// [`the_runtime_launch_agent_should_be_started_now`] says to.
    pub fn start_the_runtime_if_the_poller_found_it_down(
        &mut self,
        runtime_agent: RuntimeAgentRegistrationStatus,
        runtime_health: RuntimeHealthObservation,
        now: Instant,
    ) {
        let time_since_the_last_start_attempt = self
            .runtime_launch_agent_last_start_attempt_at
            .map(|last_start_attempt_at| now.saturating_duration_since(last_start_attempt_at));
        if !the_runtime_launch_agent_should_be_started_now(
            self.run_tatolab,
            runtime_agent,
            runtime_health,
            time_since_the_last_start_attempt,
        ) {
            return;
        }
        tracing::info!(
            ?time_since_the_last_start_attempt,
            "the runtime's agent is enabled but the runtime is not answering; starting it"
        );
        self.start_the_runtime_if_not_running(now);
    }

    fn start_the_runtime_if_not_running(&mut self, now: Instant) {
        self.runtime_launch_agent_last_start_attempt_at = Some(now);
        if let Err(failure_description) = self
            .runtime_launch_agent
            .start_runtime_launch_agent_if_not_running()
        {
            tracing::warn!(%failure_description, "the runtime's launch agent could not be started");
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
        StartIfNotRunning,
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

        fn start_runtime_launch_agent_if_not_running(&self) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(FakeServiceManagementCall::StartIfNotRunning);
            Ok(())
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
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now());

            assert_eq!(reconciliation, RunTatolabReconciliation::Registered);
            assert_eq!(
                under_test.service_management.calls(),
                vec![
                    FakeServiceManagementCall::Register,
                    FakeServiceManagementCall::StartIfNotRunning
                ]
            );
        }
    }

    #[test]
    fn opening_the_app_registers_nothing_until_the_machine_is_set_up() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotRegistered, None);

        let reconciliation = under_test
            .switch
            .reconcile_the_agent_with_the_run_tatolab_switch(false, Instant::now());

        assert_eq!(
            reconciliation,
            RunTatolabReconciliation::WaitingForMachineSetup
        );
        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn opening_the_app_starts_an_enabled_agent_without_registering_it_again() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);

        assert_eq!(
            under_test
                .switch
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
            RunTatolabReconciliation::AlreadyEnabled
        );
        assert_eq!(
            under_test.service_management.calls(),
            vec![FakeServiceManagementCall::StartIfNotRunning]
        );
    }

    #[test]
    fn a_switch_remembered_off_stays_off_after_reopening_the_app() {
        let mut under_test =
            switch_with(RuntimeAgentRegistrationStatus::NotRegistered, Some(false));

        assert!(!under_test.switch.run_tatolab());
        assert_eq!(
            under_test
                .switch
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
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
    fn toggling_flips_the_switch_and_reconciles_the_agent_each_time() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);

        assert_eq!(
            under_test.switch.toggle(true, Instant::now()),
            RunTatolabReconciliation::Unregistered
        );
        assert!(!under_test.switch.run_tatolab());
        assert!(!under_test.preference_file.load_run_tatolab());

        assert_eq!(
            under_test.switch.toggle(true, Instant::now()),
            RunTatolabReconciliation::Registered
        );
        assert!(under_test.switch.run_tatolab());
        assert!(under_test.preference_file.load_run_tatolab());
        assert_eq!(
            under_test.service_management.calls(),
            vec![
                FakeServiceManagementCall::Unregister,
                FakeServiceManagementCall::Register,
                FakeServiceManagementCall::StartIfNotRunning
            ]
        );
    }

    #[test]
    fn toggling_on_before_machine_setup_remembers_on_and_registers_nothing() {
        let mut under_test =
            switch_with(RuntimeAgentRegistrationStatus::NotRegistered, Some(false));

        assert_eq!(
            under_test.switch.toggle(false, Instant::now()),
            RunTatolabReconciliation::WaitingForMachineSetup
        );
        assert!(under_test.switch.run_tatolab());
        assert!(under_test.preference_file.load_run_tatolab());
        assert!(under_test.service_management.calls().is_empty());
    }

    #[test]
    fn an_agent_needing_approval_opens_login_items_once_per_launch() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::RequiresApproval, None);

        assert_eq!(
            under_test
                .switch
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
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
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
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
    fn login_items_opened_on_request_is_not_opened_again_by_the_poller() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::RequiresApproval, None);

        under_test.switch.open_login_items_settings_on_request();
        under_test.switch.notice_runtime_agent_registration_status(
            RuntimeAgentRegistrationStatus::RequiresApproval,
        );

        assert_eq!(
            under_test.service_management.calls(),
            vec![FakeServiceManagementCall::OpenLoginItemsSettings]
        );
    }

    #[test]
    fn login_items_opens_on_request_even_after_this_launch_opened_it() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::RequiresApproval, None);
        under_test.switch.notice_runtime_agent_registration_status(
            RuntimeAgentRegistrationStatus::RequiresApproval,
        );

        under_test.switch.open_login_items_settings_on_request();

        assert_eq!(
            under_test.service_management.calls(),
            vec![
                FakeServiceManagementCall::OpenLoginItemsSettings,
                FakeServiceManagementCall::OpenLoginItemsSettings
            ]
        );
    }

    #[test]
    fn setting_the_switch_on_while_it_is_on_starts_an_enabled_agent_again() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);

        assert_eq!(
            under_test
                .switch
                .set_run_tatolab(true, true, Instant::now()),
            RunTatolabReconciliation::AlreadyEnabled
        );
        assert!(under_test.preference_file.load_run_tatolab());
        assert_eq!(
            under_test.service_management.calls(),
            vec![FakeServiceManagementCall::StartIfNotRunning]
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
            .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now());

        assert_eq!(
            reconciliation,
            RunTatolabReconciliation::NeedsApprovalInLoginItems {
                opened_login_items_settings: true
            }
        );
        assert_eq!(
            under_test.service_management.calls(),
            vec![
                FakeServiceManagementCall::Register,
                FakeServiceManagementCall::OpenLoginItemsSettings
            ]
        );
    }

    #[test]
    fn a_failed_registration_is_reported_and_the_next_attempt_registers_again() {
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::NotFound, None);
        under_test
            .service_management
            .register_answers(Err("Invalid argument".into()));

        assert_eq!(
            under_test
                .switch
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
            RunTatolabReconciliation::RegistrationFailed {
                failure_description: "Invalid argument".into()
            }
        );

        under_test
            .service_management
            .register_answers(Ok(RuntimeAgentRegistrationStatus::Enabled));
        assert_eq!(
            under_test
                .switch
                .reconcile_the_agent_with_the_run_tatolab_switch(true, Instant::now()),
            RunTatolabReconciliation::Registered
        );
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
        under_test
            .switch
            .reconcile_the_agent_with_the_run_tatolab_switch(true, later);
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

    #[test]
    fn the_runtime_launch_agent_is_started_only_while_on_enabled_and_failing_health() {
        let never_attempted = None;
        assert!(the_runtime_launch_agent_should_be_started_now(
            true,
            RuntimeAgentRegistrationStatus::Enabled,
            RuntimeHealthObservation::Failing,
            never_attempted,
        ));
        assert!(!the_runtime_launch_agent_should_be_started_now(
            false,
            RuntimeAgentRegistrationStatus::Enabled,
            RuntimeHealthObservation::Failing,
            never_attempted,
        ));
        assert!(!the_runtime_launch_agent_should_be_started_now(
            true,
            RuntimeAgentRegistrationStatus::Enabled,
            RuntimeHealthObservation::Healthy,
            never_attempted,
        ));
        for runtime_agent in [
            RuntimeAgentRegistrationStatus::RequiresApproval,
            RuntimeAgentRegistrationStatus::NotRegistered,
            RuntimeAgentRegistrationStatus::NotFound,
        ] {
            assert!(
                !the_runtime_launch_agent_should_be_started_now(
                    true,
                    runtime_agent,
                    RuntimeHealthObservation::Failing,
                    never_attempted,
                ),
                "{runtime_agent:?}"
            );
        }
    }

    #[test]
    fn the_runtime_launch_agent_is_started_at_most_once_per_minimum_interval() {
        for (time_since_the_last_start_attempt, expected) in [
            (Duration::ZERO, false),
            (Duration::from_secs(9), false),
            (RUNTIME_LAUNCH_AGENT_START_MINIMUM_INTERVAL, true),
            (Duration::from_secs(60), true),
        ] {
            assert_eq!(
                the_runtime_launch_agent_should_be_started_now(
                    true,
                    RuntimeAgentRegistrationStatus::Enabled,
                    RuntimeHealthObservation::Failing,
                    Some(time_since_the_last_start_attempt),
                ),
                expected,
                "{time_since_the_last_start_attempt:?}"
            );
        }
    }

    #[test]
    fn a_runtime_found_down_is_started_ten_seconds_after_the_last_start_attempt() {
        let opened_at = Instant::now();
        let mut under_test = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);
        under_test
            .switch
            .reconcile_the_agent_with_the_run_tatolab_switch(true, opened_at);
        let start_calls = |under_test: &SwitchUnderTest| {
            under_test
                .service_management
                .calls()
                .iter()
                .filter(|call| **call == FakeServiceManagementCall::StartIfNotRunning)
                .count()
        };
        assert_eq!(start_calls(&under_test), 1);

        for (seconds_after_opening, expected_start_calls) in
            [(2, 1), (9, 1), (10, 2), (12, 2), (20, 3)]
        {
            under_test
                .switch
                .start_the_runtime_if_the_poller_found_it_down(
                    RuntimeAgentRegistrationStatus::Enabled,
                    RuntimeHealthObservation::Failing,
                    opened_at + Duration::from_secs(seconds_after_opening),
                );
            assert_eq!(
                start_calls(&under_test),
                expected_start_calls,
                "{seconds_after_opening} s after opening"
            );
        }
    }

    #[test]
    fn a_runtime_found_down_with_the_switch_off_or_healthy_is_left_alone() {
        let later = Instant::now() + Duration::from_secs(60);
        let mut switched_off = switch_with(RuntimeAgentRegistrationStatus::Enabled, Some(false));
        switched_off
            .switch
            .start_the_runtime_if_the_poller_found_it_down(
                RuntimeAgentRegistrationStatus::Enabled,
                RuntimeHealthObservation::Failing,
                later,
            );
        assert!(switched_off.service_management.calls().is_empty());

        let mut healthy = switch_with(RuntimeAgentRegistrationStatus::Enabled, None);
        healthy
            .switch
            .start_the_runtime_if_the_poller_found_it_down(
                RuntimeAgentRegistrationStatus::Enabled,
                RuntimeHealthObservation::Healthy,
                later,
            );
        assert!(healthy.service_management.calls().is_empty());
    }
}
