// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The status the tray shows, and the pure rules that derive the runtime's state from what the
//! poller observed.

use std::time::Duration;

use serde::Deserialize;

/// How long an enabled runtime may fail its health check before it reads unreachable rather
/// than starting.
pub const RUNTIME_STARTING_GRACE_PERIOD: Duration = Duration::from_secs(20);

/// Everything the app knows about Tatolab on this machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TatolabStatus {
    pub run_tatolab: bool,
    pub runtime_agent: RuntimeAgentRegistrationStatus,
    pub runtime: RuntimeStatus,
    pub streams: Vec<ListedStream>,
    pub machine_setup_state: MachineSetupState,
}

/// What launchd's Service Management says about the runtime's launch agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeAgentRegistrationStatus {
    Enabled,
    RequiresApproval,
    NotRegistered,
    NotFound,
}

/// The runtime's state and, when it is not plainly running or stopped, why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeStatus {
    pub state: RuntimeState,
    pub detail: Option<String>,
}

/// Whether the runtime answers its local API.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeState {
    Running,
    Starting,
    Stopped,
    Unreachable,
}

/// One stream the runtime holds, as its `list_streams` tool lists it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ListedStream {
    pub name: String,
    pub state: ListedStreamState,
    pub project_directory: String,
    pub node_count: Option<u64>,
    pub failed_because: Option<String>,
}

/// The state of one listed stream, spelled as the runtime's wire spells it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ListedStreamState {
    Attached,
    Kept,
    Stopped,
    Failed,
}

/// Whether first-launch machine setup still needs the administrator prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeHealthObservation {
    Healthy,
    Failing { failure_description: String },
}

/// The runtime's state from the switch, the agent's registration, the health check, and how
/// long the runtime has had to come up since it was last registered, launched or healthy.
pub fn derive_runtime_status(
    run_tatolab: bool,
    runtime_agent: RuntimeAgentRegistrationStatus,
    runtime_health: &RuntimeHealthObservation,
    time_since_the_runtime_was_expected_up: Duration,
) -> RuntimeStatus {
    let failure_description = match runtime_health {
        RuntimeHealthObservation::Healthy => {
            return RuntimeStatus {
                state: RuntimeState::Running,
                detail: None,
            };
        }
        RuntimeHealthObservation::Failing {
            failure_description,
        } => failure_description,
    };
    if !run_tatolab {
        return RuntimeStatus {
            state: RuntimeState::Stopped,
            detail: None,
        };
    }
    match runtime_agent {
        RuntimeAgentRegistrationStatus::NotRegistered
        | RuntimeAgentRegistrationStatus::NotFound => RuntimeStatus {
            state: RuntimeState::Stopped,
            detail: None,
        },
        RuntimeAgentRegistrationStatus::RequiresApproval => RuntimeStatus {
            state: RuntimeState::Stopped,
            detail: Some(
                "the runtime's login item needs approval in System Settings > Login Items"
                    .to_string(),
            ),
        },
        RuntimeAgentRegistrationStatus::Enabled
            if time_since_the_runtime_was_expected_up < RUNTIME_STARTING_GRACE_PERIOD =>
        {
            RuntimeStatus {
                state: RuntimeState::Starting,
                detail: None,
            }
        }
        RuntimeAgentRegistrationStatus::Enabled => RuntimeStatus {
            state: RuntimeState::Unreachable,
            detail: Some(failure_description.clone()),
        },
    }
}

/// The tray's one-line status, the disabled first item of its menu.
pub fn tray_status_line(status: &TatolabStatus) -> String {
    match status.machine_setup_state {
        MachineSetupState::Complete => {}
        MachineSetupState::NeedsAdministrator => return "Setup unfinished".to_string(),
        MachineSetupState::WaitingForAdministrator => return "Setting up Tatolab…".to_string(),
    }
    if status.runtime.state != RuntimeState::Running
        && status.run_tatolab
        && status.runtime_agent == RuntimeAgentRegistrationStatus::RequiresApproval
    {
        return "Needs approval in Login Items".to_string();
    }
    match status.runtime.state {
        RuntimeState::Running => match status.streams.len() {
            1 => "Runtime running · 1 stream".to_string(),
            stream_count => format!("Runtime running · {stream_count} streams"),
        },
        RuntimeState::Starting => "Starting…".to_string(),
        RuntimeState::Stopped => "Runtime stopped".to_string(),
        RuntimeState::Unreachable => "Runtime not responding".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failing() -> RuntimeHealthObservation {
        RuntimeHealthObservation::Failing {
            failure_description: "no runtime answers at /tmp/streamlib-501/local-api.sock".into(),
        }
    }

    fn status_with(
        runtime_state: RuntimeState,
        runtime_agent: RuntimeAgentRegistrationStatus,
        stream_count: usize,
    ) -> TatolabStatus {
        TatolabStatus {
            run_tatolab: true,
            runtime_agent,
            runtime: RuntimeStatus {
                state: runtime_state,
                detail: None,
            },
            streams: (0..stream_count)
                .map(|index| ListedStream {
                    name: format!("stream-{index}"),
                    state: ListedStreamState::Kept,
                    project_directory: "/p".into(),
                    node_count: Some(2),
                    failed_because: None,
                })
                .collect(),
            machine_setup_state: MachineSetupState::Complete,
        }
    }

    #[test]
    fn a_healthy_runtime_is_running_whatever_the_switch_says() {
        for run_tatolab in [true, false] {
            let status = derive_runtime_status(
                run_tatolab,
                RuntimeAgentRegistrationStatus::NotRegistered,
                &RuntimeHealthObservation::Healthy,
                Duration::from_secs(600),
            );
            assert_eq!(status.state, RuntimeState::Running);
        }
    }

    #[test]
    fn the_switch_off_or_an_unregistered_agent_is_stopped() {
        assert_eq!(
            derive_runtime_status(
                false,
                RuntimeAgentRegistrationStatus::Enabled,
                &failing(),
                Duration::ZERO
            )
            .state,
            RuntimeState::Stopped
        );
        for runtime_agent in [
            RuntimeAgentRegistrationStatus::NotRegistered,
            RuntimeAgentRegistrationStatus::NotFound,
            RuntimeAgentRegistrationStatus::RequiresApproval,
        ] {
            assert_eq!(
                derive_runtime_status(true, runtime_agent, &failing(), Duration::ZERO).state,
                RuntimeState::Stopped,
                "{runtime_agent:?}"
            );
        }
    }

    #[test]
    fn an_enabled_agent_failing_health_is_starting_inside_the_grace_period_then_unreachable() {
        let starting = derive_runtime_status(
            true,
            RuntimeAgentRegistrationStatus::Enabled,
            &failing(),
            Duration::from_secs(19),
        );
        assert_eq!(starting.state, RuntimeState::Starting);

        let unreachable = derive_runtime_status(
            true,
            RuntimeAgentRegistrationStatus::Enabled,
            &failing(),
            RUNTIME_STARTING_GRACE_PERIOD,
        );
        assert_eq!(unreachable.state, RuntimeState::Unreachable);
        assert!(unreachable
            .detail
            .unwrap()
            .contains("/tmp/streamlib-501/local-api.sock"));
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
            0,
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
        assert_eq!(running(3), "Runtime running · 3 streams");
        assert_eq!(running(1), "Runtime running · 1 stream");
        assert_eq!(running(0), "Runtime running · 0 streams");
        assert_eq!(
            tray_status_line(&status_with(
                RuntimeState::Stopped,
                RuntimeAgentRegistrationStatus::NotRegistered,
                0
            )),
            "Runtime stopped"
        );
        assert_eq!(
            tray_status_line(&status_with(
                RuntimeState::Starting,
                RuntimeAgentRegistrationStatus::Enabled,
                0
            )),
            "Starting…"
        );
        assert_eq!(
            tray_status_line(&status_with(
                RuntimeState::Stopped,
                RuntimeAgentRegistrationStatus::RequiresApproval,
                0
            )),
            "Needs approval in Login Items"
        );
    }
}
