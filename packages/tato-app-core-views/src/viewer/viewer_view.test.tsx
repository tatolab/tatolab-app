import type { PortViewerEvent, TatoAppViewConnection, WhenStudioRefuses } from "@tatolab/tato-app-view-sdk";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PortViewerPicture } from "./viewer_view";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const CAMERA_VIDEO = { stream: "studio", node_id: "camera-id", port: "video" };

let animationFramesWaiting = new Map<number, FrameRequestCallback>();
let framesDrawn = 0;
const mountedRoots: Root[] = [];

function runTheAnimationFrames(): void {
  const running = animationFramesWaiting;
  animationFramesWaiting = new Map();
  for (const callback of running.values()) callback(performance.now());
}

beforeEach(() => {
  let nextRequest = 1;
  animationFramesWaiting = new Map();
  framesDrawn = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFramesWaiting.set(nextRequest, callback);
    return nextRequest++;
  });
  vi.stubGlobal("cancelAnimationFrame", (request: number) => animationFramesWaiting.delete(request));
  const drawing: Record<PropertyKey, unknown> = { clearRect: () => undefined, drawImage: () => (framesDrawn += 1), putImageData: () => undefined };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => new Proxy(Object.create(null), { get: (_target, property) => drawing[property] }));
});

afterEach(() => {
  for (const root of mountedRoots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function aVideoFrameThatCountsItsCloses(): { videoFrame: VideoFrame; closes: () => number } {
  let closes = 0;
  const facts: Record<PropertyKey, unknown> = { displayWidth: 64, displayHeight: 36, close: () => (closes += 1) };
  const videoFrame: VideoFrame = new Proxy(Object.create(null), { get: (_target, property) => facts[property] });
  return { videoFrame, closes: () => closes };
}

/** The Viewer's picture of an Image port, mounted on a connection that hands its port viewer's watch to the test. */
function theViewerMountedOnAnImagePort() {
  let onEvent: ((event: PortViewerEvent) => void) | null = null;
  let whenRefused: WhenStudioRefuses | null = null;
  const watchPortViewer: TatoAppViewConnection["watchPortViewer"] = (_target, listener, refusal) => {
    onEvent = listener;
    whenRefused = refusal ?? null;
    return () => undefined;
  };
  const connection: TatoAppViewConnection = new Proxy(Object.create(null), { get: (_target, property) => (property === "watchPortViewer" ? watchPortViewer : undefined) });
  const holder = document.createElement("div");
  document.body.append(holder);
  const root = createRoot(holder);
  act(() =>
    root.render(
      <PortViewerPicture
        connection={connection}
        target={CAMERA_VIDEO}
        nodeName="camera"
        portWords="camera › video"
        streamFactsOfThePort={{ stream_facts: null, values_checked: false, family: "image" }}
        isTheNodeNotReady={false}
      />,
    ),
  );
  mountedRoots.push(root);
  const framesArriving = [aVideoFrameThatCountsItsCloses(), aVideoFrameThatCountsItsCloses(), aVideoFrameThatCountsItsCloses()];
  for (const frame of framesArriving) act(() => onEvent?.({ kind: "image_frame", video_frame: frame.videoFrame, format_wire_name: "bgra32", skipped_since_last_read: 0 }));
  return {
    framesArriving,
    send: (event: PortViewerEvent) => act(() => onEvent?.(event)),
    refuse: (because: string) => act(() => whenRefused?.(because)),
    unmount: () => {
      mountedRoots.splice(mountedRoots.indexOf(root), 1);
      act(() => root.unmount());
    },
  };
}

test("while_the_display_has_not_drawn_each_frame_passed_over_is_closed_at_once_and_the_latest_once_drawn", () => {
  const viewer = theViewerMountedOnAnImagePort();
  expect(viewer.framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 0]);
  expect(framesDrawn).toBe(0);
  act(() => runTheAnimationFrames());
  expect(viewer.framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 1]);
  expect(framesDrawn).toBe(1);
});

test("a_viewer_taken_away_before_the_display_draws_closes_the_waiting_frame_and_draws_nothing", () => {
  const viewer = theViewerMountedOnAnImagePort();
  viewer.unmount();
  act(() => runTheAnimationFrames());
  expect(viewer.framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 1]);
  expect(framesDrawn).toBe(0);
});

test("a_watch_that_ends_before_the_display_draws_closes_the_waiting_frame_and_draws_nothing", () => {
  const ended = theViewerMountedOnAnImagePort();
  ended.send({ kind: "ended", because: "camera stopped", recovery: "shows_once_the_node_runs" });
  const refused = theViewerMountedOnAnImagePort();
  refused.refuse("no node named `camera` in stream `studio`");
  act(() => runTheAnimationFrames());
  expect(ended.framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 1]);
  expect(refused.framesArriving.map((frame) => frame.closes())).toEqual([1, 1, 1]);
  expect(framesDrawn).toBe(0);
});
