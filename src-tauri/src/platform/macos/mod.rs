// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! macOS: Service Management registers the runtime's launch agent, first-launch setup creates the
//! machine runtime lock and the CLI's PATH link behind one administrator prompt, "Uninstall
//! Tatolab…" removes them behind another, the window draws under an overlay title bar with the
//! Dock icon following it, and the tray's mark is a template image.

mod administrator_prompt;
mod machine_setup;
mod main_window_chrome;
mod service_management_runtime_launch_agent;
mod tatolab_machine_paths;
mod tatolab_uninstall;

use tauri::{AppHandle, RunEvent, Wry};

use self::machine_setup::MachineSetupBehindAnAdministratorPrompt;
use self::service_management_runtime_launch_agent::ServiceManagementRuntimeLaunchAgent;
use self::tatolab_machine_paths::{bundled_command_line_tool_path, TatolabMachinePathsOnMacos};
use crate::platform::{current_process_uid, TatolabPlatformForThisBuild, TrayIconImage};

pub use self::main_window_chrome::{set_dock_icon_visible, with_the_main_window_chrome};
pub use self::tatolab_uninstall::uninstall_tatolab;

/// The tray's mark at 36×36, shown at 18pt in the menu bar and tinted to it as a template image.
pub const TRAY_ICON_IMAGE: TrayIconImage = TrayIconImage {
    png_bytes: include_bytes!("../../../icons/tray-template@2x.png"),
    is_a_template: true,
};

/// The bundle's launch agent, and the machine setup this build's paths need.
pub fn tatolab_platform_for_this_build() -> TatolabPlatformForThisBuild {
    let machine_paths = TatolabMachinePathsOnMacos::for_this_build(current_process_uid());
    let bundled_command_line_tool = bundled_command_line_tool_path();
    tracing::info!(
        local_api_socket = %machine_paths.local_api_socket.display(),
        machine_runtime_lock = %machine_paths.machine_runtime_lock_file.display(),
        bundled_command_line_tool = ?bundled_command_line_tool,
        local_proof_test_machine_root = ?machine_paths.local_proof_test_machine_root,
        "Tatolab app paths"
    );
    TatolabPlatformForThisBuild {
        runtime_agent: Box::new(ServiceManagementRuntimeLaunchAgent::for_the_bundled_runtime()),
        local_api_socket: machine_paths.local_api_socket.clone(),
        machine_setup: Box::new(MachineSetupBehindAnAdministratorPrompt::new(
            machine_paths,
            bundled_command_line_tool,
        )),
    }
}

/// `app_builder` calling `on_the_app_opened_again` on the main thread whenever the user opens the
/// running app again from the Dock or Finder, which LaunchServices hands the running app as a
/// reopen rather than starting a second one.
pub fn with_the_app_opened_again_handler(
    app_builder: tauri::Builder<Wry>,
    on_the_app_opened_again: fn(&AppHandle),
) -> tauri::Builder<Wry> {
    let reopen_listener = tauri::plugin::Builder::<Wry>::new("tatolab-app-opened-again")
        .on_event(move |app, run_event| {
            if matches!(run_event, RunEvent::Reopen { .. }) {
                on_the_app_opened_again(app);
            }
        })
        .try_build();
    match reopen_listener {
        Ok(reopen_listener) => app_builder.plugin(reopen_listener),
        Err(failure) => {
            tracing::error!(
                %failure,
                "opening Tatolab again from the Dock or Finder will not show its window"
            );
            app_builder
        }
    }
}
