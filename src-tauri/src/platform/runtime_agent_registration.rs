// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The seam between the "Run Tatolab" decision and the platform's service manager that runs the
//! runtime as the user's agent: Service Management's `SMAppService` launch agent on macOS, the
//! installer's systemd user unit on Linux.

use crate::tatolab_status::RuntimeAgentRegistrationStatus;

/// Why the service manager did not start the registered agent's runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeAgentStartFailure {
    /// The agent reads as registered but the service manager holds no job for it — launchd after
    /// `brew uninstall` or `launchctl bootout` removed the job and left Service Management's record.
    /// Registering it again restores the job.
    NoJobForTheRegisteredAgent,
    /// Any other refusal, in the service manager's words.
    Refused(String),
}

/// Registers and unregisters the agent that runs the machine's `tatolabd`.
pub trait RuntimeAgentRegistration: Send + Sync {
    /// What the service manager says about the agent now.
    fn registration_status(&self) -> RuntimeAgentRegistrationStatus;

    /// Register the agent so the service manager starts the runtime now and at every login.
    fn register_runtime_agent(&self) -> Result<(), String>;

    /// Start the registered agent's runtime unless it is already running. Service Management
    /// loads a newly registered agent but launchd may defer its first start, and systemd stops
    /// restarting a runtime that crashed past its start limit.
    fn start_runtime_agent_if_not_running(&self) -> Result<(), RuntimeAgentStartFailure>;

    /// Unregister the agent, which stops the runtime and keeps it from starting at login.
    fn unregister_runtime_agent(&self) -> Result<(), String>;

    /// Open System Settings at Login Items, where a user approves the agent; refused where the
    /// platform has no approval step.
    fn open_login_items_settings(&self) -> Result<(), String>;
}
