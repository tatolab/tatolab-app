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

/** Holds each animation frame the preview asks for until the test runs them, as a display that has not drawn yet. */
function animationFramesHeldByTheTest(): { runTheAnimationFrames: () => void; animationFramesAskedFor: () => number } {
  let animationFramesWaiting = new Map<number, FrameRequestCallback>();
  let nextRequest = 1;
  let asked = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    asked += 1;
    animationFramesWaiting.set(nextRequest, callback);
    return nextRequest++;
  });
  vi.stubGlobal("cancelAnimationFrame", (request: number) => animationFramesWaiting.delete(request));
  return {
    runTheAnimationFrames: () => {
      const running = animationFramesWaiting;
      animationFramesWaiting = new Map();
      for (const callback of running.values()) callback(performance.now());
    },
    animationFramesAskedFor: () => asked,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
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

  it("shows the picture that arrives once the display draws and closes its frame", () => {
    const display = animationFramesHeldByTheTest();
    const wire = studioReadingTheWire();
    const control = mountedPreview(wire.studio);
    const picture = partOf<HTMLCanvasElement>(control, ".wire-picture");
    const words = partOf(control, ".wire-words");
    expect(picture.hidden).toBe(true);
    expect(words.textContent).toBe("Waiting for a picture");
    const frame = aVideoFrameThatCountsItsCloses();
    wire.send({ kind: "image_frame", video_frame: frame.videoFrame, format_wire_name: "rgba32", skipped_since_last_read: 0 });
    display.runTheAnimationFrames();
    expect(frame.closes()).toBe(1);
    expect(picture.hidden).toBe(false);
    expect(words.hidden).toBe(true);
  });

  it("keeps only the latest picture while the display has not drawn: each one passed over is closed at once, and the one kept once drawn", () => {
    const display = animationFramesHeldByTheTest();
    const wire = studioReadingTheWire();
    mountedPreview(wire.studio);
    const framesArriving = [aVideoFrameThatCountsItsCloses(), aVideoFrameThatCountsItsCloses(), aVideoFrameThatCountsItsCloses()];
    for (const frame of framesArriving) wire.send({ kind: "image_frame", video_frame: frame.videoFrame, format_wire_name: "rgba32", skipped_since_last_read: 0 });

    expect(framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 0]);
    expect(display.animationFramesAskedFor()).toBe(1);
    display.runTheAnimationFrames();
    expect(framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 1]);
  });

  it("closes the picture waiting to be drawn once it is taken off the page", () => {
    animationFramesHeldByTheTest();
    const wire = studioReadingTheWire();
    const control = mountedPreview(wire.studio);
    const frame = aVideoFrameThatCountsItsCloses();
    wire.send({ kind: "image_frame", video_frame: frame.videoFrame, format_wire_name: "rgba32", skipped_since_last_read: 0 });
    control.remove();
    expect(frame.closes()).toBe(1);
  });

  it("says why it shows no picture: nothing wired in, a viewer that ended, or a format it does not draw", () => {
    const display = animationFramesHeldByTheTest();
    const wire = studioReadingTheWire();
    const control = mountedPreview(wire.studio);
    const words = partOf(control, ".wire-words");
    wire.send({ kind: "unwired", because: "Nothing is wired into video_in." });
    expect(words.textContent).toBe("Nothing is wired into video_in.");
    wire.send({ kind: "ended", because: "camera stopped", recovery: "shows_once_the_node_runs" });
    expect(words.textContent).toBe("camera stopped");
    wire.send({ kind: "image_pixels", width: 2, height: 2, format_wire_name: "nv12", bytes_per_row: 2, pixels: new Uint8Array(6), skipped_since_last_read: 0 });
    display.runTheAnimationFrames();
    expect(words.textContent).toBe("A picture in nv12 is not drawn here.");
    expect(partOf<HTMLCanvasElement>(control, ".wire-picture").hidden).toBe(true);
  });
});
