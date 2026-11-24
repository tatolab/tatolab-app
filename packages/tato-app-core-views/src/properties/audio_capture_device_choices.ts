// What a setting naming an audio capture device offers in its menu, from the machine's devices as
// the runtime's `list_audio_capture_devices` lists them: Default input, which unsets the setting
// so the backend opens its own default, then each device, and a saved id the machine does not list,
// kept and marked as missing.

import type { AudioCaptureDeviceOnTheWire, JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The words of the menu's first entry, which unsets the setting. */
export const DEFAULT_INPUT_WORDS = "Default input";

/** The machine's devices as the menu holds them: listed, not listed yet, or refused in Studio's or the runtime's words. */
export type AudioCaptureDevicesForTheDeviceMenu = { kind: "listed"; devices: readonly AudioCaptureDeviceOnTheWire[] } | { kind: "not_listed_yet" } | { kind: "refused"; because: string };

/** One entry of the menu: its words, and the id it sets (`null` unsets the setting). */
export interface AudioCaptureDeviceChoice {
  words: string;
  device_id: string | null;
}

/** The device id `value` saves, `null` for none: a setting holding no string, or an empty one, opens the backend's default. */
function savedDeviceIdOf(value: JsonValue | null): string | null {
  if (value === null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The menu's entries for a setting holding `value`, given the machine's `devices`; each entry's words are its own, as the menu keys it by them. */
export function audioCaptureDeviceChoicesOf(devices: AudioCaptureDevicesForTheDeviceMenu, value: JsonValue | null): AudioCaptureDeviceChoice[] {
  const choices: AudioCaptureDeviceChoice[] = [{ words: DEFAULT_INPUT_WORDS, device_id: null }];
  const listed = devices.kind === "listed" ? devices.devices : [];
  for (const device of listed) {
    const wordsTaken = choices.some((choice) => choice.words === device.name);
    choices.push({ words: wordsTaken ? `${device.name} (${device.id})` : device.name, device_id: device.id });
  }
  const savedDeviceId = savedDeviceIdOf(value);
  if (savedDeviceId !== null && !listed.some((device) => device.id === savedDeviceId)) {
    choices.push({ words: devices.kind === "listed" ? `${savedDeviceId} (missing)` : savedDeviceId, device_id: savedDeviceId });
  }
  return choices;
}

/** The entry of `choices` the setting holding `value` shows as chosen. */
export function chosenAudioCaptureDeviceChoice(choices: readonly AudioCaptureDeviceChoice[], value: JsonValue | null): AudioCaptureDeviceChoice | undefined {
  const savedDeviceId = savedDeviceIdOf(value);
  return choices.find((choice) => choice.device_id === savedDeviceId);
}
