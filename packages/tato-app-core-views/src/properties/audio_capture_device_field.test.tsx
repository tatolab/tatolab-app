import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { AudioCaptureDevicesReading, JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { AudioCaptureDeviceFieldOfTheSetting } from "./audio_capture_device_field";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

/** The control-plane stub's fixed listing, as streamlib's stub runtime answers `list_audio_capture_devices`. */
const STUB_LISTING: AudioCaptureDevicesReading = {
  kind: "listed",
  listing: {
    audio_backend: "stub-audio",
    devices: [
      { id: "stub-microphone", name: "Stub Microphone", kind: "input" },
      { id: "@DEFAULT_MONITOR@", name: "What the default output plays (now Monitor of Stub Speakers)", kind: "output_monitor" },
      { id: "stub-speakers.monitor", name: "Monitor of Stub Speakers", kind: "output_monitor" },
    ],
  },
};

let drawnRoot: Root | null = null;

afterEach(() => {
  act(() => drawnRoot?.unmount());
  drawnRoot = null;
  document.body.replaceChildren();
});

/** The field drawn holding `value`, over a connection answering `reading`, with each device chosen and each Default input recorded. */
async function drawTheField(value: JsonValue | null, reading: AudioCaptureDevicesReading) {
  const devicesChosen: string[] = [];
  let defaultsChosen = 0;
  let listingsAsked = 0;
  const connection: Pick<TatoAppViewConnection, "listAudioCaptureDevices"> = {
    listAudioCaptureDevices: async () => {
      listingsAsked += 1;
      return reading;
    },
  };
  const holder = document.createElement("div");
  document.body.append(holder);
  drawnRoot = createRoot(holder);
  await act(async () => {
    drawnRoot?.render(
      <AudioCaptureDeviceFieldOfTheSetting
        fieldId="microphone:device_id:pin"
        name="device_id"
        value={value}
        isTheTypesDefault={value === null}
        connection={connection}
        onDeviceChosen={(deviceId) => devicesChosen.push(deviceId)}
        onDefaultChosen={() => (defaultsChosen += 1)}
      />,
    );
  });
  return { devicesChosen, defaultsChosen: () => defaultsChosen, listingsAsked: () => listingsAsked };
}

function theMenusTrigger(): HTMLElement {
  return document.querySelector<HTMLElement>("#microphone\\:device_id\\:pin") ?? expect.unreachable("no device menu");
}

/** Opens the device menu as a pointer does and answers the words of each entry it offers. */
async function openTheMenu(): Promise<HTMLElement[]> {
  const trigger = theMenusTrigger();
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    trigger.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" }));
    trigger.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    trigger.click();
  });
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

test("the menu names Default input first, then each input and output monitor the runtime lists, and shows no device saved as Default input", async () => {
  const drawn = await drawTheField(null, STUB_LISTING);
  expect(theMenusTrigger().textContent).toBe("Default input");
  expect((await openTheMenu()).map((entry) => entry.textContent)).toEqual([
    "Default input",
    "Stub Microphone",
    "What the default output plays (now Monitor of Stub Speakers)",
    "Monitor of Stub Speakers",
  ]);
  expect(drawn.listingsAsked()).toBe(1);
});

test("choosing a device sets its id, choosing Default input unsets the setting, and choosing the entry held does nothing", async () => {
  const drawn = await drawTheField("stub-microphone", STUB_LISTING);
  expect(theMenusTrigger().textContent).toBe("Stub Microphone");
  const monitorOfTheSpeakers = (await openTheMenu()).find((entry) => entry.textContent === "Monitor of Stub Speakers") ?? expect.unreachable("no monitor entry");
  await act(async () => monitorOfTheSpeakers.click());
  expect(drawn.devicesChosen).toEqual(["stub-speakers.monitor"]);

  const defaultInput = (await openTheMenu()).find((entry) => entry.textContent === "Default input") ?? expect.unreachable("no Default input entry");
  await act(async () => defaultInput.click());
  expect(drawn.defaultsChosen()).toBe(1);

  const theMicrophoneHeld = (await openTheMenu()).find((entry) => entry.textContent === "Stub Microphone") ?? expect.unreachable("no microphone entry");
  await act(async () => theMicrophoneHeld.click());
  expect(drawn.devicesChosen).toEqual(["stub-speakers.monitor"]);
  expect(drawn.defaultsChosen()).toBe(1);
});

test("a saved device the machine does not list shows as missing and stays among the entries", async () => {
  await drawTheField("alsa_input.usb-gone.mono", STUB_LISTING);
  expect(theMenusTrigger().textContent).toBe("alsa_input.usb-gone.mono (missing)");
  expect((await openTheMenu()).map((entry) => entry.textContent).at(-1)).toBe("alsa_input.usb-gone.mono (missing)");
});

test("a listing the runtime refuses shows its words under the menu, the saved device still shown by its id", async () => {
  await drawTheField("stub-microphone", { kind: "not_listed", because: "list_audio_capture_devices failed: no runtime answers" });
  expect(theMenusTrigger().textContent).toBe("stub-microphone");
  expect(document.querySelector("[data-property-audio-capture-device-listing-refusal]")?.textContent).toContain("list_audio_capture_devices failed: no runtime answers");
});
