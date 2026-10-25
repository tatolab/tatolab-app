// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/** The desktop's notifications, which the app tells the person things through outside its window. */
export interface SystemNotifications {
  /** Whether this desktop shows notifications at all; a Linux desktop without a notification server shows none. */
  shownByThisDesktop(): boolean;
  /** Show one notification, calling `onClicked` when the person clicks it; nothing where the desktop shows none. */
  showNotification(title: string, body: string, onClicked: () => void): void;
}
