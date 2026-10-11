// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Tatolab.app: opening it starts the runtime as a launch agent, the "Run Tatolab" switch in the
//! menu bar is that same registration, and quitting quits only the app — the runtime stays on.

#[cfg(not(target_os = "macos"))]
compile_error!(
    "Tatolab.app builds for macOS only; it registers the runtime through Service Management's \
     SMAppService and sets up the machine behind the macOS administrator prompt."
);

mod local_api_client;
mod macos;
mod named_app_thread;
mod poison_tolerant_mutex;
mod run_tatolab_preference;
mod run_tatolab_switch;
mod runtime_launch_agent_registration;
mod tatolab_app_controller;
mod tatolab_status;
mod tatolab_status_publisher;
mod tatolab_tray_menu;

use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Manager, RunEvent};

use crate::named_app_thread::spawn_named_app_thread;
use crate::tatolab_app_controller::TatolabAppController;
use crate::tatolab_status_publisher::TatolabStatusPublisher;
use crate::tatolab_tray_menu::{TatolabTrayMenu, TrayMenuChoice};

/// The controller and the status publisher, reachable from the tray and from app events.
struct TatolabAppSharedState {
    controller: Arc<TatolabAppController>,
    status_publisher: Arc<TatolabStatusPublisher>,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let app_launched_at = Instant::now();

    let app = tauri::Builder::default()
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

            status_publisher.attach_tray_menu(TatolabTrayMenu::build(
                app.handle(),
                controller.run_tatolab(),
                on_tray_menu_choice,
            )?);
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
        if let RunEvent::Reopen { .. } = run_event {
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

/// Run `work` on its own thread named `thread_name`: it may block on Service Management, the
/// filesystem, the local API or the administrator prompt.
fn run_off_the_main_thread_with_the_controller(
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

fn on_tray_menu_choice(app: &AppHandle, choice: TrayMenuChoice) {
    match choice {
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
            run_off_the_main_thread_with_the_controller(
                app,
                "tatolab-set-up-tatolab",
                |controller, status_publisher| {
                    controller.set_up_the_machine_on_request();
                    status_publisher.request_refresh();
                },
            );
        }
        TrayMenuChoice::QuitTheApp => {
            tracing::info!("quitting the Tatolab app from the tray; the runtime keeps running");
            app.exit(0);
        }
    }
}
