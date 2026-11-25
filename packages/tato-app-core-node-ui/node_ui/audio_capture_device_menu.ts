// The control of a String input annotated `audio_capture_device`: the design system's menu of the
// machine's audio capture devices, as the runtime's `list_audio_capture_devices` lists them, each by
// its name. Choosing an entry other than the one held is one `change` carrying its id, and Default
// input carries the empty id, on which the backend opens its own default; a menu has no move to show
// live, so it fires no `input`. A refused listing is said under the menu.
// The menu is the design system's React part, which the Studio supplies by name. It is drawn from a
// root in the control's own children, which its shadow root shows through a slot so the design
// system's stylesheet applies; the root and the watch of the machine's devices are made as the
// control is connected and ended as it is taken off.

import { PropertyChoiceField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState, type NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { AudioCaptureDevicesReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { audioCaptureDeviceChoicesOf, chosenAudioCaptureDeviceChoice, type AudioCaptureDevicesForTheDeviceMenu } from "./audio_capture_device_choices.ts";

/** The menu's devices from a reading of them. */
function devicesForTheDeviceMenuOf(reading: AudioCaptureDevicesReading): AudioCaptureDevicesForTheDeviceMenu {
  return reading.kind === "listed" ? { kind: "listed", devices: reading.listing.devices } : { kind: "refused", because: reading.because };
}

/** The menu of the machine's audio capture devices, for a String input naming one. */
export default class AudioCaptureDeviceMenu extends HTMLElement implements InputControlElement<"string"> {
  readonly #partElement = document.createElement("div");
  #partRoot: Root | null = null;
  #studio: NodeUiElementHost | null = null;
  #stopWatchingTheDevices: (() => void) | null = null;
  #fieldId = "";
  #label = "";
  #devices: AudioCaptureDevicesForTheDeviceMenu = { kind: "not_listed_yet" };
  #chosen = "";
  #editable = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const slot = document.createElement("slot");
    slot.className = "slot-of-the-part";
    shadow.append(slot);
  }

  set pin({ declaration, studio }: ControlledPin<"string">) {
    this.#studio = studio;
    this.#fieldId = `audio-capture-device-menu-${declaration.input_name}-${crypto.randomUUID()}`;
    this.#label = declaration.label;
    this.#drawThePart();
  }

  set value(deviceId: string) {
    this.#chosen = deviceId;
    this.#drawThePart();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#drawThePart();
  }

  connectedCallback(): void {
    if (this.#partElement.parentNode !== this) this.append(this.#partElement);
    this.#partRoot ??= createRoot(this.#partElement);
    this.#stopWatchingTheDevices ??= this.#studio?.watchAudioCaptureDevices((reading) => this.#devicesRead(reading)) ?? null;
    this.#drawThePart();
  }

  disconnectedCallback(): void {
    this.#stopWatchingTheDevices?.();
    this.#stopWatchingTheDevices = null;
    const partRoot = this.#partRoot;
    this.#partRoot = null;
    partRoot?.unmount();
  }

  #devicesRead(reading: AudioCaptureDevicesReading): void {
    this.#devices = devicesForTheDeviceMenuOf(reading);
    this.#drawThePart();
  }

  #deviceChosen(deviceId: string): void {
    if (!this.#editable || deviceId === this.#chosen) return;
    this.#chosen = deviceId;
    this.#drawThePart();
    fireInputControlEvent(this, "change", deviceId);
  }

  #drawThePart(): void {
    const choices = audioCaptureDeviceChoicesOf(this.#devices, this.#chosen);
    const devices = this.#devices;
    this.#partRoot?.render(
      createElement(
        Fragment,
        null,
        createElement(PropertyChoiceField, {
          fieldId: this.#fieldId,
          words: chosenAudioCaptureDeviceChoice(choices, this.#chosen)?.words ?? "",
          label: this.#label,
          choices: this.#editable ? choices.map((choice) => ({ words: choice.words, onChosen: () => this.#deviceChosen(choice.device_id) })) : undefined,
        }),
        devices.kind === "refused" ? createElement(RefusalLine, { lead: "The machine's audio inputs weren't listed:", words: devices.because, layout: "under_field" }) : null,
      ),
    );
  }
}
