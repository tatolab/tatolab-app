import { expect, test } from "vitest";
import type { AudioCaptureDeviceOnTheWire } from "@tatolab/tato-app-view-sdk/studio_readings";
import { audioCaptureDeviceChoicesOf, chosenAudioCaptureDeviceChoice, DEFAULT_INPUT_WORDS } from "./audio_capture_device_choices";

const STUB_DEVICES: AudioCaptureDeviceOnTheWire[] = [
  { id: "stub-microphone", name: "Stub Microphone", kind: "input" },
  { id: "@DEFAULT_MONITOR@", name: "What the default output plays (now Monitor of Stub Speakers)", kind: "output_monitor" },
  { id: "stub-speakers.monitor", name: "Monitor of Stub Speakers", kind: "output_monitor" },
];

test("the menu offers Default input first, which unsets the device, then each device the runtime lists by its name, in its order", () => {
  expect(audioCaptureDeviceChoicesOf({ kind: "listed", devices: STUB_DEVICES }, null)).toEqual([
    { words: DEFAULT_INPUT_WORDS, device_id: null },
    { words: "Stub Microphone", device_id: "stub-microphone" },
    { words: "What the default output plays (now Monitor of Stub Speakers)", device_id: "@DEFAULT_MONITOR@" },
    { words: "Monitor of Stub Speakers", device_id: "stub-speakers.monitor" },
  ]);
  expect(DEFAULT_INPUT_WORDS).toBe("Default input");
});

test("a saved device the machine does not list stays in the menu, last and marked as missing, and is the one chosen", () => {
  const choices = audioCaptureDeviceChoicesOf({ kind: "listed", devices: STUB_DEVICES }, "alsa_input.usb-gone.mono");
  expect(choices.at(-1)).toEqual({ words: "alsa_input.usb-gone.mono (missing)", device_id: "alsa_input.usb-gone.mono" });
  expect(choices).toHaveLength(5);
  expect(chosenAudioCaptureDeviceChoice(choices, "alsa_input.usb-gone.mono")).toEqual(choices.at(-1));
});

test("a saved device the machine lists is chosen by its name, and no device saved is Default input", () => {
  const choices = audioCaptureDeviceChoicesOf({ kind: "listed", devices: STUB_DEVICES }, "stub-speakers.monitor");
  expect(choices).toHaveLength(4);
  expect(chosenAudioCaptureDeviceChoice(choices, "stub-speakers.monitor")?.words).toBe("Monitor of Stub Speakers");
  expect(chosenAudioCaptureDeviceChoice(choices, null)?.words).toBe(DEFAULT_INPUT_WORDS);
  expect(chosenAudioCaptureDeviceChoice(choices, "")?.words).toBe(DEFAULT_INPUT_WORDS);
});

test("while the devices are not listed, or their listing was refused, a saved device shows by its id, not marked as missing", () => {
  for (const devices of [{ kind: "not_listed_yet" }, { kind: "refused", because: "No runtime answers." }] as const) {
    expect(audioCaptureDeviceChoicesOf(devices, "stub-microphone")).toEqual([
      { words: DEFAULT_INPUT_WORDS, device_id: null },
      { words: "stub-microphone", device_id: "stub-microphone" },
    ]);
  }
});

test("a device named like an earlier entry, as ALSA names its default PCM Default input, is told apart by its id", () => {
  const alsaDevices: AudioCaptureDeviceOnTheWire[] = [
    { id: "default", name: "Default input", kind: "input" },
    { id: "pulse", name: "PulseAudio Sound Server", kind: "input" },
    { id: "sysdefault:CARD=USB", name: "USB Audio", kind: "input" },
    { id: "front:CARD=USB,DEV=0", name: "USB Audio", kind: "input" },
  ];
  expect(audioCaptureDeviceChoicesOf({ kind: "listed", devices: alsaDevices }, null).map((choice) => choice.words)).toEqual([
    DEFAULT_INPUT_WORDS,
    "Default input (default)",
    "PulseAudio Sound Server",
    "USB Audio",
    "USB Audio (front:CARD=USB,DEV=0)",
  ]);
});
