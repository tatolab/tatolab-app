// What a node UI element may ask the Studio. It grows only when a first-party element needs more.

import type { BuiltInPinTypeName } from "../pin_types.js";
import type { AssetPreviewReading, AudioCaptureDevicesReading, ProjectAssetsReading } from "../studio_readings.js";
import type { ProjectAssetPickEnding, StopWatching } from "../tato_app_view_connection.js";
import type { ProjectAssetPick, ViewInputEvent } from "../view_wire_messages.js";
import type { ControlledPin, InputControlElement } from "./input_control_element.js";

/** The Studio, as a control or a node body reaches it through its `pin`; each ask is of the project the input's stream is in. */
export interface NodeUiElementHost {
  /** Have the person choose an asset of the project in the Studio's asset picker, answered once it closes. */
  pickAProjectAsset(pick: ProjectAssetPick): Promise<ProjectAssetPickEnding>;
  /** The preview picture of the project's asset `asset`, by its UUID, or why none is read, in the Studio's or the runtime's words. */
  readAssetPreview(asset: string): Promise<AssetPreviewReading>;
  /** The project's assets as the runtime lists them, at once and on each change. */
  watchProjectAssets(listener: (reading: ProjectAssetsReading) => void): StopWatching;
  /** The machine's audio inputs and the monitors of its outputs, each by the id a String naming one takes, or why they were not listed: at once, and again each time the runtime starts after it was down. */
  watchAudioCaptureDevices(listener: (reading: AudioCaptureDevicesReading) => void): StopWatching;
  /**
   * What the output wired into the input `input` carries, read through that output's port viewer, at once and as each frame or
   * message arrives; an Image frame arrives as a `VideoFrame` the element closes once drawn. When nothing is wired in, or the
   * wire is one Studio does not read, the element is told why; a control is told of its own input alone.
   */
  watchWhatIsWiredInto(input: string, onEvent: (event: ViewInputEvent) => void): StopWatching;
  /** The control the table picks for `pin`, defined and ready to connect; a control that holds another asks for it here. */
  inputControlFor(pin: ControlledPin<BuiltInPinTypeName>): Promise<InputControlElement<BuiltInPinTypeName>>;
}
