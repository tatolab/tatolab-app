// The camera and the microphone are asked for when a view that declares one arrives in an open
// project, by an import, an opening or a new project, so the system's one prompt never lands in the
// middle of a show the first time a view starts capturing.

import { SYSTEM_MEDIA_DEVICES, type SystemMediaAccess, type SystemMediaDevice } from "./platform/system_media_access.js";
import type { ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import type { SystemNotifications } from "./system_notifications.js";

/** The words for each device in what the person is told. */
const DEVICE_WORDS: Readonly<Record<SystemMediaDevice, string>> = { camera: "the camera", microphone: "the microphone" };

/** The title of the notification telling the person the system refused `device`. */
export function mediaAccessRefusedNotificationTitle(device: SystemMediaDevice): string {
  return `Tato Studio can't use ${DEVICE_WORDS[device]}`;
}

/** The body of that notification, naming the view that declared `device`. */
export function mediaAccessRefusedNotificationBody(viewTitle: string): string {
  return `${viewTitle} needs it. Click to allow Tato Studio in System Settings.`;
}

/** The prefix of a media-access refusal notification's identifier, which the device's name follows. */
const MEDIA_ACCESS_REFUSED_NOTIFICATION_IDENTIFIER_PREFIX = "com.tatolab.tatolab.media-access-refused.";

/** The identifier the refusal notification for `device` carries, the same in every run so a later launch can read it. */
export function mediaAccessRefusedNotificationIdentifier(device: SystemMediaDevice): string {
  return `${MEDIA_ACCESS_REFUSED_NOTIFICATION_IDENTIFIER_PREFIX}${device}`;
}

/** The device a refusal notification's `notificationIdentifier` names, or `null` for any other notification. */
export function deviceOfAMediaAccessRefusedNotification(notificationIdentifier: string): SystemMediaDevice | null {
  if (!notificationIdentifier.startsWith(MEDIA_ACCESS_REFUSED_NOTIFICATION_IDENTIFIER_PREFIX)) return null;
  const deviceName = notificationIdentifier.slice(MEDIA_ACCESS_REFUSED_NOTIFICATION_IDENTIFIER_PREFIX.length);
  return SYSTEM_MEDIA_DEVICES.find((device) => device === deviceName) ?? null;
}

/** The first view in `listedViews` that opens and declares each device among its `capabilities`, by its title or, untitled, its view type. */
export function viewsDeclaringEachSystemMediaDevice(listedViews: readonly ProjectViewTheRuntimeListed[]): Map<SystemMediaDevice, string> {
  const viewTitleByDevice = new Map<SystemMediaDevice, string>();
  for (const listedView of listedViews) {
    if (!listedView.opens || typeof listedView.manifest !== "object" || listedView.manifest === null || Array.isArray(listedView.manifest)) continue;
    const declaredCapabilities = listedView.manifest["capabilities"];
    if (!Array.isArray(declaredCapabilities)) continue;
    const title = listedView.manifest["title"];
    const viewTitle = typeof title === "string" && title.trim() !== "" ? title.trim() : listedView.view_type;
    for (const device of SYSTEM_MEDIA_DEVICES) {
      if (declaredCapabilities.includes(device) && !viewTitleByDevice.has(device)) viewTitleByDevice.set(device, viewTitle);
    }
  }
  return viewTitleByDevice;
}

/** Asks `systemMediaAccess` for each device a listed view declares, once a run of the app per device, telling the person through `systemNotifications` when the system refuses one. */
export class SystemMediaAccessAskedAheadForViews {
  private readonly devicesAskedThisRun = new Set<SystemMediaDevice>();

  constructor(
    private readonly systemMediaAccess: SystemMediaAccess,
    private readonly systemNotifications: SystemNotifications,
  ) {}

  /** Ask ahead for every device a view among `listedViews` declares that this run has not asked for yet. */
  async askForTheDevicesTheViewsDeclare(listedViews: readonly ProjectViewTheRuntimeListed[]): Promise<void> {
    const devicesToAsk = [...viewsDeclaringEachSystemMediaDevice(listedViews)].filter(([device]) => !this.devicesAskedThisRun.has(device));
    for (const [device] of devicesToAsk) this.devicesAskedThisRun.add(device);
    for (const [device, viewTitle] of devicesToAsk) {
      const answer = await this.systemMediaAccess.askAheadFor(device);
      if (answer.kind === "refused") {
        this.systemNotifications.showNotification(
          mediaAccessRefusedNotificationTitle(device),
          mediaAccessRefusedNotificationBody(viewTitle),
          answer.openWhereThePersonAllowsIt,
          mediaAccessRefusedNotificationIdentifier(device),
        );
      }
    }
  }

  /**
   * Answer a click in Notification Center on `notificationIdentifier`, shown by an earlier run of the app: for a refusal
   * notification whose device the system still refuses, open where the person allows it.
   */
  async answerAClickOnAnEarlierRunsNotification(notificationIdentifier: string): Promise<void> {
    const device = deviceOfAMediaAccessRefusedNotification(notificationIdentifier);
    if (device === null) return;
    this.devicesAskedThisRun.add(device);
    const answer = await this.systemMediaAccess.askAheadFor(device);
    if (answer.kind === "refused") answer.openWhereThePersonAllowsIt();
  }
}
