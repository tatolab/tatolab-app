import type { ViewInputEvent } from "@tatolab/tato-app-view-sdk";
import type { ControlledPin, InputControlElementClass, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import WirePreview from "../node_ui/wire_preview.ts";
import { aVideoFrameThatCountsItsCloses, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-wire_preview-test", WirePreview);

/** A Studio that hands the preview's watch to the test, and counts the watches stopped. */
function studioReadingTheWire(): { studio: NodeUiElementHost; send: (event: ViewInputEvent) => void; inputsWatched: string[]; stopped: () => number } {
  let onEvent: ((event: ViewInputEvent) => void) | null = null;
  let stops = 0;
  const inputsWatched: string[] = [];
  const studio: NodeUiElementHost = {
    ...NO_STUDIO_CALLS,
    watchWhatIsWiredInto: (input, listener) => {
      inputsWatched.push(input);
      onEvent = listener;
      return () => (stops += 1);
    },
  };
  return { studio, send: (event) => onEvent?.(event), inputsWatched, stopped: () => stops };
}

function mountedPreview(studio: NodeUiElementHost): WirePreview {
  const control = new WirePreview();
  const pin: ControlledPin<"texture"> = { declaration: { input_name: "video_in", label: "video_in", pin_type: { type: "texture" }, annotations: { control: "preview" }, may_be_unset: false }, surface: "node", studio };
  control.pin = pin;
  control.state = "driven_by_wire";
  control.value = null;
  document.body.append(control);
  return control;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the preview of a Texture input", () => {
  it("is a class the Studio defines for a Texture input", () => {
    expectTypeOf(WirePreview).toExtend<InputControlElementClass<"texture">>();
  });

  it("reads the wire into its own input while it is connected", () => {
    const wire = studioReadingTheWire();
    const control = mountedPreview(wire.studio);
    expect(wire.inputsWatched).toEqual(["video_in"]);
    control.remove();
    expect(wire.stopped()).toBe(1);
  });

  it("shows each picture that arrives and closes its frame", () => {
    const wire = studioReadingTheWire();
    const control = mountedPreview(wire.studio);
    const picture = partOf<HTMLCanvasElement>(control, ".wire-picture");
    const words = partOf(control, ".wire-words");
    expect(picture.hidden).toBe(true);
    expect(words.textContent).toBe("Waiting for a picture");
    const frame = aVideoFrameThatCountsItsCloses();
    wire.send({ kind: "image_frame", video_frame: frame.videoFrame, format_wire_name: "rgba32", skipped_since_last_read: 0 });
    expect(frame.closes()).toBe(1);
    expect(picture.hidden).toBe(false);
    expect(words.hidden).toBe(true);
  });

  it("says why it shows no picture: nothing wired in, a viewer that ended, or a format it does not draw", () => {
    const wire = studioReadingTheWire();
    const control = mountedPreview(wire.studio);
    const words = partOf(control, ".wire-words");
    wire.send({ kind: "unwired", because: "Nothing is wired into video_in." });
    expect(words.textContent).toBe("Nothing is wired into video_in.");
    wire.send({ kind: "ended", because: "camera stopped", recovery: "shows_once_the_node_runs" });
    expect(words.textContent).toBe("camera stopped");
    wire.send({ kind: "image_pixels", width: 2, height: 2, format_wire_name: "nv12", bytes_per_row: 2, pixels: new Uint8Array(6), skipped_since_last_read: 0 });
    expect(words.textContent).toBe("A picture in nv12 is not drawn here.");
    expect(partOf<HTMLCanvasElement>(control, ".wire-picture").hidden).toBe(true);
  });
});
