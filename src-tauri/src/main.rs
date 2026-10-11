// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Tatolab.app: opening it starts the runtime as a launch agent, the "Run Tatolab" switch is that
//! same registration, and quitting quits only the app — the runtime stays on.

mod local_api_client;
#[cfg(target_os = "macos")]
mod macos;
mod run_tatolab_preference;
mod run_tatolab_switch;
mod runtime_launch_agent_registration;
mod tatolab_app_controller;
mod tatolab_commands;
mod tatolab_main_window;
mod tatolab_status;
mod tatolab_status_publisher;
mod tatolab_tray_menu;

use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Manager, RunEvent};

use crate::tatolab_app_controller::TatolabAppController;
use crate::tatolab_commands::TatolabAppSharedState;
use crate::tatolab_main_window::{create_main_window, show_main_window};
use crate::tatolab_status_publisher::TatolabStatusPublisher;
use crate::tatolab_tray_menu::{TatolabTrayMenu, TrayMenuChoice};

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let app_launched_at = Instant::now();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _working_directory| {
                show_main_window(app);
            },
        ))
        .invoke_handler(tauri::generate_handler![
            tatolab_commands::get_tatolab_status,
            tatolab_commands::set_run_tatolab,
            tatolab_commands::open_login_items_settings,
            tatolab_commands::run_first_launch_machine_setup,
            tatolab_commands::quit_tatolab_app,
        ])
        .setup(move |app| {
            let app_config_directory = app.path().app_config_dir()?;
            let controller = Arc::new(TatolabAppController::for_this_build(
                &app_config_directory,
                app_launched_at,
            ));
            let status_publisher = Arc::new(TatolabStatusPublisher::new(Arc::clone(&controller)));
            app.manage(TatolabAppSharedState {
                controller: Arc::clone(&controller),
                status_publisher: Arc::clone(&status_publisher),
            });

            create_main_window(app.handle())?;
            status_publisher.attach_tray_menu(TatolabTrayMenu::build(
                app.handle(),
                controller.run_tatolab(),
                on_tray_menu_choice,
            )?);
            let app_for_the_first_reconcile = app.handle().clone();
            std::thread::spawn(move || {
                controller.reconcile_on_app_opened();
                status_publisher.start_polling(app_for_the_first_reconcile);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|failure| {
            tracing::error!(%failure, "Tatolab could not start");
            std::process::exit(1);
        });

    app.run(|app, run_event| {
        if let RunEvent::Reopen { .. } = run_event {
            show_main_window(app);
            reconcile_run_tatolab_off_the_main_thread(app);
        }
    });
}

/// Opening the app registers the runtime's agent when "Run Tatolab" is on and the machine is set
/// up; that may block on Service Management, so it runs on its own thread.
fn reconcile_run_tatolab_off_the_main_thread(app: &AppHandle) {
    let shared_state = app.state::<TatolabAppSharedState>();
    let controller = Arc::clone(&shared_state.controller);
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    std::thread::spawn(move || {
        controller.reconcile_on_app_opened();
        status_publisher.request_refresh();
    });
}

fn on_tray_menu_choice(app: &AppHandle, choice: TrayMenuChoice) {
    match choice {
        TrayMenuChoice::OpenMainWindow => show_main_window(app),
        TrayMenuChoice::ToggleRunTatolabSwitch => {
            let shared_state = app.state::<TatolabAppSharedState>();
            let controller = Arc::clone(&shared_state.controller);
            let status_publisher = Arc::clone(&shared_state.status_publisher);
            let app = app.clone();
            std::thread::spawn(move || {
                controller.set_run_tatolab(!controller.run_tatolab());
                status_publisher.refresh_and_publish(&app);
            });
        }
        TrayMenuChoice::QuitTheApp => {
            tracing::info!("quitting the Tatolab app from the tray; the runtime keeps running");
            app.exit(0);
        }
    }
}
