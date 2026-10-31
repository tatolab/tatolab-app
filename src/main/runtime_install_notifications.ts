// The notification that marks the end of a runtime install the person did not watch, the window
// being closed while it ran.

import type { CarriedRuntimeInstallOutcome } from "./carried_runtime_install_on_launch.js";
import type { SystemNotifications } from "./system_notifications.js";

/** Notify that the install `outcome` names ended, calling `onClicked` when the person clicks it; nothing for an outcome where the installer did not run. */
export function notifyTheRuntimeInstallEnded(systemNotifications: SystemNotifications, outcome: CarriedRuntimeInstallOutcome, onClicked: () => void): void {
  switch (outcome.kind) {
    case "installed":
      systemNotifications.showNotification("Tatolab's runtime is updated", `Runtime ${outcome.runtimeBuild} is running.`, onClicked);
      return;
    case "not_installed":
      systemNotifications.showNotification("Tatolab's runtime didn't update", "Open Tatolab to see what the installer said and try again.", onClicked);
      return;
    case "nothing_carried":
    case "carried_runtime_unreadable":
    case "already_installed":
      return;
  }
}
