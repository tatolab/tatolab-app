// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The runtime's launch agent registered through Service Management's `SMAppService`, from the
//! plist the bundle carries in `Contents/Library/LaunchAgents/`.

use std::process::Command;

use objc2_foundation::NSString;
use objc2_service_management::{SMAppService, SMAppServiceStatus};

use crate::macos::tatolab_machine_paths::current_process_uid;
use crate::runtime_launch_agent_registration::RuntimeLaunchAgentRegistration;
use crate::tatolab_status::RuntimeAgentRegistrationStatus;

/// The agent plist's file name inside the bundle's `Contents/Library/LaunchAgents/`.
pub const RUNTIME_LAUNCH_AGENT_PLIST_NAME: &str = "com.tatolab.tatolabd.plist";

/// The agent plist's `Label`, which names the job in the user's launchd domain.
pub const RUNTIME_LAUNCH_AGENT_LABEL: &str = "com.tatolab.tatolabd";

/// The runtime's launch agent as `SMAppService` sees it.
#[derive(Debug, Clone)]
pub struct ServiceManagementRuntimeLaunchAgent {
    agent_plist_name: String,
}

impl ServiceManagementRuntimeLaunchAgent {
    /// The agent the bundle's [`RUNTIME_LAUNCH_AGENT_PLIST_NAME`] describes.
    pub fn for_the_bundled_runtime() -> Self {
        Self {
            agent_plist_name: RUNTIME_LAUNCH_AGENT_PLIST_NAME.to_string(),
        }
    }

    // An `SMAppService` is not `Send`; looking it up per call keeps this type shareable across
    // the poller thread and command handlers, and the lookup is cheap.
    fn service(&self) -> objc2::rc::Retained<SMAppService> {
        let agent_plist_name = NSString::from_str(&self.agent_plist_name);
        // SAFETY: `agentServiceWithPlistName:` takes any plist name and returns a service object;
        // an unknown name surfaces as `SMAppServiceStatusNotFound`, never as undefined behaviour.
        unsafe { SMAppService::agentServiceWithPlistName(&agent_plist_name) }
    }
}

impl RuntimeLaunchAgentRegistration for ServiceManagementRuntimeLaunchAgent {
    fn registration_status(&self) -> RuntimeAgentRegistrationStatus {
        // SAFETY: `status` reads the service's registration and has no preconditions.
        let status = unsafe { self.service().status() };
        runtime_agent_registration_status_from(status)
    }

    fn register_runtime_launch_agent(&self) -> Result<(), String> {
        // SAFETY: `registerAndReturnError:` has no preconditions; failure comes back as an NSError.
        unsafe { self.service().registerAndReturnError() }
            .map_err(|error| error.localizedDescription().to_string())
    }

    fn start_runtime_launch_agent_if_not_running(&self) -> Result<(), String> {
        // Without `-k`, kickstart leaves a running job alone.
        let launchd_job = format!("gui/{}/{RUNTIME_LAUNCH_AGENT_LABEL}", current_process_uid());
        let kickstart = Command::new("/bin/launchctl")
            .args(["kickstart", &launchd_job])
            .output()
            .map_err(|failure| format!("launchctl could not be run: {failure}"))?;
        if kickstart.status.success() {
            return Ok(());
        }
        Err(format!(
            "launchctl kickstart {launchd_job} failed ({}): {}",
            kickstart.status,
            String::from_utf8_lossy(&kickstart.stderr).trim()
        ))
    }

    fn unregister_runtime_launch_agent(&self) -> Result<(), String> {
        // SAFETY: `unregisterAndReturnError:` has no preconditions; failure comes back as an NSError.
        unsafe { self.service().unregisterAndReturnError() }
            .map_err(|error| error.localizedDescription().to_string())
    }

    fn open_login_items_settings(&self) {
        // SAFETY: `openSystemSettingsLoginItems` is a class method with no arguments or preconditions.
        unsafe { SMAppService::openSystemSettingsLoginItems() }
    }
}

fn runtime_agent_registration_status_from(
    status: SMAppServiceStatus,
) -> RuntimeAgentRegistrationStatus {
    match status {
        SMAppServiceStatus::Enabled => RuntimeAgentRegistrationStatus::Enabled,
        SMAppServiceStatus::RequiresApproval => RuntimeAgentRegistrationStatus::RequiresApproval,
        SMAppServiceStatus::NotRegistered => RuntimeAgentRegistrationStatus::NotRegistered,
        _ => RuntimeAgentRegistrationStatus::NotFound,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_service_management_status_maps_to_the_contract_spelling() {
        for (status, expected) in [
            (
                SMAppServiceStatus::Enabled,
                RuntimeAgentRegistrationStatus::Enabled,
            ),
            (
                SMAppServiceStatus::RequiresApproval,
                RuntimeAgentRegistrationStatus::RequiresApproval,
            ),
            (
                SMAppServiceStatus::NotRegistered,
                RuntimeAgentRegistrationStatus::NotRegistered,
            ),
            (
                SMAppServiceStatus::NotFound,
                RuntimeAgentRegistrationStatus::NotFound,
            ),
        ] {
            assert_eq!(runtime_agent_registration_status_from(status), expected);
        }
    }

    #[test]
    fn an_unbundled_test_binary_finds_no_agent_plist() {
        assert_eq!(
            ServiceManagementRuntimeLaunchAgent::for_the_bundled_runtime().registration_status(),
            RuntimeAgentRegistrationStatus::NotFound
        );
    }
}
