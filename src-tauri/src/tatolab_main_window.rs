// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one window. Closing it hides it and the app keeps running in the menu bar; the Dock
//! icon shows while the window does.

use tauri::{
    AppHandle, Manager, TitleBarStyle, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

/// The window's label; the capability that grants the frontend its commands names it.
pub const MAIN_WINDOW_LABEL: &str = "main";

/// Create the main window, shown, with the overlay title bar the frontend draws its drag region
/// under.
pub fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let main_window =
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("Tatolab")
            .inner_size(920.0, 620.0)
            .min_inner_size(760.0, 520.0)
            .title_bar_style(TitleBarStyle::Overlay)
            .hidden_title(true)
            .center()
            .visible(true)
            .build()?;
    let app_for_close = app.clone();
    main_window.on_window_event(move |window_event| {
        if let WindowEvent::CloseRequested { api, .. } = window_event {
            api.prevent_close();
            hide_main_window(&app_for_close);
        }
    });
    show_dock_icon(app, true);
    Ok(main_window)
}

/// Show the main window and bring the app forward, recreating the window if it is gone.
pub fn show_main_window(app: &AppHandle) {
    show_dock_icon(app, true);
    let main_window = match app.get_webview_window(MAIN_WINDOW_LABEL) {
        Some(main_window) => main_window,
        None => match create_main_window(app) {
            Ok(main_window) => main_window,
            Err(failure) => {
                tracing::error!(%failure, "the main window could not be created");
                return;
            }
        },
    };
    for (what, outcome) in [
        ("unminimize", main_window.unminimize()),
        ("show", main_window.show()),
        ("focus", main_window.set_focus()),
    ] {
        if let Err(failure) = outcome {
            tracing::warn!(%failure, what, "the main window did not respond");
        }
    }
}

/// Hide the main window and the Dock icon; the app keeps running in the menu bar.
pub fn hide_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(failure) = main_window.hide() {
            tracing::warn!(%failure, "the main window could not be hidden");
        }
    }
    show_dock_icon(app, false);
}

fn show_dock_icon(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let activation_policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        if let Err(failure) = app.set_activation_policy(activation_policy) {
            tracing::warn!(%failure, visible, "the Dock icon could not be changed");
        }
    }
}
