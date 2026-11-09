/** The app's menu: macOS's one menu bar, which shows the focused window's menus, or the app, File, Edit, View and Window menus for a window that sent none (View with only full screen, and no reload or developer tools); none on Linux, where each window draws its own menus. */
export type ApplicationMenu = "macos_menu_bar" | "none";
