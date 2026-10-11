// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one window. It shows when the app opens, when the app is opened again, and from the
//! tray's "Open Tatolab"; closing it hides it and the app keeps running in the menu bar. The Dock
//! icon shows only while the window does.

use tauri::{
    ActivationPolicy, AppHandle, LogicalPosition, Manager, TitleBarStyle, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::tatolab_app_shared_state::TatolabAppSharedState;

/// The window's label; the capability granting the frontend its permissions names it.
const MAIN_WINDOW_LABEL: &str = "main";

/// The traffic lights, centred in the 52 px band the frontend keeps at the top as the window's
/// drag region.
const MAIN_WINDOW_TRAFFIC_LIGHT_POSITION: LogicalPosition<f64> =
    LogicalPosition { x: 18.0, y: 26.0 };

/// Create the main window, with the overlay title bar the frontend draws under.
fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let main_window =
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("Tatolab")
            .inner_size(1040.0, 700.0)
            .min_inner_size(860.0, 580.0)
            .title_bar_style(TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(MAIN_WINDOW_TRAFFIC_LIGHT_POSITION)
            .center()
            .build()?;
    let app_for_the_close_request = app.clone();
    main_window.on_window_event(move |window_event| {
        if let WindowEvent::CloseRequested { api, .. } = window_event {
            api.prevent_close();
            hide_main_window(&app_for_the_close_request);
        }
    });
    Ok(main_window)
}

/// Show the main window, creating it the first time, bring the app forward with its Dock icon,
/// and send the window the last status published.
pub fn show_main_window(app: &AppHandle) {
    show_dock_icon(app, true);
    let main_window = match app.get_webview_window(MAIN_WINDOW_LABEL) {
        Some(main_window) => main_window,
        None => match create_main_window(app) {
            Ok(main_window) => main_window,
            Err(failure) => {
                tracing::error!(%failure, "the Tatolab window could not be created");
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

/// Hide the main window and the Dock icon; the app keeps running in the menu bar.
fn hide_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(failure) = main_window.hide() {
            tracing::warn!(%failure, "the Tatolab window could not be hidden");
        }
    }
    show_dock_icon(app, false);
}

/// A regular app with a Dock icon while the window shows, an accessory without one otherwise.
fn show_dock_icon(app: &AppHandle, dock_icon_visible: bool) {
    let activation_policy = if dock_icon_visible {
        ActivationPolicy::Regular
    } else {
        ActivationPolicy::Accessory
    };
    if let Err(failure) = app.set_activation_policy(activation_policy) {
        tracing::warn!(%failure, dock_icon_visible, "the Dock icon could not be shown or hidden");
    }
}
