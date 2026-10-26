/** The tray's icon as a platform shows it, by its file name in the app's icons directory. */
export interface TrayIconImage {
  pngFileName: string;
  /** Whether the system tints it to the menu bar's appearance, as macOS does a template image. */
  isATemplate: boolean;
}
