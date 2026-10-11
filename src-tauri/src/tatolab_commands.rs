// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The commands the frontend invokes. Each one that observes or changes the machine runs on a
//! blocking task, never on the main thread, and answers the fresh [`TatolabStatus`].

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::run_tatolab_switch::RunTatolabReconciliation;
use crate::tatolab_app_controller::TatolabAppController;
use crate::tatolab_status::TatolabStatus;
use crate::tatolab_status_publisher::TatolabStatusPublisher;

/// What every command reaches: the controller and the status publisher.
pub struct TatolabAppSharedState {
    pub controller: Arc<TatolabAppController>,
    pub status_publisher: Arc<TatolabStatusPublisher>,
}

async fn on_a_blocking_task<Answer: Send + 'static>(
    blocking_work: impl FnOnce() -> Result<Answer, String> + Send + 'static,
) -> Result<Answer, String> {
    tauri::async_runtime::spawn_blocking(blocking_work)
        .await
        .map_err(|join_failure| format!("the command did not finish: {join_failure}"))?
}

/// The status as of now.
#[tauri::command]
pub async fn get_tatolab_status(
    app: AppHandle,
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<TatolabStatus, String> {
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    on_a_blocking_task(move || Ok(status_publisher.refresh_and_publish(&app))).await
}

/// Turn "Run Tatolab" on (register the agent) or off (unregister it, stopping the runtime), and
/// remember it.
#[tauri::command]
pub async fn set_run_tatolab(
    app: AppHandle,
    shared_state: State<'_, TatolabAppSharedState>,
    enabled: bool,
) -> Result<TatolabStatus, String> {
    let controller = Arc::clone(&shared_state.controller);
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    on_a_blocking_task(move || {
        let reconciliation = controller.set_run_tatolab(enabled);
        let status = status_publisher.refresh_and_publish(&app);
        match reconciliation {
            RunTatolabReconciliation::UnregistrationFailed {
                failure_description,
            } => Err(format!(
                "the runtime could not be stopped: {failure_description}"
            )),
            _ => Ok(status),
        }
    })
    .await
}

/// Open System Settings at Login Items, where the runtime's login item is approved.
#[tauri::command]
pub async fn open_login_items_settings(
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<(), String> {
    let controller = Arc::clone(&shared_state.controller);
    on_a_blocking_task(move || {
        controller.open_login_items_settings();
        Ok(())
    })
    .await
}

/// Create the machine runtime lock and the CLI link behind the one administrator prompt, then
/// start the runtime if "Run Tatolab" is on.
#[tauri::command]
pub async fn run_first_launch_machine_setup(
    app: AppHandle,
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<TatolabStatus, String> {
    let controller = Arc::clone(&shared_state.controller);
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    on_a_blocking_task(move || {
        let setup = controller.run_first_launch_machine_setup();
        let status = status_publisher.refresh_and_publish(&app);
        setup.map(|()| status)
    })
    .await
}

/// Quit the app. The runtime is the launch agent's, and keeps running.
#[tauri::command]
pub fn quit_tatolab_app(app: AppHandle) {
    tracing::info!("quitting the Tatolab app; the runtime keeps running");
    app.exit(0);
}
