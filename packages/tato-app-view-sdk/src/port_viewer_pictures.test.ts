import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { drawThePortViewerPixels, LatestPortViewerPictureDrawnEachAnimationFrame, type PortViewerPicture } from "./port_viewer_pictures.js";

class ImageDataCountingItsAllocations {
  static allocations = 0;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    ImageDataCountingItsAllocations.allocations += 1;
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** A canvas that counts each resize, which drops its backing store, and keeps each picture put on it. */
function aCanvasCountingItsResizes() {
  let resizes = 0;
  const picturesPut: Uint8ClampedArray[] = [];
  const drawing = {
    putImageData: (imageData: ImageDataCountingItsAllocations) => picturesPut.push(Uint8ClampedArray.from(imageData.data)),
    drawImage: () => undefined,
    clearRect: () => undefined,
  };
  const facts: Record<PropertyKey, unknown> = { width: 0, height: 0, getContext: () => drawing };
  const canvas: HTMLCanvasElement = new Proxy(Object.create(null), {
    get: (_target, property) => facts[property],
    set: (_target, property, value) => {
      if (property === "width" || property === "height") resizes += 1;
      facts[property] = value;
      return true;
    },
  });
  return { canvas, resizes: () => resizes, picturesPut };
}

let animationFramesWaiting = new Map<number, FrameRequestCallback>();

function runTheAnimationFrames(): void {
  const running = animationFramesWaiting;
  animationFramesWaiting = new Map();
  for (const callback of running.values()) callback(0);
}

beforeEach(() => {
  ImageDataCountingItsAllocations.allocations = 0;
  vi.stubGlobal("ImageData", ImageDataCountingItsAllocations);
  let nextRequest = 1;
  animationFramesWaiting = new Map();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFramesWaiting.set(nextRequest, callback);
    return nextRequest++;
  });
  vi.stubGlobal("cancelAnimationFrame", (request: number) => animationFramesWaiting.delete(request));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a_bgra_picture_is_put_on_the_canvas_as_rgba_read_row_by_row_at_its_stride", () => {
  const { canvas, picturesPut } = aCanvasCountingItsResizes();
  const twoRowsOfOnePixelPaddedToEightBytes = new Uint8Array([10, 20, 30, 40, 99, 99, 99, 99, 50, 60, 70, 80, 99, 99, 99, 99]);

  expect(drawThePortViewerPixels(canvas, 1, 2, "bgra8_unorm", 8, twoRowsOfOnePixelPaddedToEightBytes)).toBe(true);
  expect(drawThePortViewerPixels(canvas, 1, 2, "rgba32", 8, twoRowsOfOnePixelPaddedToEightBytes)).toBe(true);

  expect(picturesPut.map((picture) => [...picture])).toEqual([
    [30, 20, 10, 40, 70, 60, 50, 80],
    [10, 20, 30, 40, 50, 60, 70, 80],
  ]);
});

test("a_canvas_drawn_again_at_the_same_size_is_neither_resized_nor_given_a_new_image_data", () => {
  const { canvas, resizes } = aCanvasCountingItsResizes();
  const onePicture = new Uint8Array(4 * 4 * 4);

  for (let picturesDrawn = 0; picturesDrawn < 3; picturesDrawn += 1) drawThePortViewerPixels(canvas, 4, 4, "bgra32", 16, onePicture);

  expect(resizes()).toBe(2);
  expect(ImageDataCountingItsAllocations.allocations).toBe(1);
});

test("a_format_of_another_byte_order_is_not_drawn", () => {
  const { canvas, picturesPut } = aCanvasCountingItsResizes();
  expect(drawThePortViewerPixels(canvas, 2, 2, "nv12", 2, new Uint8Array(6))).toBe(false);
  expect(picturesPut).toEqual([]);
});

test("pixels_shorter_than_their_last_row_reaches_are_not_drawn_so_no_row_of_the_picture_before_shows", () => {
  const { canvas, picturesPut } = aCanvasCountingItsResizes();
  const twoRowsOfOnePixelAtAStrideOfEight = 8 + 4;
  expect(drawThePortViewerPixels(canvas, 1, 2, "bgra32", 8, new Uint8Array(twoRowsOfOnePixelAtAStrideOfEight - 1))).toBe(false);
  expect(drawThePortViewerPixels(canvas, 1, 2, "rgba32", 8, new Uint8Array(twoRowsOfOnePixelAtAStrideOfEight))).toBe(true);
  expect(picturesPut).toHaveLength(1);
});

function picturePixels(formatWireName: string, skippedSinceLastRead: number): PortViewerPicture {
  return { kind: "image_pixels", width: 1, height: 1, format_wire_name: formatWireName, bytes_per_row: 4, pixels: new Uint8Array(4), skipped_since_last_read: skippedSinceLastRead };
}

test("only_the_latest_picture_is_drawn_once_the_display_draws_counting_each_one_passed_over_as_skipped", () => {
  const { canvas, picturesPut } = aCanvasCountingItsResizes();
  const drawn: [number, boolean][] = [];
  const pictureDrawn = new LatestPortViewerPictureDrawnEachAnimationFrame(canvas, (picture, isDrawn) => drawn.push([picture.skipped_since_last_read, isDrawn]));

  pictureDrawn.drawOnTheNextAnimationFrame(picturePixels("bgra32", 0));
  pictureDrawn.drawOnTheNextAnimationFrame(picturePixels("bgra32", 2));
  pictureDrawn.drawOnTheNextAnimationFrame(picturePixels("nv12", 0));
  expect(animationFramesWaiting.size).toBe(1);
  runTheAnimationFrames();

  expect(drawn).toEqual([[4, false]]);
  expect(picturesPut).toEqual([]);
});

test("a_dropped_picture_is_never_drawn", () => {
  const { canvas, picturesPut } = aCanvasCountingItsResizes();
  const pictureDrawn = new LatestPortViewerPictureDrawnEachAnimationFrame(canvas, () => undefined);
  pictureDrawn.drawOnTheNextAnimationFrame(picturePixels("rgba32", 0));
  pictureDrawn.dropTheWaitingPicture();
  runTheAnimationFrames();
  expect(picturesPut).toEqual([]);
});
