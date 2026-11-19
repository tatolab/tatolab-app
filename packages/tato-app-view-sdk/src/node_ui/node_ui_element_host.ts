// What a node UI element may ask the Studio. It grows only when a first-party element needs more.

import type { BuiltInPinTypeName } from "../pin_types.js";
import type { AssetPreviewReading, ProjectAssetsReading } from "../studio_readings.js";
import type { ProjectAssetPickEnding, StopWatching } from "../tato_app_view_connection.js";
import type { ProjectAssetPick } from "../view_wire_messages.js";
import type { ControlledPin, InputControlElement } from "./input_control_element.js";

/** The Studio, as a control or a node body reaches it through its `pin`; each ask is of the project the input's stream is in. */
export interface NodeUiElementHost {
  /** Have the person choose an asset of the project in the Studio's asset picker, answered once it closes. */
  pickAProjectAsset(pick: ProjectAssetPick): Promise<ProjectAssetPickEnding>;
  /** The preview picture of the project's asset `asset`, by its UUID, or why none is read, in the Studio's or the runtime's words. */
  readAssetPreview(asset: string): Promise<AssetPreviewReading>;
  /** The project's assets as the runtime lists them, at once and on each change. */
  watchProjectAssets(listener: (reading: ProjectAssetsReading) => void): StopWatching;
  /** The control the table picks for `pin`, defined and ready to connect; a control that holds another asks for it here. */
  inputControlFor(pin: ControlledPin<BuiltInPinTypeName>): Promise<InputControlElement<BuiltInPinTypeName>>;
}
