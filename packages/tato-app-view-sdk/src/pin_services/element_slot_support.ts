// What a control's slot and a node body's slot share: how a gesture on an input ends, what an element
// reaches of the project, the read-only line a slot draws for an element that does not load, and the
// mark on a slot that draws its element while a registration bearing on it is blocked: that element's
// newer version, or another module's registration for the same key, which the table passed over.

import type { ControlledInput } from "../pin_model/controlled_inputs.js";
import type { NodeUiSurface } from "../node_ui/input_control_element.js";
import type { NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import type { NodeUiRegistrationPassedOver } from "../node_ui/node_ui_control_table.js";
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
export type ProjectAControlReaches = Pick<
  TatoAppViewConnection,
  "pickAProjectAsset" | "readAssetPreviewInTheProject" | "watchProjectAssets" | "watchPortViewer" | "listAudioCaptureDevices" | "watchListedStreams"
>;

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

/**
 * The attribute a slot's host carries while it draws its element and a registration bearing on it is blocked: the element's
 * newer version, or another module's registration for the same key; the host's `title` gives why.
 */
export const BLOCKED_REGISTRATION_ATTRIBUTE = "data-blocked-registration";

/** Marks `host` as drawing its element while the registrations `lines` give why of are blocked, or takes the mark off for none. */
export function markTheBlockedRegistrations(host: HTMLElement, lines: readonly string[]): void {
  if (lines.length === 0) {
    host.removeAttribute(BLOCKED_REGISTRATION_ATTRIBUTE);
    host.removeAttribute("title");
    return;
  }
  host.setAttribute(BLOCKED_REGISTRATION_ATTRIBUTE, "");
  host.title = lines.join("\n");
}

/** The words a slot's mark gives for a registration the table passed over: the findings of its folder's check when they block it, otherwise the table's reason. */
export function wordsOfTheRegistrationPassedOver({ listed, because }: NodeUiRegistrationPassedOver): string {
  if (listed.script_serving.kind === "served") return because;
  return `${listed.module}'s ${listed.script} does not pass its checks: ${listed.script_serving.findings.join("; ")}`;
}

/** The words a read-only line gives for an element that did not load. */
export function whyTheElementDidNotLoad(loading: Exclude<NodeUiElementLoading, { kind: "defined" }>): string {
  return loading.kind === "blocked" ? `Its control does not pass its checks: ${loading.findings.join("; ")}` : loading.because;
}
