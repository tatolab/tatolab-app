// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Tatolab.app: opening it starts the runtime as the user's agent — a launch agent on macOS, the
//! installer's systemd user service on Linux — and shows its window, the "Run Tatolab" switch is
//! that same registration, closing the window leaves the app in the tray, and quitting quits only
//! the app — the runtime stays on.

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
compile_error!(
    "Tatolab.app builds for macOS and Linux only: on macOS it registers the runtime through \
     Service Management's SMAppService, and on Linux it drives the installer's systemd user \
     service, tatolabd.service."
);

mod local_api_client;
mod named_app_thread;
mod platform;
mod poison_tolerant_mutex;
mod run_tatolab_preference;
mod run_tatolab_switch;
mod stream_graph_summary;
mod stream_log_records_page;
mod tatolab_app_controller;
mod tatolab_app_shared_state;
mod tatolab_commands;
mod tatolab_main_window;
mod tatolab_status;
mod tatolab_status_publisher;
mod tatolab_tray_menu;

use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Manager};

use crate::named_app_thread::spawn_named_app_thread;
use crate::platform::the_app_was_opened_again;
use crate::tatolab_app_controller::TatolabAppController;
use crate::tatolab_app_shared_state::{
    quit_the_tatolab_app, run_off_the_main_thread_with_the_controller, set_up_tatolab_on_request,
    TatolabAppSharedState,
};
use crate::tatolab_main_window::show_main_window;
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
        .invoke_handler(tauri::generate_handler![
            tatolab_commands::get_tatolab_status,
            tatolab_commands::set_run_tatolab,
            tatolab_commands::open_login_items_settings,
            tatolab_commands::set_up_tatolab,
            tatolab_commands::quit_tatolab_app,
            tatolab_commands::read_stream_log_records,
            tatolab_commands::describe_stream_graph,
        ])
        .setup(move |app| {
            let app_config_directory = app.path().app_config_dir()?;
            let controller = Arc::new(TatolabAppController::for_this_build(
                &app_config_directory,
                app_launched_at,
                app.package_info().version.to_string(),
            ));
            let status_publisher = Arc::new(TatolabStatusPublisher::new(
                Arc::clone(&controller),
                app.handle().clone(),
            ));
            app.manage(TatolabAppSharedState {
                controller: Arc::clone(&controller),
                status_publisher: Arc::clone(&status_publisher),
            });

            status_publisher.attach_tray_menu(TatolabTrayMenu::build(
                app.handle(),
                controller.run_tatolab(),
                on_tray_menu_choice,
            )?);
            show_main_window(app.handle());
            spawn_named_app_thread("tatolab-app-opened", move || {
                controller.reconcile_the_agent_with_the_run_tatolab_switch();
                status_publisher.start_polling();
                controller.set_up_the_machine_on_app_opened();
                status_publisher.request_refresh();
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|failure| {
            tracing::error!(%failure, "Tatolab could not start");
            std::process::exit(1);
        });

    app.run(|app, run_event| {
        if the_app_was_opened_again(&run_event) {
            show_main_window(app);
            run_off_the_main_thread_with_the_controller(
                app,
                "tatolab-app-reopened",
                |controller, status_publisher| {
                    controller.reconcile_the_agent_with_the_run_tatolab_switch();
                    status_publisher.request_refresh();
                },
            );
        }
    });
}

fn on_tray_menu_choice(app: &AppHandle, choice: TrayMenuChoice) {
    match choice {
        TrayMenuChoice::OpenTatolab => show_main_window(app),
        TrayMenuChoice::ToggleRunTatolabSwitch => {
            run_off_the_main_thread_with_the_controller(
                app,
                "tatolab-run-tatolab-toggled",
                |controller, status_publisher| {
                    controller.toggle_run_tatolab();
                    status_publisher.request_refresh();
                },
            );
        }
        TrayMenuChoice::SetUpTatolab => {
            if let Err(refusal) = set_up_tatolab_on_request(app) {
                tracing::warn!(%refusal, "Set Up Tatolab… was refused");
            }
        }
        TrayMenuChoice::QuitTheApp => quit_the_tatolab_app(app),
    }
}
