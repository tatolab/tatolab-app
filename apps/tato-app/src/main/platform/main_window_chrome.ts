/** The main window's title bar: macOS's hidden one the window draws under, or the desktop's own. */
export type MainWindowChrome =
  | { titleBarStyle: "hidden"; trafficLightPosition: { x: number; y: number } }
  | { titleBarStyle: "default" };

/** Whether macOS shows the app in the Dock and the app switcher (`regular`) or only in the menu bar (`accessory`). */
export type MacosActivationPolicy = "regular" | "accessory";

/** Where the app's Dock presence is set. */
export interface DockIconHost {
  setActivationPolicy(activationPolicy: MacosActivationPolicy): void;
}
