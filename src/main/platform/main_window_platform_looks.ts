/** The main window's title bar: macOS's hidden one the window draws under, or the desktop's own. */
export type MainWindowChrome =
  | { titleBarStyle: "hidden"; trafficLightPosition: { x: number; y: number } }
  | { titleBarStyle: "default" };

/** Whether macOS shows the app in the Dock and the app switcher (`regular`) or only in the menu bar (`accessory`). */
export type MacosActivationPolicy = "regular" | "accessory";

/** The app's menu: macOS's menu bar holds the app, File, Edit, View and Window menus (View with only full screen, and no reload or developer tools); a Linux window shows none. */
export type ApplicationMenu = "macos_menu_bar" | "none";

/** Where the app's Dock presence is set. */
export interface DockIconHost {
  setActivationPolicy(activationPolicy: MacosActivationPolicy): void;
}
