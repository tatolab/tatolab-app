// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one controller: it owns the "Run Tatolab" switch, the machine setup, and the local
//! API client, and composes the [`TatolabStatus`] the tray shows. Everything here may block on the
//! service manager, the filesystem, the socket or the administrator prompt, so callers run it off
//! the main thread.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::local_api_client::LocalApiClient;
use crate::macos::machine_setup::{
    missing_machine_setup_pieces, prepare_local_proof_test_machine_root,
    run_machine_setup_behind_one_administrator_prompt, MissingMachineSetupPiece,
};
use crate::macos::service_management_runtime_launch_agent::ServiceManagementRuntimeLaunchAgent;
use crate::macos::tatolab_machine_paths::{
    bundled_command_line_tool_path, current_process_uid, TatolabMachinePaths,
};
use crate::poison_tolerant_mutex::lock_ignoring_poison;
use crate::run_tatolab_preference::RunTatolabPreferenceFile;
use crate::run_tatolab_switch::RunTatolabSwitch;
use crate::tatolab_status::{
    derive_runtime_state, the_runtime_just_became_unreachable, MachineSetupState,
    RuntimeHealthObservation, RuntimeState, TatolabStatus,
};

/// How long one local API request may take before the runtime reads as not answering.
const LOCAL_API_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

/// What this launch has done with the administrator prompt: opening the app shows it at most
/// once, and "Set Up Tatolab…" shows it again on request, never while one is showing.
#[derive(Debug, Default)]
struct AdministratorPromptThisLaunch {
    shown_this_launch: bool,
    showing: bool,
}

impl AdministratorPromptThisLaunch {
    /// Whether opening the app may show the prompt now; if so, it counts as showing.
    fn begin_prompt_on_app_opened(&mut self) -> bool {
        if self.shown_this_launch || self.showing {
            return false;
        }
        self.shown_this_launch = true;
        self.showing = true;
        true
    }

    /// Whether the prompt the user asked for may show now; if so, it counts as showing.
    fn begin_prompt_the_user_asked_for(&mut self) -> bool {
        if self.showing {
            return false;
        }
        self.shown_this_launch = true;
        self.showing = true;
        true
    }

    /// The prompt was answered, cancelled, or failed to show.
    fn finish_prompt(&mut self) {
        self.showing = false;
    }

    /// Whether the prompt is showing now.
    fn showing(&self) -> bool {
        self.showing
    }
}

/// The switch, the machine's paths, and what the controller remembers between status rounds.
pub struct TatolabAppController {
    run_tatolab_switch: Mutex<RunTatolabSwitch>,
    machine_paths: TatolabMachinePaths,
    bundled_command_line_tool: Option<PathBuf>,
    local_api_client: LocalApiClient,
    administrator_prompt_this_launch: Mutex<AdministratorPromptThisLaunch>,
    runtime_state_last_observed: Mutex<Option<RuntimeState>>,
}

impl TatolabAppController {
    /// The controller for this build, remembering the switch in `app_config_directory`, as the
    /// app launches at `app_launched_at`.
    pub fn for_this_build(app_config_directory: &Path, app_launched_at: Instant) -> Self {
        let machine_paths = TatolabMachinePaths::for_this_build(current_process_uid());
        let bundled_command_line_tool = bundled_command_line_tool_path();
        tracing::info!(
            local_api_socket = %machine_paths.local_api_socket.display(),
            machine_runtime_lock = %machine_paths.machine_runtime_lock_file.display(),
            bundled_command_line_tool = ?bundled_command_line_tool,
            local_proof_test_machine_root = ?machine_paths.local_proof_test_machine_root,
            "Tatolab app paths"
        );
        Self {
            run_tatolab_switch: Mutex::new(RunTatolabSwitch::load(
                Box::new(ServiceManagementRuntimeLaunchAgent::for_the_bundled_runtime()),
                RunTatolabPreferenceFile::in_app_config_directory(app_config_directory),
                app_launched_at,
            )),
            local_api_client: LocalApiClient::new(
                &machine_paths.local_api_socket,
                LOCAL_API_REQUEST_TIMEOUT,
            ),
            machine_paths,
            bundled_command_line_tool,
            administrator_prompt_this_launch: Mutex::new(AdministratorPromptThisLaunch::default()),
            runtime_state_last_observed: Mutex::new(None),
        }
    }

    fn missing_machine_setup_pieces(&self) -> Vec<MissingMachineSetupPiece> {
        missing_machine_setup_pieces(
            &self.machine_paths,
            self.bundled_command_line_tool.as_deref(),
        )
    }

    fn machine_setup_is_complete(&self) -> bool {
        self.missing_machine_setup_pieces().is_empty()
    }

    /// A local-proof build prepares its test root by itself, with no prompt.
    fn prepare_a_local_proof_test_root_if_this_build_uses_one(&self) {
        if self.machine_paths.local_proof_test_machine_root.is_none() {
            return;
        }
        if let Err(failure) = prepare_local_proof_test_machine_root(&self.machine_paths) {
            tracing::error!(%failure, "the local-proof machine root could not be prepared");
        }
    }

    /// Bring the agent in line with the switch, as opening or reopening the app does: a
    /// local-proof build prepares its test root, then the switch registers the agent when it is on
    /// and the machine is set up.
    pub fn reconcile_the_agent_with_the_run_tatolab_switch(&self) {
        self.prepare_a_local_proof_test_root_if_this_build_uses_one();
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

    /// What opening the app does once machine setup is missing in a real build: the one
    /// administrator prompt, shown at most once per launch, then the switch is reconciled. A
    /// local-proof build already prepared its test root silently in
    /// [`Self::reconcile_the_agent_with_the_run_tatolab_switch`].
    pub fn set_up_the_machine_on_app_opened(&self) {
        if self.machine_paths.local_proof_test_machine_root.is_some() {
            return;
        }
        if self.run_machine_setup_behind_the_administrator_prompt(
            AdministratorPromptThisLaunch::begin_prompt_on_app_opened,
        ) {
            self.reconcile_the_agent_with_the_run_tatolab_switch();
        }
    }

    /// "Set Up Tatolab…": create whatever machine setup is missing — behind the administrator
    /// prompt in a real build, silently in a local-proof build — then reconcile the switch.
    pub fn set_up_the_machine_on_request(&self) {
        if self.machine_paths.local_proof_test_machine_root.is_none() {
            self.run_machine_setup_behind_the_administrator_prompt(
                AdministratorPromptThisLaunch::begin_prompt_the_user_asked_for,
            );
        }
        self.reconcile_the_agent_with_the_run_tatolab_switch();
    }

    /// Show the administrator prompt for whatever setup is missing, if `begin_prompt` allows it
    /// now, blocking until it is answered; whether it was shown.
    fn run_machine_setup_behind_the_administrator_prompt(
        &self,
        begin_prompt: fn(&mut AdministratorPromptThisLaunch) -> bool,
    ) -> bool {
        let missing = self.missing_machine_setup_pieces();
        if missing.is_empty()
            || !begin_prompt(&mut lock_ignoring_poison(
                &self.administrator_prompt_this_launch,
            ))
        {
            return false;
        }
        tracing::info!(
            ?missing,
            "showing the administrator prompt for machine setup"
        );
        let machine_setup = run_machine_setup_behind_one_administrator_prompt(&missing);
        lock_ignoring_poison(&self.administrator_prompt_this_launch).finish_prompt();
        match machine_setup {
            Ok(()) => tracing::info!("machine setup is complete"),
            Err(failure) => tracing::warn!(%failure, "machine setup is unfinished"),
        }
        true
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

    /// Whether the switch is on.
    pub fn run_tatolab(&self) -> bool {
        lock_ignoring_poison(&self.run_tatolab_switch).run_tatolab()
    }

    /// Observe everything once and compose the status, as of `now`.
    pub fn compose_status(&self, now: Instant) -> TatolabStatus {
        let administrator_prompt_showing =
            lock_ignoring_poison(&self.administrator_prompt_this_launch).showing();
        let missing_setup = self.missing_machine_setup_pieces();
        let (run_tatolab, runtime_agent) = {
            let mut switch = lock_ignoring_poison(&self.run_tatolab_switch);
            let runtime_agent = switch.runtime_agent_registration_status();
            switch.notice_runtime_agent_registration_status(runtime_agent);
            (switch.run_tatolab(), runtime_agent)
        };

        let health_check = self.local_api_client.check_health();
        let runtime_health = match health_check {
            Ok(()) => RuntimeHealthObservation::Healthy,
            Err(_) => RuntimeHealthObservation::Failing,
        };
        let stream_count = if runtime_health == RuntimeHealthObservation::Healthy {
            self.listed_stream_count()
        } else {
            0
        };

        let runtime_state = {
            let mut switch = lock_ignoring_poison(&self.run_tatolab_switch);
            if runtime_health == RuntimeHealthObservation::Healthy {
                switch.note_runtime_healthy(now);
            }
            derive_runtime_state(
                run_tatolab,
                runtime_agent,
                runtime_health,
                switch.time_since_the_runtime_was_expected_up(now),
            )
        };
        let previous_runtime_state =
            lock_ignoring_poison(&self.runtime_state_last_observed).replace(runtime_state);
        if the_runtime_just_became_unreachable(previous_runtime_state, runtime_state) {
            if let Err(failure) = health_check {
                tracing::warn!(%failure, "the runtime is not responding to its health check");
            }
        }

        TatolabStatus {
            run_tatolab,
            runtime_agent,
            runtime_state,
            stream_count,
            machine_setup_state: MachineSetupState::from_observation(
                !missing_setup.is_empty(),
                administrator_prompt_showing,
            ),
        }
    }

    fn listed_stream_count(&self) -> usize {
        self.local_api_client
            .list_streams()
            .unwrap_or_else(|failure| {
                tracing::warn!(%failure, "the runtime's streams could not be listed");
                0
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_the_app_shows_the_administrator_prompt_once_per_launch_even_when_cancelled() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();

        assert!(administrator_prompt.begin_prompt_on_app_opened());
        assert!(administrator_prompt.showing());
        administrator_prompt.finish_prompt();
        assert!(!administrator_prompt.showing());

        assert!(!administrator_prompt.begin_prompt_on_app_opened());
        assert!(!administrator_prompt.showing());
    }

    #[test]
    fn set_up_tatolab_shows_the_prompt_again_after_a_cancelled_one() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();
        assert!(administrator_prompt.begin_prompt_on_app_opened());
        administrator_prompt.finish_prompt();

        assert!(administrator_prompt.begin_prompt_the_user_asked_for());
        administrator_prompt.finish_prompt();
        assert!(administrator_prompt.begin_prompt_the_user_asked_for());
    }

    #[test]
    fn no_second_prompt_shows_while_one_is_showing() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();
        assert!(administrator_prompt.begin_prompt_the_user_asked_for());

        assert!(!administrator_prompt.begin_prompt_the_user_asked_for());
        assert!(!administrator_prompt.begin_prompt_on_app_opened());
    }

    #[test]
    fn a_prompt_the_user_asked_for_counts_as_the_launch_prompt() {
        let mut administrator_prompt = AdministratorPromptThisLaunch::default();
        assert!(administrator_prompt.begin_prompt_the_user_asked_for());
        administrator_prompt.finish_prompt();

        assert!(!administrator_prompt.begin_prompt_on_app_opened());
    }
}
