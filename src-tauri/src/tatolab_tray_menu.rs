// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The menu bar item and the app's whole UI: the Tatolab mark as a template image, and a native
//! menu — a disabled status line, the "Run Tatolab" switch, "Set Up Tatolab…" while machine setup
//! is missing, and "Quit Tatolab" — on either click.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Wry};

use crate::tatolab_status::{tray_status_line, MachineSetupState, TatolabStatus};

const RUN_TATOLAB_MENU_ITEM_ID: &str = "run_tatolab";
const SET_UP_TATOLAB_MENU_ITEM_ID: &str = "set_up_tatolab";
const QUIT_TATOLAB_MENU_ITEM_ID: &str = "quit_tatolab";
const TRAY_STATUS_LINE_MENU_ITEM_ID: &str = "tray_status_line";

/// Where "Set Up Tatolab…" sits while it shows: after the status line and the switch.
const SET_UP_TATOLAB_MENU_ITEM_POSITION: usize = 2;

/// The tray's mark at 36×36, shown at 18pt in the menu bar.
const TRAY_TEMPLATE_ICON_PNG: &[u8] = include_bytes!("../icons/tray-template@2x.png");

/// What the user chose from the tray menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayMenuChoice {
    ToggleRunTatolabSwitch,
    SetUpTatolab,
    QuitTheApp,
}

/// How "Set Up Tatolab…" shows in the menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SetUpTatolabMenuItemPresentation {
    Hidden,
    ShownEnabled,
    ShownDisabled,
}

/// "Set Up Tatolab…" shows only while machine setup is missing, and waits while the
/// administrator prompt is already showing.
pub fn set_up_tatolab_menu_item_presentation(
    machine_setup: MachineSetupState,
) -> SetUpTatolabMenuItemPresentation {
    match machine_setup {
        MachineSetupState::Complete => SetUpTatolabMenuItemPresentation::Hidden,
        MachineSetupState::NeedsAdministrator => SetUpTatolabMenuItemPresentation::ShownEnabled,
        MachineSetupState::WaitingForAdministrator => {
            SetUpTatolabMenuItemPresentation::ShownDisabled
        }
    }
}

/// The tray icon, its menu, and the menu items whose state follows the status.
pub struct TatolabTrayMenu {
    tray_menu: Menu<Wry>,
    status_line_menu_item: MenuItem<Wry>,
    run_tatolab_menu_item: CheckMenuItem<Wry>,
    set_up_tatolab_menu_item: MenuItem<Wry>,
    set_up_tatolab_menu_item_in_the_menu: AtomicBool,
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
        let run_tatolab_menu_item = CheckMenuItem::with_id(
            app,
            RUN_TATOLAB_MENU_ITEM_ID,
            "Run Tatolab",
            true,
            run_tatolab,
            None::<&str>,
        )?;
        let set_up_tatolab_menu_item = MenuItem::with_id(
            app,
            SET_UP_TATOLAB_MENU_ITEM_ID,
            "Set Up Tatolab…",
            true,
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
                    RUN_TATOLAB_MENU_ITEM_ID => TrayMenuChoice::ToggleRunTatolabSwitch,
                    SET_UP_TATOLAB_MENU_ITEM_ID => TrayMenuChoice::SetUpTatolab,
                    QUIT_TATOLAB_MENU_ITEM_ID => TrayMenuChoice::QuitTheApp,
                    _ => return,
                };
                on_choice(app, choice);
            })
            .build(app)?;
        Ok(Self {
            tray_menu,
            status_line_menu_item,
            run_tatolab_menu_item,
            set_up_tatolab_menu_item,
            set_up_tatolab_menu_item_in_the_menu: AtomicBool::new(false),
            _tray_icon: tray_icon,
        })
    }

    /// Show `status` in the status line, the switch's check mark, and "Set Up Tatolab…".
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
        self.show_set_up_tatolab_menu_item(set_up_tatolab_menu_item_presentation(
            status.machine_setup.state,
        ));
    }

    fn show_set_up_tatolab_menu_item(&self, presentation: SetUpTatolabMenuItemPresentation) {
        let should_be_in_the_menu = presentation != SetUpTatolabMenuItemPresentation::Hidden;
        if should_be_in_the_menu {
            let enabled = presentation == SetUpTatolabMenuItemPresentation::ShownEnabled;
            if let Err(failure) = self.set_up_tatolab_menu_item.set_enabled(enabled) {
                tracing::warn!(%failure, enabled, "the tray's Set Up Tatolab item could not be updated");
            }
        }
        if self
            .set_up_tatolab_menu_item_in_the_menu
            .load(Ordering::Acquire)
            == should_be_in_the_menu
        {
            return;
        }
        let changed = if should_be_in_the_menu {
            self.tray_menu.insert(
                &self.set_up_tatolab_menu_item,
                SET_UP_TATOLAB_MENU_ITEM_POSITION,
            )
        } else {
            self.tray_menu.remove(&self.set_up_tatolab_menu_item)
        };
        match changed {
            Ok(()) => self
                .set_up_tatolab_menu_item_in_the_menu
                .store(should_be_in_the_menu, Ordering::Release),
            Err(failure) => tracing::warn!(
                %failure,
                should_be_in_the_menu,
                "the tray's Set Up Tatolab item could not be shown or hidden"
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_up_tatolab_shows_only_while_machine_setup_is_missing_and_waits_while_the_prompt_shows() {
        assert_eq!(
            set_up_tatolab_menu_item_presentation(MachineSetupState::Complete),
            SetUpTatolabMenuItemPresentation::Hidden
        );
        assert_eq!(
            set_up_tatolab_menu_item_presentation(MachineSetupState::NeedsAdministrator),
            SetUpTatolabMenuItemPresentation::ShownEnabled
        );
        assert_eq!(
            set_up_tatolab_menu_item_presentation(MachineSetupState::WaitingForAdministrator),
            SetUpTatolabMenuItemPresentation::ShownDisabled
        );
    }
}
