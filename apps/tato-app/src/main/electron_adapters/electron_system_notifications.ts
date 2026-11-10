import { Notification } from "electron";
import type { SystemNotifications } from "../system_notifications.js";

/** Notifications through the system's notification centre, silent, as the app's own. */
export function createElectronSystemNotifications(): SystemNotifications {
  // A notification nothing references is collected, and a click on it then reaches no listener.
  const notificationsShown = new Set<Notification>();
  return {
    shownByThisDesktop: () => Notification.isSupported(),
    showNotification: (title, body, onClicked, notificationIdentifier) => {
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title, body, silent: true, ...(notificationIdentifier === undefined ? {} : { id: notificationIdentifier }) });
      notificationsShown.add(notification);
      notification.on("click", () => {
        notificationsShown.delete(notification);
        onClicked();
      });
      notification.on("close", () => notificationsShown.delete(notification));
      notification.show();
    },
    whenAnEarlierRunsNotificationIsClicked: (listener) => {
      // macOS keeps an earlier run's notifications in Notification Center, and Electron delivers a click on one only to
      // the live objects `getHistory` hands back; no other desktop has `getHistory`.
      if (typeof Notification.getHistory !== "function") return;
      Notification.getHistory().then(
        (earlierRunsNotifications) => {
          for (const earlierRunsNotification of earlierRunsNotifications) {
            notificationsShown.add(earlierRunsNotification);
            earlierRunsNotification.on("click", () => {
              notificationsShown.delete(earlierRunsNotification);
              listener(earlierRunsNotification.id);
            });
          }
        },
        () => undefined,
      );
    },
  };
}
