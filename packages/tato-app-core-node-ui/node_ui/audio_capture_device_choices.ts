// What a setting naming an audio capture device offers in its menu, from the machine's devices as
// the runtime's `list_audio_capture_devices` lists them: Default input, the empty id, on which the
// backend opens its own default, then each device, and a saved id the machine does not list, kept
// and marked as missing.

import type { AudioCaptureDeviceOnTheWire } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The words of the menu's first entry, the backend's default device. */
export const DEFAULT_INPUT_WORDS = "Default input";

/** The machine's devices as the menu holds them: listed, not listed yet, or refused in Studio's or the runtime's words. */
export type AudioCaptureDevicesForTheDeviceMenu = { kind: "listed"; devices: readonly AudioCaptureDeviceOnTheWire[] } | { kind: "not_listed_yet" } | { kind: "refused"; because: string };

/** One entry of the menu: its words, and the id it sets, the empty id for the backend's default. */
export interface AudioCaptureDeviceChoice {
  readonly words: string;
  readonly device_id: string;
}

/** The menu's entries for a setting holding `savedDeviceId`, given the machine's `devices`; each entry's words are its own, as the menu keys it by them. */
export function audioCaptureDeviceChoicesOf(devices: AudioCaptureDevicesForTheDeviceMenu, savedDeviceId: string): AudioCaptureDeviceChoice[] {
  const choices: AudioCaptureDeviceChoice[] = [{ words: DEFAULT_INPUT_WORDS, device_id: "" }];
  const listed = devices.kind === "listed" ? devices.devices : [];
  for (const device of listed) {
    const wordsTaken = choices.some((choice) => choice.words === device.name);
    choices.push({ words: wordsTaken ? `${device.name} (${device.id})` : device.name, device_id: device.id });
  }
  if (savedDeviceId !== "" && !listed.some((device) => device.id === savedDeviceId)) {
    choices.push({ words: devices.kind === "listed" ? `${savedDeviceId} (missing)` : savedDeviceId, device_id: savedDeviceId });
  }
  return choices;
}

/** The entry of `choices` the setting holding `savedDeviceId` shows as chosen. */
export function chosenAudioCaptureDeviceChoice(choices: readonly AudioCaptureDeviceChoice[], savedDeviceId: string): AudioCaptureDeviceChoice | undefined {
  return choices.find((choice) => choice.device_id === savedDeviceId);
}
