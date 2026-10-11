// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The commands the window's frontend invokes. A request that changes the machine runs on its own
//! named thread, as the tray's choices do, and its outcome reaches the window as the next
//! `tatolab-status-changed`. A question the window awaits is answered from a named thread too, so
//! neither the main thread nor the async runtime ever blocks on the runtime or the service manager.

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, State};

use crate::named_app_thread::spawn_named_app_thread;
use crate::tatolab_app_shared_state::{
    quit_the_tatolab_app, run_off_the_main_thread_with_the_controller, set_up_tatolab_on_request,
    TatolabAppSharedState,
};
use crate::tatolab_status::TatolabStatus;

/// How long `get_tatolab_status` waits for the poller's first round when the window asks first.
const FIRST_STATUS_ROUND_WAIT_LIMIT: Duration = Duration::from_secs(15);

/// `blocking_work`'s answer, worked out on its own thread named `thread_name`.
async fn answer_from_a_named_app_thread<Answer: Send + 'static>(
    thread_name: &str,
    blocking_work: impl FnOnce() -> Result<Answer, String> + Send + 'static,
) -> Result<Answer, String> {
    let (answer_sender, mut answer_receiver) = tauri::async_runtime::channel(1);
    spawn_named_app_thread(thread_name, move || {
        let _the_window_stopped_waiting = answer_sender.blocking_send(blocking_work());
    });
    answer_receiver
        .recv()
        .await
        .unwrap_or_else(|| Err(format!("{thread_name} ended without an answer")))
}

/// The status as of the poller's last round.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_tatolab_status(
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<TatolabStatus, String> {
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    answer_from_a_named_app_thread("tatolab-get-tatolab-status", move || {
        status_publisher
            .last_published_status_waiting_up_to(FIRST_STATUS_ROUND_WAIT_LIMIT)
            .ok_or_else(|| "Tatolab has not observed the runtime yet".to_string())
    })
    .await
}

/// Turn "Run Tatolab" on or off.
#[tauri::command(rename_all = "snake_case")]
pub fn set_run_tatolab(app: AppHandle, enabled: bool) {
    run_off_the_main_thread_with_the_controller(
        &app,
        "tatolab-run-tatolab-set",
        move |controller, status_publisher| {
            controller.set_run_tatolab(enabled);
            status_publisher.request_refresh();
        },
    );
}

/// Open System Settings at Login Items, where a user approves the runtime's login item.
#[tauri::command(rename_all = "snake_case")]
pub fn open_login_items_settings(app: AppHandle) {
    run_off_the_main_thread_with_the_controller(
        &app,
        "tatolab-open-login-items-settings",
        |controller, _status_publisher| controller.open_login_items_settings(),
    );
}

/// "Set Up Tatolab…": the one administrator prompt, as the tray's item shows it.
#[tauri::command(rename_all = "snake_case")]
pub fn set_up_tatolab(app: AppHandle) {
    set_up_tatolab_on_request(&app);
}

/// Quit the app; the runtime keeps running.
#[tauri::command(rename_all = "snake_case")]
pub fn quit_tatolab_app(app: AppHandle) {
    quit_the_tatolab_app(&app);
}
