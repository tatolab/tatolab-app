// How a picture a port viewer delivers is drawn onto a canvas: an Image frame as the `VideoFrame` it
// arrives as, or as its pixels in a four-byte format. Whatever reads a port's pictures draws them so.

import type { PortViewerEvent } from "./view_wire_messages.js";

const BGRA_BYTE_ORDER_FORMAT_WIRE_NAMES = new Set(["bgra32", "bgra8_unorm", "bgra8_unorm_srgb"]);
const RGBA_BYTE_ORDER_FORMAT_WIRE_NAMES = new Set(["rgba32", "rgba8_unorm", "rgba8_unorm_srgb"]);

const imageDataReusedByEachCanvas = new WeakMap<HTMLCanvasElement, ImageData>();

/** A picture a port viewer delivers: an Image frame as its `VideoFrame`, or as its pixels. */
export type PortViewerPicture = Extract<PortViewerEvent, { kind: "image_frame" | "image_pixels" }>;

/**
 * Draw `videoFrame` onto `canvas`, sized to it; the caller closes the frame. The canvas is cleared first, because drawing
 * composites over what it holds, so a transparent frame would leave the last picture showing.
 */
export function drawThePortViewerFrame(canvas: HTMLCanvasElement, videoFrame: VideoFrame): void {
  const drawing = canvas.getContext("2d");
  if (drawing === null) return;
  if (canvas.width !== videoFrame.displayWidth) canvas.width = videoFrame.displayWidth;
  if (canvas.height !== videoFrame.displayHeight) canvas.height = videoFrame.displayHeight;
  drawing.clearRect(0, 0, canvas.width, canvas.height);
  drawing.drawImage(videoFrame, 0, 0);
}

/** Draw `pixels`, rows of `bytesPerRow` in a four-byte BGRA or RGBA format, onto `canvas`; `false` for any other format. */
export function drawThePortViewerPixels(canvas: HTMLCanvasElement, width: number, height: number, formatWireName: string, bytesPerRow: number, pixels: Uint8Array): boolean {
  const isBgra = BGRA_BYTE_ORDER_FORMAT_WIRE_NAMES.has(formatWireName);
  if (!isBgra && !RGBA_BYTE_ORDER_FORMAT_WIRE_NAMES.has(formatWireName)) return false;
  const drawing = canvas.getContext("2d");
  if (drawing === null) return false;
  let imageData = imageDataReusedByEachCanvas.get(canvas);
  if (imageData === undefined || imageData.width !== width || imageData.height !== height) {
    imageData = new ImageData(width, height);
    imageDataReusedByEachCanvas.set(canvas, imageData);
  }
  const rowByteLength = width * 4;
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * bytesPerRow;
    imageData.data.set(pixels.subarray(rowStart, Math.min(rowStart + rowByteLength, pixels.length)), row * rowByteLength);
  }
  if (isBgra) {
    // Each pixel read as one little-endian word holds blue in its low byte and red in its third, so swapping those two makes it RGBA; every machine Studio runs on is little-endian.
    const pixelWords = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, width * height);
    for (let pixel = 0; pixel < pixelWords.length; pixel += 1) {
      const word = pixelWords[pixel] ?? 0;
      pixelWords[pixel] = (word & 0xff00ff00) | ((word & 0xff) << 16) | ((word >>> 16) & 0xff);
    }
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  drawing.putImageData(imageData, 0, 0);
  return true;
}

function closeTheFrameOf(picture: PortViewerPicture): void {
  if (picture.kind === "image_frame") picture.video_frame.close();
}

/**
 * Draws onto `canvas` the latest picture a port viewer delivered, once the display next draws: a port writes faster than a
 * window can draw, so a picture passed over before then is dropped, its `VideoFrame` closed, rather than queued behind the others.
 */
export class LatestPortViewerPictureDrawnEachAnimationFrame {
  readonly #canvas: HTMLCanvasElement;
  readonly #whenDrawn: (picture: PortViewerPicture, isDrawn: boolean) => void;
  #pictureWaitingToBeDrawn: PortViewerPicture | null = null;
  #animationFrameRequested: number | null = null;

  /** `whenDrawn` hears each picture drawn, and whether its format could be. */
  constructor(canvas: HTMLCanvasElement, whenDrawn: (picture: PortViewerPicture, isDrawn: boolean) => void) {
    this.#canvas = canvas;
    this.#whenDrawn = whenDrawn;
  }

  /** Draw `picture` once the display next draws, in place of any picture still waiting; this owns its `VideoFrame` from now on. */
  drawOnTheNextAnimationFrame(picture: PortViewerPicture): void {
    const passedOver = this.#pictureWaitingToBeDrawn;
    if (passedOver !== null) closeTheFrameOf(passedOver);
    const skippedSinceLastDrawn = picture.skipped_since_last_read + (passedOver === null ? 0 : passedOver.skipped_since_last_read + 1);
    this.#pictureWaitingToBeDrawn = { ...picture, skipped_since_last_read: skippedSinceLastDrawn };
    this.#animationFrameRequested ??= requestAnimationFrame(() => this.#drawTheWaitingPicture());
  }

  /** Drop the picture waiting to be drawn, closing its `VideoFrame`. */
  dropTheWaitingPicture(): void {
    if (this.#animationFrameRequested !== null) cancelAnimationFrame(this.#animationFrameRequested);
    this.#animationFrameRequested = null;
    if (this.#pictureWaitingToBeDrawn !== null) closeTheFrameOf(this.#pictureWaitingToBeDrawn);
    this.#pictureWaitingToBeDrawn = null;
  }

  #drawTheWaitingPicture(): void {
    this.#animationFrameRequested = null;
    const picture = this.#pictureWaitingToBeDrawn;
    this.#pictureWaitingToBeDrawn = null;
    if (picture === null) return;
    if (picture.kind === "image_frame") {
      drawThePortViewerFrame(this.#canvas, picture.video_frame);
      picture.video_frame.close();
      this.#whenDrawn(picture, true);
      return;
    }
    this.#whenDrawn(picture, drawThePortViewerPixels(this.#canvas, picture.width, picture.height, picture.format_wire_name, picture.bytes_per_row, picture.pixels));
  }
}
