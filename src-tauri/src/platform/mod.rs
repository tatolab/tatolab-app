// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Everything that differs by platform: the service manager that runs the runtime, the machine's
//! paths and setup, uninstalling, and the window's and the tray's platform looks. Each platform
//! module exposes the same items with the same signatures, re-exported here, so the rest of the app
//! calls them with no `cfg`; where a platform has nothing to do for one — Linux has no Dock icon —
//! that item's doc says so. macOS registers the runtime with Service Management and sets the
//! machine up behind one administrator prompt; Linux drives the systemd user service its installer
//! registered.

mod runtime_agent_registration;
mod tatolab_machine_setup;

#[cfg(target_os = "macos")]
mod macos;

// Compiled on macOS too, for its tests: nothing in it needs Linux to build.
#[cfg(any(target_os = "linux", test))]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod linux;

use std::path::{Path, PathBuf};

use crate::tatolab_status::TatolabPlatform;

pub use runtime_agent_registration::RuntimeAgentRegistration;
pub use tatolab_machine_setup::{
    MachineSetupAdministratorPromptOutcome, MachineSetupObservation, MachineSetupTrigger,
    TatolabMachineSetup,
};

#[cfg(target_os = "linux")]
pub use linux::{
    set_dock_icon_visible, tatolab_platform_for_this_build, uninstall_tatolab,
    with_the_app_opened_again_handler, with_the_main_window_chrome, TRAY_ICON_IMAGE,
};
#[cfg(target_os = "macos")]
pub use macos::{
    set_dock_icon_visible, tatolab_platform_for_this_build, uninstall_tatolab,
    with_the_app_opened_again_handler, with_the_main_window_chrome, TRAY_ICON_IMAGE,
};

/// The platform this build runs on, as the status names it.
pub const THIS_PLATFORM: TatolabPlatform = if cfg!(target_os = "macos") {
    TatolabPlatform::Macos
} else {
    TatolabPlatform::Linux
};

/// The root a local-proof build keeps every machine directory under, which the runtime it talks
/// to reads as `TATOLAB_TEST_MACHINE_ROOT`; on macOS the bundled agent plist hands it over.
pub const LOCAL_PROOF_TEST_MACHINE_ROOT: &str = "/tmp/tatolab-proof";

/// The local API socket's file name inside the runtime directory, as StreamLib's
/// `streamlib_runtime_directory.rs` names it.
pub const LOCAL_API_SOCKET_FILE_NAME: &str = "local-api.sock";

/// The shared temporary directory the per-user runtime directory sits in.
const SHARED_TEMPORARY_DIRECTORY: &str = "/tmp";

/// `/tmp/streamlib-<uid>`: the runtime directory on macOS, and on Linux when `$XDG_RUNTIME_DIR` is
/// unset or empty, as StreamLib's `streamlib_runtime_directory.rs` resolves it.
pub fn per_user_streamlib_runtime_directory_under_tmp(uid: u32) -> PathBuf {
    Path::new(SHARED_TEMPORARY_DIRECTORY).join(format!("streamlib-{uid}"))
}

/// `<test_machine_root>/run/local-api.sock`: where a local-proof build's runtime serves its local
/// API, as StreamLib's `machine_directories_test_root.rs` lays the test root out.
pub fn local_api_socket_under_a_local_proof_test_root(test_machine_root: &Path) -> PathBuf {
    test_machine_root
        .join("run")
        .join(LOCAL_API_SOCKET_FILE_NAME)
}

/// What this build's platform hands the app's controller.
pub struct TatolabPlatformForThisBuild {
    pub runtime_agent: Box<dyn RuntimeAgentRegistration>,
    pub machine_setup: Box<dyn TatolabMachineSetup>,
    pub local_api_socket: PathBuf,
}

/// The tray's icon as this platform shows it.
pub struct TrayIconImage {
    pub png_bytes: &'static [u8],
    /// Whether the system tints it to the menu bar's appearance, as macOS does a template image.
    pub is_a_template: bool,
}

/// The real uid of this process.
pub fn current_process_uid() -> u32 {
    // SAFETY: getuid takes no arguments, cannot fail and touches no memory.
    unsafe { libc::getuid() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_local_api_socket_sits_where_the_runtime_serves_it() {
        assert_eq!(
            per_user_streamlib_runtime_directory_under_tmp(501).join(LOCAL_API_SOCKET_FILE_NAME),
            PathBuf::from("/tmp/streamlib-501/local-api.sock")
        );
        assert_eq!(
            local_api_socket_under_a_local_proof_test_root(Path::new("/tmp/tatolab-proof")),
            PathBuf::from("/tmp/tatolab-proof/run/local-api.sock")
        );
    }
}
