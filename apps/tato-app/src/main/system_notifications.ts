/** The desktop's notifications, which the app tells the person things through outside its window. */
export interface SystemNotifications {
  /** Whether this desktop shows notifications at all; a Linux desktop without a notification server shows none. */
  shownByThisDesktop(): boolean;
  /**
   * Show one notification, calling `onClicked` when the person clicks it while this run of the app lives; nothing where
   * the desktop shows none. `notificationIdentifier` names it, so a click after the app quit names it to the launch it causes.
   */
  showNotification(title: string, body: string, onClicked: () => void, notificationIdentifier?: string): void;
}
