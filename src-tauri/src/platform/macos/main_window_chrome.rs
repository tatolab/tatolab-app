// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The main window's macOS looks: the overlay title bar the frontend draws under, and the Dock
//! icon, shown only while the window is.

use tauri::{
    ActivationPolicy, AppHandle, LogicalPosition, Manager, Runtime, TitleBarStyle,
    WebviewWindowBuilder,
};

/// The traffic lights, centred in the 52 px band the frontend keeps at the top as the window's
/// drag region.
const MAIN_WINDOW_TRAFFIC_LIGHT_POSITION: LogicalPosition<f64> =
    LogicalPosition { x: 18.0, y: 26.0 };

/// The overlay title bar the frontend draws under, with no title shown.
pub fn with_the_main_window_chrome<'a, R: Runtime, M: Manager<R>>(
    main_window_builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    main_window_builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(MAIN_WINDOW_TRAFFIC_LIGHT_POSITION)
}

/// A regular app with a Dock icon while the window shows, an accessory without one otherwise.
pub fn show_dock_icon(app: &AppHandle, dock_icon_visible: bool) {
    let activation_policy = if dock_icon_visible {
        ActivationPolicy::Regular
    } else {
        ActivationPolicy::Accessory
    };
    if let Err(failure) = app.set_activation_policy(activation_policy) {
        tracing::warn!(%failure, dock_icon_visible, "the Dock icon could not be shown or hidden");
    }
}
