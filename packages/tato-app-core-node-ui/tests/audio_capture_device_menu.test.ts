import type { ControlledPin, InputControlElementClass, InputControlState, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import type { AudioCaptureDevicesReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import AudioCaptureDeviceMenu from "../node_ui/audio_capture_device_menu.ts";
import { eventsFiredBy, NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-audio_capture_device_menu-test", AudioCaptureDeviceMenu);

/** The control-plane stub's fixed listing, as streamlib's stub runtime answers `list_audio_capture_devices`. */
const STUB_LISTING: AudioCaptureDevicesReading = {
  kind: "listed",
  listing: {
    audio_backend: "stub-audio",
    devices: [
      { id: "stub-microphone", name: "Stub Microphone", kind: "input" },
      { id: "stub-speakers.monitor", name: "Monitor of Stub Speakers", kind: "output_monitor" },
    ],
  },
};

/** A Studio that hands each watch of the devices to `tell`, and counts the watches still open. */
function studioListingTheDevices() {
  const listeners = new Set<(reading: AudioCaptureDevicesReading) => void>();
  const studio: NodeUiElementHost = {
    ...NO_STUDIO_CALLS,
    watchAudioCaptureDevices: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const tell = (reading: AudioCaptureDevicesReading) => {
    for (const listener of listeners) listener(reading);
  };
  return { studio, tell, watchesOpen: () => listeners.size };
}

function mountedMenu(studio: NodeUiElementHost, value: string, state: InputControlState = "editable"): AudioCaptureDeviceMenu {
  const control = new AudioCaptureDeviceMenu();
  const pin: ControlledPin<"string"> = {
    declaration: { input_name: "device_id", label: "device_id", pin_type: { type: "string" }, annotations: { control: "audio_capture_device" }, may_be_unset: false },
    surface: "properties",
    studio,
  };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

async function fieldOf(control: AudioCaptureDeviceMenu): Promise<HTMLInputElement> {
  return vi.waitFor(() => {
    const input = control.querySelector<HTMLInputElement>("input[aria-label=device_id]");
    if (input === null) throw new Error("the control draws no field yet");
    return input;
  });
}

/** Opens the menu the control draws, as a click on it does, and answers the words of each entry it offers. */
async function openedMenuOf(control: AudioCaptureDeviceMenu): Promise<HTMLElement[]> {
  const trigger = await vi.waitFor(() => {
    const button = control.querySelector<HTMLButtonElement>("button[aria-label=device_id]");
    if (button === null) throw new Error("the control draws no menu yet");
    return button;
  });
  trigger.click();
  return vi.waitFor(() => {
    const entries = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")];
    if (entries.length === 0) throw new Error("the menu is not open");
    return entries;
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the audio capture device menu", () => {
  it("is the class the Studio defines for a String input", () => {
    expectTypeOf(AudioCaptureDeviceMenu).toExtend<InputControlElementClass<"string">>();
  });

  it("names the device held once the machine's devices are listed, Default input for the empty id, and offers no choice while read only", async () => {
    const { studio, tell } = studioListingTheDevices();
    const control = mountedMenu(studio, "stub-microphone", "read_only");
    expect((await fieldOf(control)).value).toBe("stub-microphone");
    tell(STUB_LISTING);
    await vi.waitFor(async () => expect((await fieldOf(control)).value).toBe("Stub Microphone"));
    control.value = "";
    await vi.waitFor(async () => expect((await fieldOf(control)).value).toBe("Default input"));
    expect(control.querySelector("button")).toBeNull();
  });

  it("offers Default input then each device, and fires one change carrying the id chosen and none for the one held", async () => {
    const { studio, tell } = studioListingTheDevices();
    const control = mountedMenu(studio, "stub-microphone");
    tell(STUB_LISTING);
    const fired = eventsFiredBy(control);
    const entries = await openedMenuOf(control);
    expect(entries.map((entry) => entry.textContent)).toEqual(["Default input", "Stub Microphone", "Monitor of Stub Speakers"]);
    entries[1]?.click();
    expect(fired).toEqual([]);
    (await openedMenuOf(control))[2]?.click();
    (await openedMenuOf(control))[0]?.click();
    expect(fired).toEqual([
      { name: "change", value: "stub-speakers.monitor" },
      { name: "change", value: "" },
    ]);
  });

  it("says a refused listing under the menu, and ends its watch of the devices as it is taken off", async () => {
    const { studio, tell, watchesOpen } = studioListingTheDevices();
    const control = mountedMenu(studio, "");
    expect(watchesOpen()).toBe(1);
    tell({ kind: "not_listed", because: "No runtime answers." });
    await vi.waitFor(() => expect(control.textContent).toContain("No runtime answers."));
    control.remove();
    expect(watchesOpen()).toBe(0);
  });
});
