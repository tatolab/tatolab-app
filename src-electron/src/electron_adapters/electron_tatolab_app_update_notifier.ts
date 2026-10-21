// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Notification } from "electron";
import type { TatolabAppUpdateNotifier } from "../tatolab_app_updater.js";

/** Update notifications through the system's notification centre; clicking one calls `onNotificationClicked`. */
export function createElectronTatolabAppUpdateNotifier(onNotificationClicked: () => void): TatolabAppUpdateNotifier {
  // A notification nothing references is collected, and a click on it then reaches no listener.
  const notificationsShown = new Set<Notification>();
  const showNotification = (title: string, body: string) => {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title, body, silent: true });
    notificationsShown.add(notification);
    notification.on("click", () => {
      notificationsShown.delete(notification);
      onNotificationClicked();
    });
    notification.on("close", () => notificationsShown.delete(notification));
    notification.show();
  };
  return {
    notifyANewerVersionIsAvailable: (version) =>
      showNotification(`Tatolab ${version} is available`, "Choose Check for Updates… or open Settings to install it."),
    notifyTheAppIsUpToDate: () => showNotification("Tatolab is up to date", "No newer version is available."),
    notifyTheUpdateFailed: (refusal) => showNotification("Tatolab couldn't update", refusal),
  };
}
