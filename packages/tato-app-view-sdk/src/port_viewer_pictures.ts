// How a picture a port viewer delivers is drawn onto a canvas: an Image frame as the `VideoFrame` it
// arrives as, or as its pixels in a four-byte format. Whatever reads a port's pictures draws them so.

const BGRA_BYTE_ORDER_FORMAT_WIRE_NAMES = new Set(["bgra32", "bgra8_unorm", "bgra8_unorm_srgb"]);
const RGBA_BYTE_ORDER_FORMAT_WIRE_NAMES = new Set(["rgba32", "rgba8_unorm", "rgba8_unorm_srgb"]);

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
  const imageData = new ImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const from = row * bytesPerRow + column * 4;
      const to = (row * width + column) * 4;
      imageData.data[to] = pixels[from + (isBgra ? 2 : 0)] ?? 0;
      imageData.data[to + 1] = pixels[from + 1] ?? 0;
      imageData.data[to + 2] = pixels[from + (isBgra ? 0 : 2)] ?? 0;
      imageData.data[to + 3] = pixels[from + 3] ?? 255;
    }
  }
  canvas.width = width;
  canvas.height = height;
  drawing.putImageData(imageData, 0, 0);
  return true;
}
