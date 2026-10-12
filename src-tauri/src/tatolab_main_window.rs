// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one window. It shows when the app opens, when the app is opened again, and from the
//! tray's "Open Tatolab"; closing it hides it and the app keeps running in the menu bar. On macOS
//! the Dock icon shows only while the window does.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

#[cfg(target_os = "macos")]
use crate::platform::show_dock_icon;
use crate::platform::with_the_main_window_chrome;
use crate::tatolab_app_shared_state::TatolabAppSharedState;

/// The window's label; the capability granting the frontend its permissions names it.
const MAIN_WINDOW_LABEL: &str = "main";

/// Create the main window in this platform's chrome.
fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let main_window_builder =
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("Tatolab")
            .inner_size(1040.0, 700.0)
            .min_inner_size(860.0, 580.0)
            .center();
    let main_window = with_the_main_window_chrome(main_window_builder).build()?;
    let app_for_the_close_request = app.clone();
    main_window.on_window_event(move |window_event| {
        if let WindowEvent::CloseRequested { api, .. } = window_event {
            api.prevent_close();
            hide_main_window(&app_for_the_close_request);
        }
    });
    Ok(main_window)
}

/// Show the main window, creating it the first time, bring the app forward, and send the window
/// the last status published.
pub fn show_main_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    show_dock_icon(app, true);
    let main_window = match app.get_webview_window(MAIN_WINDOW_LABEL) {
        Some(main_window) => main_window,
        None => match create_main_window(app) {
            Ok(main_window) => main_window,
            Err(failure) => {
                tracing::error!(%failure, "the Tatolab window could not be created");
                #[cfg(target_os = "macos")]
                show_dock_icon(app, false);
                return;
            }
        },
    };
    for (what_was_asked, outcome) in [
        ("unminimize", main_window.unminimize()),
        ("show", main_window.show()),
        ("focus", main_window.set_focus()),
    ] {
        if let Err(failure) = outcome {
            tracing::warn!(%failure, what_was_asked, "the Tatolab window did not respond");
        }
    }
    if let Some(shared_state) = app.try_state::<TatolabAppSharedState>() {
        shared_state
            .status_publisher
            .send_the_last_published_status_to_the_window();
    }
}

/// Hide the main window; the app keeps running in the menu bar.
fn hide_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(failure) = main_window.hide() {
            tracing::warn!(%failure, "the Tatolab window could not be hidden");
        }
    }
    #[cfg(target_os = "macos")]
    show_dock_icon(app, false);
}
