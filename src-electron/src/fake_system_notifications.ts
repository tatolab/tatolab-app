// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Tests' stand-in for the desktop's notifications: it records each notification shown and lets
// the test click one. Never imported by shipped code.

import type { SystemNotifications } from "./system_notifications.js";

/** One notification the app showed. */
export interface FakeNotificationShown {
  title: string;
  body: string;
}

/** A desktop that shows notifications unless the test says it shows none, recording each one shown. */
export class FakeSystemNotifications implements SystemNotifications {
  readonly notificationsShown: FakeNotificationShown[] = [];
  desktopShowsNotifications = true;
  private readonly clickHandlers: (() => void)[] = [];

  /** Calls `onShown` with each notification as it is shown. */
  constructor(private readonly onShown: (notificationShown: FakeNotificationShown) => void = () => {}) {}

  shownByThisDesktop(): boolean {
    return this.desktopShowsNotifications;
  }

  showNotification(title: string, body: string, onClicked: () => void): void {
    if (!this.desktopShowsNotifications) return;
    this.notificationsShown.push({ title, body });
    this.clickHandlers.push(onClicked);
    this.onShown({ title, body });
  }

  /** Click the most recent notification shown, as the person does. */
  clickTheLastNotification(): void {
    this.clickHandlers.at(-1)?.();
  }
}
