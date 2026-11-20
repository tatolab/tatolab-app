// What a control's slot and a node body's slot share: how a gesture on an input ends, what an element
// reaches of the project, and the read-only line a slot draws for an element that does not load.

import type { ControlledInput } from "../pin_model/controlled_inputs.js";
import type { NodeUiSurface } from "../node_ui/input_control_element.js";
import type { NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import { ReadOnlyValueLineElement } from "../node_ui/read_only_value_line_element.js";
import type { TatoAppViewConnection } from "../tato_app_view_connection.js";

/**
 * How a gesture on an input ends: in one commit, recorded in the project's history, its moves each sent live; in one commit
 * alone, its moves shown and sent nowhere; or in its last live value, recorded nowhere. Perform plays a show, so a gesture
 * there ends live; on every other surface it ends in a commit. A setting its node reads as it is set up is rebuilt by each
 * value it takes, so a gesture on it ends in a commit alone, on every surface.
 */
export type InputValueRelease = "commit" | "commit_alone" | "live";

/** How a gesture on `input` ends on `surface`. */
export function releaseOfAGestureOn(surface: NodeUiSurface, input: Pick<ControlledInput, "rebuilds_its_node">): InputValueRelease {
  if (input.rebuilds_its_node) return "commit_alone";
  return surface === "perform" ? "live" : "commit";
}

/** What a control asks of the project an input's stream is in, through the frame's connection. */
export type ProjectAControlReaches = Pick<TatoAppViewConnection, "pickAProjectAsset" | "readAssetPreviewInTheProject" | "watchProjectAssets" | "watchPortViewer">;

/** The tag the read-only line is defined under in a frame. */
const READ_ONLY_VALUE_LINE_TAG = "tato-studio-read-only-value-line";

/** A new read-only line, defined in the page the first time one is drawn. */
export function newReadOnlyValueLine(because: string): ReadOnlyValueLineElement {
  if (customElements.get(READ_ONLY_VALUE_LINE_TAG) === undefined) customElements.define(READ_ONLY_VALUE_LINE_TAG, class extends ReadOnlyValueLineElement {});
  const line = document.createElement(READ_ONLY_VALUE_LINE_TAG);
  if (!(line instanceof ReadOnlyValueLineElement)) throw new Error(`${READ_ONLY_VALUE_LINE_TAG} is defined by another copy of the SDK`);
  line.because = because;
  return line;
}

/** The words a read-only line gives for an element that did not load. */
export function whyTheElementDidNotLoad(loading: Exclude<NodeUiElementLoading, { kind: "defined" }>): string {
  return loading.kind === "blocked" ? `Its control does not pass its checks: ${loading.findings.join("; ")}` : loading.because;
}
