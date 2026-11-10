import { expect, test } from "vitest";
import { FakeSystemNotifications } from "./fake_system_notifications.js";
import { FakeSystemMediaAccess } from "./fake_tatolab_platform_for_this_build.js";
import type { ProjectViewTheRuntimeListed } from "./project_views_on_the_wire.js";
import { SystemMediaAccessAskedAheadForViews, viewsDeclaringEachSystemMediaDevice } from "./system_media_access_asked_ahead_for_views.js";

function listedView(viewType: string, manifest: ProjectViewTheRuntimeListed["manifest"], opens = true): ProjectViewTheRuntimeListed {
  const viewFolder = viewType.split(":")[1] ?? viewType;
  return {
    view_type: viewType,
    project_name: "night-show",
    import_folder: null,
    view_folder_in_the_project: `views/${viewFolder}`,
    manifest,
    ...(opens ? { opens: true, not_opened_because: null } : { opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0." }),
  };
}

const CAMERA_DECK = listedView("night-show:deck", { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node", capabilities: ["read.selection", "camera"] });
const MIC_METER = listedView("night-show:meter", { contract: "1.0", title: " ", entry: "index.html", placement: "area", capabilities: ["microphone", "camera"] });
const NOTES = listedView("night-show:notes", { contract: "1.0", title: "Notes", entry: "index.html", placement: "area" });
const BROKEN_CAMERA = listedView("night-show:broken", { contract: "9.0", title: "Broken", entry: "index.html", placement: "area", capabilities: ["camera"] }, false);

test("each device is named by the first view that opens and declares it, an untitled one by its view type", () => {
  expect([...viewsDeclaringEachSystemMediaDevice([BROKEN_CAMERA, NOTES, CAMERA_DECK, MIC_METER])]).toEqual([
    ["camera", "DJ Deck"],
    ["microphone", "night-show:meter"],
  ]);
  expect([...viewsDeclaringEachSystemMediaDevice([NOTES, BROKEN_CAMERA, listedView("night-show:odd", null)])]).toEqual([]);
});

test("asks the system ahead for each device a view declares, once a run however often the views are listed", async () => {
  const systemMediaAccess = new FakeSystemMediaAccess();
  const systemNotifications = new FakeSystemNotifications();
  const askedAhead = new SystemMediaAccessAskedAheadForViews(systemMediaAccess, systemNotifications);

  await askedAhead.askForTheDevicesTheViewsDeclare([NOTES]);
  await askedAhead.askForTheDevicesTheViewsDeclare([NOTES, CAMERA_DECK]);
  await askedAhead.askForTheDevicesTheViewsDeclare([CAMERA_DECK, MIC_METER]);
  await askedAhead.askForTheDevicesTheViewsDeclare([CAMERA_DECK, MIC_METER]);

  expect(systemMediaAccess.devicesAsked).toEqual(["camera", "microphone"]);
  expect(systemNotifications.notificationsShown).toEqual([]);
});

test("tells the person once when the system refuses a device, naming the view, and a click opens where they allow it", async () => {
  const systemMediaAccess = new FakeSystemMediaAccess();
  systemMediaAccess.answerByDevice = { camera: "refused" };
  const systemNotifications = new FakeSystemNotifications();
  const askedAhead = new SystemMediaAccessAskedAheadForViews(systemMediaAccess, systemNotifications);

  await askedAhead.askForTheDevicesTheViewsDeclare([CAMERA_DECK]);
  await askedAhead.askForTheDevicesTheViewsDeclare([CAMERA_DECK]);
  systemNotifications.clickTheLastNotification();

  expect(systemNotifications.notificationsShown).toEqual([{ title: "Tato Studio can't use the camera", body: "DJ Deck needs it. Click to allow Tato Studio in System Settings." }]);
  expect(systemMediaAccess.privacyPanesOpened).toEqual(["camera"]);
});

test("asks two listings arriving together once, and tells nothing where no system asks", async () => {
  const systemMediaAccess = new FakeSystemMediaAccess();
  systemMediaAccess.answerByDevice = { camera: "asked_by_no_system" };
  const systemNotifications = new FakeSystemNotifications();
  const askedAhead = new SystemMediaAccessAskedAheadForViews(systemMediaAccess, systemNotifications);

  await Promise.all([askedAhead.askForTheDevicesTheViewsDeclare([CAMERA_DECK]), askedAhead.askForTheDevicesTheViewsDeclare([CAMERA_DECK])]);

  expect(systemMediaAccess.devicesAsked).toEqual(["camera"]);
  expect(systemNotifications.notificationsShown).toEqual([]);
});
