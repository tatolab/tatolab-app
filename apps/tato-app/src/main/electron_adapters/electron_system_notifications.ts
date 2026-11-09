import { Notification } from "electron";
import type { SystemNotifications } from "../system_notifications.js";

/** Notifications through the system's notification centre, silent, as the app's own. */
export function createElectronSystemNotifications(): SystemNotifications {
  // A notification nothing references is collected, and a click on it then reaches no listener.
  const notificationsShown = new Set<Notification>();
  return {
    shownByThisDesktop: () => Notification.isSupported(),
    showNotification: (title, body, onClicked) => {
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title, body, silent: true });
      notificationsShown.add(notification);
      notification.on("click", () => {
        notificationsShown.delete(notification);
        onClicked();
      });
      notification.on("close", () => notificationsShown.delete(notification));
      notification.show();
    },
  };
}
