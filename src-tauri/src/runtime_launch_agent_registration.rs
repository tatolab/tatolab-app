// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The seam between the "Run Tatolab" decision and the platform's service manager that registers
//! the runtime's launch agent: Service Management's `SMAppService` on macOS.

use crate::tatolab_status::RuntimeAgentRegistrationStatus;

/// Registers and unregisters the launch agent that runs the bundle's `tatolabd`.
pub trait RuntimeLaunchAgentRegistration: Send + Sync {
    /// What the service manager says about the agent now.
    fn registration_status(&self) -> RuntimeAgentRegistrationStatus;

    /// Register the agent so the service manager starts the runtime now and at every login.
    fn register_runtime_launch_agent(&self) -> Result<(), String>;

    /// Unregister the agent, which stops the runtime and keeps it from starting at login.
    fn unregister_runtime_launch_agent(&self) -> Result<(), String>;

    /// Open System Settings at Login Items, where a user approves the agent.
    fn open_login_items_settings(&self);
}
