// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The status the tray and the window show, and the pure rules that derive the runtime's state
//! from what the poller observed.

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// How long an enabled runtime may fail its health check before it reads unreachable rather
/// than starting.
pub const RUNTIME_STARTING_GRACE_PERIOD: Duration = Duration::from_secs(20);

/// Everything the app knows about Tatolab on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TatolabStatus {
    /// The app's version as its bundle states it.
    pub app_version: String,
    pub platform: TatolabPlatform,
    pub run_tatolab: bool,
    pub runtime_agent: RuntimeAgentRegistrationStatus,
    pub runtime_state: RuntimeState,
    /// This machine's name as the running runtime gives it; `None` while the runtime is down or
    /// did not say.
    pub machine_name: Option<String>,
    /// Every stream the runtime holds; `None` when they were not listed or listing failed.
    pub streams: Option<Vec<ListedStream>>,
    pub machine_setup_state: MachineSetupState,
    /// The PATH link to this bundle's `tatolab` CLI; `None` when there is none.
    pub command_line_tool_linked_at: Option<String>,
}

/// The platform the app runs on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TatolabPlatform {
    Macos,
    Linux,
}

/// One stream the runtime holds, as its `list_streams` tool lists it. A state this app does not
/// know yet is kept as the runtime spells it, an absent project directory reads empty, and fields
/// this app does not know are ignored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListedStream {
    pub name: String,
    /// `attached`, `kept`, `stopped` or `failed`, or whatever a newer runtime spells.
    pub state: String,
    #[serde(default)]
    pub project_directory: String,
    /// How many nodes its loaded graph holds; `None` when it is not loaded.
    pub node_count: Option<u64>,
    /// Why it failed; `None` when it did not.
    pub failed_because: Option<String>,
}

/// What launchd's Service Management says about the runtime's launch agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeAgentRegistrationStatus {
    Enabled,
    RequiresApproval,
    NotRegistered,
    NotFound,
}

/// Whether the runtime answers its local API.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeState {
    Running,
    Starting,
    Stopped,
    Unreachable,
}

/// Whether first-launch machine setup still needs the administrator prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MachineSetupState {
    Complete,
    /// Setup is missing and no administrator prompt is showing.
    NeedsAdministrator,
    /// Setup is missing and the administrator prompt is showing.
    WaitingForAdministrator,
}

impl MachineSetupState {
    /// The state from whether any setup piece is missing and whether the prompt is showing.
    pub fn from_observation(
        machine_setup_pieces_missing: bool,
        administrator_prompt_showing: bool,
    ) -> Self {
        match (machine_setup_pieces_missing, administrator_prompt_showing) {
            (false, _) => MachineSetupState::Complete,
            (true, true) => MachineSetupState::WaitingForAdministrator,
            (true, false) => MachineSetupState::NeedsAdministrator,
        }
    }
}

/// What the poller saw of the runtime's local API in one round.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeHealthObservation {
    Healthy,
    Failing,
}

/// The runtime's state from the switch, the agent's registration, the health check, and how
/// long the runtime has had to come up since it was last registered, launched or healthy.
pub fn derive_runtime_state(
    run_tatolab: bool,
    runtime_agent: RuntimeAgentRegistrationStatus,
    runtime_health: RuntimeHealthObservation,
    time_since_the_runtime_was_expected_up: Duration,
) -> RuntimeState {
    if runtime_health == RuntimeHealthObservation::Healthy {
        return RuntimeState::Running;
    }
    if !run_tatolab {
        return RuntimeState::Stopped;
    }
    match runtime_agent {
        RuntimeAgentRegistrationStatus::NotRegistered
        | RuntimeAgentRegistrationStatus::NotFound
        | RuntimeAgentRegistrationStatus::RequiresApproval => RuntimeState::Stopped,
        RuntimeAgentRegistrationStatus::Enabled
            if time_since_the_runtime_was_expected_up < RUNTIME_STARTING_GRACE_PERIOD =>
        {
            RuntimeState::Starting
        }
        RuntimeAgentRegistrationStatus::Enabled => RuntimeState::Unreachable,
    }
}

/// Whether this round is the one the runtime turned unreachable in, after `previous_runtime_state`.
pub fn the_runtime_just_became_unreachable(
    previous_runtime_state: Option<RuntimeState>,
    runtime_state: RuntimeState,
) -> bool {
    runtime_state == RuntimeState::Unreachable
        && previous_runtime_state != Some(RuntimeState::Unreachable)
}

/// Whether this round is the one listing the runtime's streams started failing in.
pub fn the_stream_listing_just_started_failing(
    stream_listing_failed_last_round: bool,
    stream_listing_failed_this_round: bool,
) -> bool {
    stream_listing_failed_this_round && !stream_listing_failed_last_round
}

/// The tray's one-line status, the disabled first item of its menu.
pub fn tray_status_line(status: &TatolabStatus) -> String {
    match status.machine_setup_state {
        MachineSetupState::Complete => {}
        MachineSetupState::NeedsAdministrator => return "Setup unfinished".to_string(),
        MachineSetupState::WaitingForAdministrator => return "Setting up Tatolab…".to_string(),
    }
    if status.runtime_state != RuntimeState::Running
        && status.run_tatolab
        && status.runtime_agent == RuntimeAgentRegistrationStatus::RequiresApproval
    {
        return "Needs approval in Login Items".to_string();
    }
    match status.runtime_state {
        RuntimeState::Running => match status.streams.as_ref().map(Vec::len) {
            None => "Runtime running".to_string(),
            Some(1) => "Runtime running · 1 stream".to_string(),
            Some(stream_count) => format!("Runtime running · {stream_count} streams"),
        },
        RuntimeState::Starting => "Starting…".to_string(),
        RuntimeState::Stopped => "Runtime stopped".to_string(),
        RuntimeState::Unreachable => "Runtime not responding".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn listed_streams(stream_count: usize) -> Vec<ListedStream> {
        (0..stream_count)
            .map(|stream_index| ListedStream {
                name: format!("stream-{stream_index}"),
                state: "kept".to_string(),
                project_directory: format!("/projects/stream-{stream_index}"),
                node_count: Some(2),
                failed_because: None,
            })
            .collect()
    }

    fn status_with(
        runtime_state: RuntimeState,
        runtime_agent: RuntimeAgentRegistrationStatus,
        stream_count: Option<usize>,
    ) -> TatolabStatus {
        TatolabStatus {
            app_version: "0.45.0".to_string(),
            platform: TatolabPlatform::Macos,
            run_tatolab: true,
            runtime_agent,
            runtime_state,
            machine_name: None,
            streams: stream_count.map(listed_streams),
            machine_setup_state: MachineSetupState::Complete,
            command_line_tool_linked_at: None,
        }
    }

    #[test]
    fn a_healthy_runtime_is_running_whatever_the_switch_says() {
        for run_tatolab in [true, false] {
            let runtime_state = derive_runtime_state(
                run_tatolab,
                RuntimeAgentRegistrationStatus::NotRegistered,
                RuntimeHealthObservation::Healthy,
                Duration::from_secs(600),
            );
            assert_eq!(runtime_state, RuntimeState::Running);
        }
    }

    #[test]
    fn the_switch_off_or_an_unregistered_agent_is_stopped() {
        assert_eq!(
            derive_runtime_state(
                false,
                RuntimeAgentRegistrationStatus::Enabled,
                RuntimeHealthObservation::Failing,
                Duration::ZERO
            ),
            RuntimeState::Stopped
        );
        for runtime_agent in [
            RuntimeAgentRegistrationStatus::NotRegistered,
            RuntimeAgentRegistrationStatus::NotFound,
            RuntimeAgentRegistrationStatus::RequiresApproval,
        ] {
            assert_eq!(
                derive_runtime_state(
                    true,
                    runtime_agent,
                    RuntimeHealthObservation::Failing,
                    Duration::ZERO
                ),
                RuntimeState::Stopped,
                "{runtime_agent:?}"
            );
        }
    }

    #[test]
    fn an_enabled_agent_failing_health_is_starting_inside_the_grace_period_then_unreachable() {
        assert_eq!(
            derive_runtime_state(
                true,
                RuntimeAgentRegistrationStatus::Enabled,
                RuntimeHealthObservation::Failing,
                Duration::from_secs(19),
            ),
            RuntimeState::Starting
        );
        assert_eq!(
            derive_runtime_state(
                true,
                RuntimeAgentRegistrationStatus::Enabled,
                RuntimeHealthObservation::Failing,
                RUNTIME_STARTING_GRACE_PERIOD,
            ),
            RuntimeState::Unreachable
        );
    }

    #[test]
    fn the_runtime_becomes_unreachable_only_on_the_round_it_turns_unreachable() {
        for (previous_runtime_state, runtime_state, expected) in [
            (None, RuntimeState::Unreachable, true),
            (
                Some(RuntimeState::Starting),
                RuntimeState::Unreachable,
                true,
            ),
            (Some(RuntimeState::Running), RuntimeState::Unreachable, true),
            (
                Some(RuntimeState::Unreachable),
                RuntimeState::Unreachable,
                false,
            ),
            (
                Some(RuntimeState::Unreachable),
                RuntimeState::Starting,
                false,
            ),
            (None, RuntimeState::Stopped, false),
        ] {
            assert_eq!(
                the_runtime_just_became_unreachable(previous_runtime_state, runtime_state),
                expected,
                "{previous_runtime_state:?} -> {runtime_state:?}"
            );
        }
    }

    #[test]
    fn the_stream_listing_failure_is_new_only_on_the_round_it_starts_failing() {
        for (stream_listing_failed_last_round, stream_listing_failed_this_round, expected) in [
            (false, true, true),
            (true, true, false),
            (true, false, false),
            (false, false, false),
        ] {
            assert_eq!(
                the_stream_listing_just_started_failing(
                    stream_listing_failed_last_round,
                    stream_listing_failed_this_round
                ),
                expected,
                "{stream_listing_failed_last_round} -> {stream_listing_failed_this_round}"
            );
        }
    }

    #[test]
    fn machine_setup_waits_for_the_administrator_only_while_the_prompt_shows() {
        for (machine_setup_pieces_missing, administrator_prompt_showing, expected) in [
            (false, false, MachineSetupState::Complete),
            (false, true, MachineSetupState::Complete),
            (true, true, MachineSetupState::WaitingForAdministrator),
            (true, false, MachineSetupState::NeedsAdministrator),
        ] {
            assert_eq!(
                MachineSetupState::from_observation(
                    machine_setup_pieces_missing,
                    administrator_prompt_showing
                ),
                expected
            );
        }
    }

    #[test]
    fn the_tray_line_says_setup_is_unfinished_until_the_administrator_prompt_succeeds() {
        let mut status = status_with(
            RuntimeState::Stopped,
            RuntimeAgentRegistrationStatus::NotRegistered,
            None,
        );
        status.machine_setup_state = MachineSetupState::WaitingForAdministrator;
        assert_eq!(tray_status_line(&status), "Setting up Tatolab…");
        status.machine_setup_state = MachineSetupState::NeedsAdministrator;
        assert_eq!(tray_status_line(&status), "Setup unfinished");
    }

    #[test]
    fn the_tray_line_names_the_runtime_state_and_stream_count() {
        let running = |stream_count| {
            tray_status_line(&status_with(
                RuntimeState::Running,
                RuntimeAgentRegistrationStatus::Enabled,
                stream_count,
            ))
        };
        assert_eq!(running(Some(3)), "Runtime running · 3 streams");
        assert_eq!(running(Some(1)), "Runtime running · 1 stream");
        assert_eq!(running(Some(0)), "Runtime running · 0 streams");
        assert_eq!(running(None), "Runtime running");
        assert_eq!(
            tray_status_line(&status_with(
                RuntimeState::Stopped,
                RuntimeAgentRegistrationStatus::NotRegistered,
                None
            )),
            "Runtime stopped"
        );
        assert_eq!(
            tray_status_line(&status_with(
                RuntimeState::Starting,
                RuntimeAgentRegistrationStatus::Enabled,
                None
            )),
            "Starting…"
        );
        assert_eq!(
            tray_status_line(&status_with(
                RuntimeState::Stopped,
                RuntimeAgentRegistrationStatus::RequiresApproval,
                None
            )),
            "Needs approval in Login Items"
        );
    }
}
