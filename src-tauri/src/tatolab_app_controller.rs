// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one controller: it owns the "Run Tatolab" switch, the machine setup, and the local
//! API client, and composes the [`TatolabStatus`] the tray and the window show. Everything here
//! may block on the service manager, the filesystem, the socket or the administrator prompt, so
//! callers run it off the main thread.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::local_api_client::{LocalApiClient, LocalApiRequestFailure};
use crate::platform::{tatolab_platform_for_this_build, MachineSetupTrigger, TatolabMachineSetup};
use crate::poison_tolerant_mutex::lock_ignoring_poison;
use crate::run_tatolab_preference::RunTatolabPreferenceFile;
use crate::run_tatolab_switch::RunTatolabSwitch;
use crate::stream_graph_summary::StreamGraphSummary;
use crate::stream_log_records_page::StreamLogRecordsPage;
use crate::tatolab_status::{
    derive_runtime_state, the_runtime_just_became_unreachable,
    the_stream_listing_just_started_failing, ListedStream, MachineSetupState,
    RuntimeAgentRegistrationStatus, RuntimeHealthObservation, RuntimeState, TatolabStatus,
};

/// How long one local API request may take before the runtime reads as not answering.
const LOCAL_API_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

/// How many log records one page the window reads holds.
const STREAM_LOG_RECORDS_PER_PAGE: u32 = 500;

/// The machine's name, asked of the runtime once each time it comes up.
#[derive(Debug, Default)]
struct MachineNameAskedOncePerRuntimeUpEpisode {
    /// `None` until asked since the runtime came up; then what it answered, `None` when it did
    /// not say.
    answer_this_episode: Option<Option<String>>,
}

impl MachineNameAskedOncePerRuntimeUpEpisode {
    /// This episode's answer, calling `ask_the_runtime` only the first time.
    fn machine_name(&mut self, ask_the_runtime: impl FnOnce() -> Option<String>) -> Option<String> {
        self.answer_this_episode
            .get_or_insert_with(ask_the_runtime)
            .clone()
    }

    /// The runtime is down, so the next time it is up it is asked again.
    fn runtime_is_down(&mut self) {
        self.answer_this_episode = None;
    }
}

/// The switch, the machine setup, and what the controller remembers between status rounds.
pub struct TatolabAppController {
    app_version: String,
    run_tatolab_switch: Mutex<RunTatolabSwitch>,
    machine_setup: Box<dyn TatolabMachineSetup>,
    local_api_client: LocalApiClient,
    runtime_state_last_observed: Mutex<Option<RuntimeState>>,
    stream_listing_failed_last_round: Mutex<bool>,
    machine_name_of_the_running_runtime: Mutex<MachineNameAskedOncePerRuntimeUpEpisode>,
}

impl TatolabAppController {
    /// The controller for this build of the app at `app_version`, remembering the switch in
    /// `app_config_directory`, as the app launches at `app_launched_at`.
    pub fn for_this_build(
        app_config_directory: &Path,
        app_launched_at: Instant,
        app_version: String,
    ) -> Self {
        let platform = tatolab_platform_for_this_build();
        Self {
            app_version,
            run_tatolab_switch: Mutex::new(RunTatolabSwitch::load(
                platform.runtime_agent,
                RunTatolabPreferenceFile::in_app_config_directory(app_config_directory),
                app_launched_at,
            )),
            machine_setup: platform.machine_setup,
            local_api_client: LocalApiClient::new(
                &platform.local_api_socket,
                LOCAL_API_REQUEST_TIMEOUT,
            ),
            runtime_state_last_observed: Mutex::new(None),
            stream_listing_failed_last_round: Mutex::new(false),
            machine_name_of_the_running_runtime: Mutex::new(
                MachineNameAskedOncePerRuntimeUpEpisode::default(),
            ),
        }
    }

    fn machine_setup_is_complete(&self) -> bool {
        self.machine_setup
            .observe_machine_setup()
            .machine_setup_state
            == MachineSetupState::Complete
    }

    /// Bring the agent in line with the switch, as opening or reopening the app does: whatever
    /// machine setup needs no prompt is set up, then the switch registers the agent when it is on
    /// and the machine is set up.
    pub fn reconcile_the_agent_with_the_run_tatolab_switch(&self) {
        self.machine_setup
            .set_up_the_machine(MachineSetupTrigger::ReconcilingTheSwitch);
        let machine_setup_complete = self.machine_setup_is_complete();
        let reconciliation = lock_ignoring_poison(&self.run_tatolab_switch)
            .reconcile_the_agent_with_the_run_tatolab_switch(
                machine_setup_complete,
                Instant::now(),
            );
        tracing::info!(
            ?reconciliation,
            "reconciled the agent with the Run Tatolab switch"
        );
    }

    /// What opening the app does once the switch is reconciled: the administrator prompt for
    /// whatever setup is missing, at most once per launch, then the switch is reconciled again.
    pub fn set_up_the_machine_on_app_opened(&self) {
        if self
            .machine_setup
            .set_up_the_machine(MachineSetupTrigger::AppOpened)
        {
            self.reconcile_the_agent_with_the_run_tatolab_switch();
        }
    }

    /// "Set Up Tatolab…": create whatever machine setup is missing — behind the administrator
    /// prompt in a real build, silently in a local-proof build — then reconcile the switch.
    pub fn set_up_the_machine_on_request(&self) {
        self.machine_setup
            .set_up_the_machine(MachineSetupTrigger::UserAsked);
        self.reconcile_the_agent_with_the_run_tatolab_switch();
    }

    /// Why "Set Up Tatolab…" is refused on this platform; `None` where it runs.
    pub fn set_up_tatolab_refusal(&self) -> Option<&'static str> {
        self.machine_setup.set_up_tatolab_refusal()
    }

    /// "Run Tatolab" chosen from the tray: flip the switch, remember it, and reconcile the agent,
    /// all under one lock.
    pub fn toggle_run_tatolab(&self) {
        let machine_setup_complete = self.machine_setup_is_complete();
        let mut switch = lock_ignoring_poison(&self.run_tatolab_switch);
        let reconciliation = switch.toggle(machine_setup_complete, Instant::now());
        tracing::info!(
            run_tatolab = switch.run_tatolab(),
            ?reconciliation,
            "Run Tatolab switched"
        );
    }

    /// "Run Tatolab" set from the window: set the switch, remember it, and reconcile the agent,
    /// all under one lock.
    pub fn set_run_tatolab(&self, run_tatolab: bool) {
        let machine_setup_complete = self.machine_setup_is_complete();
        let reconciliation = lock_ignoring_poison(&self.run_tatolab_switch).set_run_tatolab(
            run_tatolab,
            machine_setup_complete,
            Instant::now(),
        );
        tracing::info!(run_tatolab, ?reconciliation, "Run Tatolab set");
    }

    /// Whether the switch is on.
    pub fn run_tatolab(&self) -> bool {
        lock_ignoring_poison(&self.run_tatolab_switch).run_tatolab()
    }

    /// Open System Settings at Login Items, where a user approves the runtime's login item;
    /// refused where the platform has no Login Items.
    pub fn open_login_items_settings(&self) -> Result<(), String> {
        lock_ignoring_poison(&self.run_tatolab_switch).open_login_items_settings_on_request()
    }

    /// With the switch on, open System Settings at Login Items the first time this launch the
    /// poller sees `runtime_agent` needing approval.
    pub fn open_login_items_if_the_runtime_agent_needs_approval(
        &self,
        runtime_agent: RuntimeAgentRegistrationStatus,
    ) {
        lock_ignoring_poison(&self.run_tatolab_switch)
            .notice_runtime_agent_registration_status(runtime_agent);
    }

    /// Start the runtime when the poller's `status`, observed at `now`, found it down with the
    /// switch on and the agent enabled, at most once per launchd's minimum runtime.
    pub fn start_the_runtime_if_the_poller_found_it_down(
        &self,
        status: &TatolabStatus,
        now: Instant,
    ) {
        let runtime_health = if status.runtime_state == RuntimeState::Running {
            RuntimeHealthObservation::Healthy
        } else {
            RuntimeHealthObservation::Failing
        };
        lock_ignoring_poison(&self.run_tatolab_switch)
            .start_the_runtime_if_the_poller_found_it_down(
                status.runtime_agent,
                runtime_health,
                now,
            );
    }

    /// Observe everything once and compose the status, as of `now`; opens nothing. The local API
    /// is asked with no lock held, so a slow runtime never holds up the tray's switch.
    pub fn compose_status(&self, now: Instant) -> TatolabStatus {
        let machine_setup = self.machine_setup.observe_machine_setup();

        let health_check = self.local_api_client.check_health();
        let runtime_health = match health_check {
            Ok(()) => RuntimeHealthObservation::Healthy,
            Err(_) => RuntimeHealthObservation::Failing,
        };
        let (streams, machine_name) = if runtime_health == RuntimeHealthObservation::Healthy {
            (
                self.listed_streams(),
                self.machine_name_of_the_running_runtime(),
            )
        } else {
            lock_ignoring_poison(&self.machine_name_of_the_running_runtime).runtime_is_down();
            (None, None)
        };

        let (run_tatolab, runtime_agent, runtime_state) = {
            let mut switch = lock_ignoring_poison(&self.run_tatolab_switch);
            let run_tatolab = switch.run_tatolab();
            let runtime_agent = switch.runtime_agent_registration_status();
            if runtime_health == RuntimeHealthObservation::Healthy {
                switch.note_runtime_healthy(now);
            }
            let runtime_state = derive_runtime_state(
                run_tatolab,
                runtime_agent,
                runtime_health,
                switch.time_since_the_runtime_was_expected_up(now),
            );
            (run_tatolab, runtime_agent, runtime_state)
        };
        let previous_runtime_state =
            lock_ignoring_poison(&self.runtime_state_last_observed).replace(runtime_state);
        if the_runtime_just_became_unreachable(previous_runtime_state, runtime_state) {
            if let Err(failure) = health_check {
                tracing::warn!(%failure, "the runtime is not responding to its health check");
            }
        }

        TatolabStatus {
            app_version: self.app_version.clone(),
            run_tatolab,
            runtime_agent,
            runtime_state,
            machine_name,
            streams,
            machine_setup_state: machine_setup.machine_setup_state,
            command_line_tool_linked_at: machine_setup
                .command_line_tool_linked_at
                .map(|link_path| link_path.display().to_string()),
        }
    }

    /// The window's next page of `stream`'s log records: those numbered after `after`.
    pub fn read_stream_log_records(
        &self,
        stream: &str,
        after: u64,
    ) -> Result<StreamLogRecordsPage, LocalApiRequestFailure> {
        self.local_api_client
            .read_stream_log_records(stream, after, STREAM_LOG_RECORDS_PER_PAGE)
    }

    /// The graph of the loaded stream `stream`.
    pub fn describe_stream_graph(
        &self,
        stream: &str,
    ) -> Result<StreamGraphSummary, LocalApiRequestFailure> {
        self.local_api_client.describe_stream_graph(stream)
    }

    /// The runtime's streams, or `None` when listing failed, which is logged on the round it
    /// starts failing.
    fn listed_streams(&self) -> Option<Vec<ListedStream>> {
        let streams = self.local_api_client.list_streams();
        let stream_listing_failed_this_round = streams.is_err();
        let stream_listing_failed_last_round = std::mem::replace(
            &mut *lock_ignoring_poison(&self.stream_listing_failed_last_round),
            stream_listing_failed_this_round,
        );
        if the_stream_listing_just_started_failing(
            stream_listing_failed_last_round,
            stream_listing_failed_this_round,
        ) {
            if let Err(failure) = &streams {
                tracing::warn!(%failure, "the runtime's streams could not be listed");
            }
        }
        streams.ok()
    }

    /// The running runtime's name for this machine, asked once each time the runtime comes up;
    /// only the poller asks, so holding the lock across the request holds up no one.
    fn machine_name_of_the_running_runtime(&self) -> Option<String> {
        lock_ignoring_poison(&self.machine_name_of_the_running_runtime).machine_name(|| {
            match self.local_api_client.machine_name() {
                Ok(machine_name) => Some(machine_name),
                Err(failure) => {
                    tracing::warn!(
                        %failure,
                        "the runtime's machine name could not be read; it is asked again once the runtime restarts"
                    );
                    None
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_machine_name_is_asked_once_while_the_runtime_stays_up() {
        let mut machine_name = MachineNameAskedOncePerRuntimeUpEpisode::default();
        let mut times_asked = 0;

        for _ in 0..3 {
            let answer = machine_name.machine_name(|| {
                times_asked += 1;
                Some("jonathanf-macbook".to_string())
            });
            assert_eq!(answer.as_deref(), Some("jonathanf-macbook"));
        }
        assert_eq!(times_asked, 1);
    }

    #[test]
    fn a_machine_name_the_runtime_did_not_give_is_asked_again_only_after_a_restart() {
        let mut machine_name = MachineNameAskedOncePerRuntimeUpEpisode::default();

        assert_eq!(machine_name.machine_name(|| None), None);
        assert_eq!(
            machine_name.machine_name(|| Some("asked-twice".to_string())),
            None
        );

        machine_name.runtime_is_down();
        assert_eq!(
            machine_name
                .machine_name(|| Some("jonathanf-macbook".to_string()))
                .as_deref(),
            Some("jonathanf-macbook")
        );
    }
}
