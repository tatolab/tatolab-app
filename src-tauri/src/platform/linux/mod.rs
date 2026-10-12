// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Linux: the window and tray over the systemd user service the installer registers. The runtime,
//! its service and the CLI come only from the installer, so this app installs nothing, sets
//! nothing up and uninstalls nothing; "Run Tatolab" enables and disables the service. The window
//! keeps the desktop's own title bar, and the tray's mark keeps its colours.

mod machine_set_up_by_the_installer;
mod systemd_user_runtime_service;
mod tatolab_machine_paths;

use tauri::{AppHandle, Manager, RunEvent, Runtime, WebviewWindowBuilder};

use self::machine_set_up_by_the_installer::MachineSetUpByTheInstaller;
use self::systemd_user_runtime_service::{
    SystemctlOnThePath, SystemdUserRuntimeService, RUNTIME_SYSTEMD_USER_UNIT_NAME,
};
use self::tatolab_machine_paths::TatolabMachinePathsOnLinux;
use crate::platform::{current_process_uid, TatolabPlatformForThisBuild, TrayIconImage};
use crate::tatolab_app_controller::TatolabAppController;

/// How Tatolab is uninstalled on Linux, where its installer does it and this app removes nothing.
pub const LINUX_UNINSTALL_INSTRUCTIONS: &str = "On Linux the installer uninstalls Tatolab: run \
     `curl -fsSL https://get.tatolab.com/install.sh | sh -s -- --uninstall` in a terminal, which \
     removes the service and the files and keeps the state directory with your streams and logs. \
     Then remove this app: `sudo apt remove tatolab` for the .deb, or delete the AppImage.";

/// The Tatolab mark at 64×64 in its own colours, which a panel shows as they are.
pub const TRAY_ICON_IMAGE: TrayIconImage = TrayIconImage {
    png_bytes: include_bytes!("../../../icons/tray-coloured.png"),
    is_a_template: false,
};

/// The installer's systemd user unit, and the machine as the installer set it up.
pub fn tatolab_platform_for_this_build() -> TatolabPlatformForThisBuild {
    let machine_paths = TatolabMachinePathsOnLinux::for_this_build(current_process_uid());
    tracing::info!(
        local_api_socket = %machine_paths.local_api_socket.display(),
        command_line_tool_link = ?machine_paths.command_line_tool_link,
        local_proof_test_machine_root = ?machine_paths.local_proof_test_machine_root,
        runtime_systemd_user_unit = RUNTIME_SYSTEMD_USER_UNIT_NAME,
        "Tatolab app paths"
    );
    TatolabPlatformForThisBuild {
        runtime_agent: Box::new(SystemdUserRuntimeService::new(Box::new(SystemctlOnThePath))),
        machine_setup: Box::new(MachineSetUpByTheInstaller::new(
            machine_paths.command_line_tool_link,
        )),
        local_api_socket: machine_paths.local_api_socket,
    }
}

/// The desktop's own title bar and borders, which the window keeps.
pub fn with_the_main_window_chrome<'a, R: Runtime, M: Manager<R>>(
    main_window_builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    main_window_builder.decorations(true)
}

/// Linux sends a running app no event when it is opened again, so no run event is one.
pub fn the_app_was_opened_again(_run_event: &RunEvent) -> bool {
    false
}

/// Refused with [`LINUX_UNINSTALL_INSTRUCTIONS`]: the installer uninstalls what it installed.
pub fn uninstall_tatolab(
    _app: &AppHandle,
    _controller: &TatolabAppController,
) -> Result<(), String> {
    Err(LINUX_UNINSTALL_INSTRUCTIONS.to_string())
}
