import { expect, test } from "vitest";
import { MEDIA_DEVICES_ASKED_BY_NO_SYSTEM_ON_LINUX } from "./media_devices_asked_by_no_system_on_linux.js";

test("on Linux no system asks for the camera or the microphone", async () => {
  expect(await MEDIA_DEVICES_ASKED_BY_NO_SYSTEM_ON_LINUX.askAheadFor("camera")).toEqual({ kind: "asked_by_no_system" });
  expect(await MEDIA_DEVICES_ASKED_BY_NO_SYSTEM_ON_LINUX.askAheadFor("microphone")).toEqual({ kind: "asked_by_no_system" });
});
