// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The menu bar item: the Tatolab mark as a template image, and a native menu — a disabled status
//! line, "Open Tatolab", the "Run Tatolab" switch, and "Quit Tatolab" — on either click.

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Wry};

use crate::tatolab_status::{tray_status_line, TatolabStatus};

const OPEN_TATOLAB_MENU_ITEM_ID: &str = "open_tatolab";
const RUN_TATOLAB_MENU_ITEM_ID: &str = "run_tatolab";
const QUIT_TATOLAB_MENU_ITEM_ID: &str = "quit_tatolab";
const TRAY_STATUS_LINE_MENU_ITEM_ID: &str = "tray_status_line";

/// The tray's mark at 36×36, shown at 18pt in the menu bar.
const TRAY_TEMPLATE_ICON_PNG: &[u8] = include_bytes!("../icons/tray-template@2x.png");

/// What the user chose from the tray menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMenuChoice {
    OpenMainWindow,
    ToggleRunTatolabSwitch,
    QuitTheApp,
}

/// The tray icon and the two menu items whose state follows the status.
pub struct TatolabTrayMenu {
    status_line_menu_item: MenuItem<Wry>,
    run_tatolab_menu_item: CheckMenuItem<Wry>,
    _tray_icon: TrayIcon<Wry>,
}

impl TatolabTrayMenu {
    /// Put the tray icon in the menu bar, calling `on_choice` with each menu choice.
    pub fn build(
        app: &AppHandle,
        run_tatolab: bool,
        on_choice: impl Fn(&AppHandle, TrayMenuChoice) + Send + Sync + 'static,
    ) -> tauri::Result<Self> {
        let status_line_menu_item = MenuItem::with_id(
            app,
            TRAY_STATUS_LINE_MENU_ITEM_ID,
            "Starting…",
            false,
            None::<&str>,
        )?;
        let open_tatolab_menu_item = MenuItem::with_id(
            app,
            OPEN_TATOLAB_MENU_ITEM_ID,
            "Open Tatolab",
            true,
            None::<&str>,
        )?;
        let run_tatolab_menu_item = CheckMenuItem::with_id(
            app,
            RUN_TATOLAB_MENU_ITEM_ID,
            "Run Tatolab",
            true,
            run_tatolab,
            None::<&str>,
        )?;
        let quit_tatolab_menu_item = MenuItem::with_id(
            app,
            QUIT_TATOLAB_MENU_ITEM_ID,
            "Quit Tatolab",
            true,
            None::<&str>,
        )?;
        let tray_menu = Menu::with_items(
            app,
            &[
                &status_line_menu_item,
                &open_tatolab_menu_item,
                &run_tatolab_menu_item,
                &PredefinedMenuItem::separator(app)?,
                &quit_tatolab_menu_item,
            ],
        )?;
        let tray_icon = TrayIconBuilder::with_id("tatolab")
            .icon(Image::from_bytes(TRAY_TEMPLATE_ICON_PNG)?)
            .icon_as_template(true)
            .tooltip("Tatolab")
            .menu(&tray_menu)
            .show_menu_on_left_click(true)
            .on_menu_event(move |app, menu_event| {
                let choice = match menu_event.id().as_ref() {
                    OPEN_TATOLAB_MENU_ITEM_ID => TrayMenuChoice::OpenMainWindow,
                    RUN_TATOLAB_MENU_ITEM_ID => TrayMenuChoice::ToggleRunTatolabSwitch,
                    QUIT_TATOLAB_MENU_ITEM_ID => TrayMenuChoice::QuitTheApp,
                    _ => return,
                };
                on_choice(app, choice);
            })
            .build(app)?;
        Ok(Self {
            status_line_menu_item,
            run_tatolab_menu_item,
            _tray_icon: tray_icon,
        })
    }

    /// Show `status` in the status line and the switch's check mark.
    pub fn show_status(&self, status: &TatolabStatus) {
        if let Err(failure) = self
            .status_line_menu_item
            .set_text(tray_status_line(status))
        {
            tracing::warn!(%failure, "the tray status line could not be updated");
        }
        if let Err(failure) = self.run_tatolab_menu_item.set_checked(status.run_tatolab) {
            tracing::warn!(%failure, "the tray's Run Tatolab check could not be updated");
        }
    }
}
