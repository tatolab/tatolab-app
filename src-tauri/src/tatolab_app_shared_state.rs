// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! What the tray, the window's commands and the app's events reach once the app is set up: the
//! controller and the status publisher, and the requests the tray and the window both make.

use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::named_app_thread::spawn_named_app_thread;
use crate::tatolab_app_controller::TatolabAppController;
use crate::tatolab_status_publisher::TatolabStatusPublisher;

/// The controller and the status publisher, managed as the app's Tauri state.
pub struct TatolabAppSharedState {
    pub controller: Arc<TatolabAppController>,
    pub status_publisher: Arc<TatolabStatusPublisher>,
}

/// Run `work` on its own thread named `thread_name`: it may block on the service manager, the
/// filesystem, the local API or the administrator prompt.
pub fn run_off_the_main_thread_with_the_controller(
    app: &AppHandle,
    thread_name: &str,
    work: impl FnOnce(&TatolabAppController, &TatolabStatusPublisher) + Send + 'static,
) {
    let Some(shared_state) = app.try_state::<TatolabAppSharedState>() else {
        tracing::error!(
            thread_name,
            "the app's controller is not set up yet; nothing was run"
        );
        return;
    };
    let controller = Arc::clone(&shared_state.controller);
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    spawn_named_app_thread(thread_name, move || work(&controller, &status_publisher));
}

/// "Set Up Tatolab…" from the tray or the window: the administrator prompt for whatever machine
/// setup is missing, then a status round; refused at once where the platform has no machine setup.
pub fn set_up_tatolab_on_request(app: &AppHandle) -> Result<(), String> {
    let set_up_tatolab_refusal = app
        .try_state::<TatolabAppSharedState>()
        .and_then(|shared_state| shared_state.controller.set_up_tatolab_refusal());
    if let Some(refusal) = set_up_tatolab_refusal {
        return Err(refusal.to_string());
    }
    run_off_the_main_thread_with_the_controller(
        app,
        "tatolab-set-up-tatolab",
        |controller, status_publisher| {
            controller.set_up_the_machine_on_request();
            status_publisher.request_refresh();
        },
    );
    Ok(())
}

/// Quit the app from the tray or the window. The runtime is the service manager's, and keeps
/// running.
pub fn quit_the_tatolab_app(app: &AppHandle) {
    tracing::info!("quitting the Tatolab app; the runtime keeps running");
    app.exit(0);
}
