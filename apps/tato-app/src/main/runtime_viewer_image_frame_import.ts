// What the Tato Studio viewer addon (`native/tatolab-runtime-viewer-frame-import`) hands the main
// process for one runtime viewer, and the shared-texture import Electron makes of an Image frame.
// The addon's objects are its napi-rs bindings; Electron's `sharedTexture.importSharedTexture`
// takes `SharedTextureImportTextureInfo` (electron.d.ts, Electron 44), mirrored here so only
// `electron_adapters/` imports Electron.

import { failedWith, succeeded, type Result } from "./result.js";

/** One plane of a DMA-BUF frame, its fd valid until the frame is released. */
export interface RuntimeViewerDmaBufPlane {
  fd: number;
  stride: number;
  offset: number;
  size: number;
}

/** An Image frame the addon holds claimed against the runtime's reuse until it is released. */
export interface RuntimeViewerImageFrame {
  heldFrameId: number;
  width: number;
  height: number;
  /** The runtime's wire name of the pixel format (`bgra32`, `rgba32`, `nv12`, …). */
  formatWireName: string;
  /** Electron's `pixelFormat` for it, or `null` when Electron cannot import it. */
  electronPixelFormat: string | null;
  bytesPerRow: number;
  /** Linux: each plane's DMA-BUF; `null` when the memory crossed as OPAQUE_FD. */
  dmaBufPlanes: RuntimeViewerDmaBufPlane[] | null;
  /** Linux: Electron's `nativePixmap.modifier` for the planes. */
  dmaBufModifier: string | null;
  /** Linux: the first plane's bytes, copied, for memory that crossed as OPAQUE_FD. */
  cpuReadBytes: Buffer | null;
  /** macOS: the frame's `IOSurfaceRef` pointer bytes. */
  ioSurface: Buffer | null;
}

/** A Channels block's layout as its descriptor states it; the payload holds `channelCount` runs of `samplesPerChannel` samples. */
export interface RuntimeViewerChannelsBlock {
  startSample: number;
  sampleRate: number;
  channelCount: number;
  samplesPerChannel: number;
  /** `f32` or `f64`, or `null` for a sample type the addon does not know. */
  sampleType: string | null;
}

/** One row of an Array frame's attribute table. */
export interface RuntimeViewerArrayAttribute {
  name: string;
  dtype: string;
  shape: number[];
  /** `cpu` for data in the payload, `gpu` for data in a GPU pool slot. */
  residency: string;
  payloadByteOffset: number | null;
  byteLen: number | null;
}

/** The latest message a viewer read from its port. */
export interface RuntimeViewerMessageRead {
  /** `image`, `channels`, `packets`, `records`, `array`, or `bytes` for a payload no family describes. */
  portFamily: string;
  timestampNs: number;
  /** Messages skipped since the previous read, because a viewer reads only the latest. */
  skippedSinceLastRead: number;
  imageFrame: RuntimeViewerImageFrame | null;
  /** The payload as the node wrote it, for every family but Image. */
  payload: Buffer | null;
  /** Whether the message opens a group: a Packets unit's keyframe flag. */
  startsGroup: boolean;
  channelsBlock: RuntimeViewerChannelsBlock | null;
  /** A Packets unit's codec, empty for a plain byte stream. */
  packetsCodec: string | null;
  arrayAttributes: RuntimeViewerArrayAttribute[] | null;
  /** A Records message decoded from its msgpack, as JSON text. */
  recordsJson: string | null;
  /** Why the message did not read as its family states, in the addon's words. */
  unreadableBecause: string | null;
}

/** The addon's reader of one viewer's channel, opened from what `open_viewer` answered. */
export interface RuntimeViewerChannelReaderOfTheAddon {
  readLatestMessage(): Promise<RuntimeViewerMessageRead | null>;
  releaseHeldImageFrame(heldFrameId: number): void;
  close(): void;
}

/** The pixel formats Electron's `sharedTexture` imports. */
export type ElectronSharedTexturePixelFormat = "bgra" | "rgba" | "rgbaf16" | "nv12" | "nv16" | "p010le";

/** Electron's `SharedTextureImportTextureInfo`, as the addon's frame fills it. */
export interface SharedTextureImportOfARuntimeViewerFrame {
  pixelFormat: ElectronSharedTexturePixelFormat;
  codedSize: { width: number; height: number };
  /** Microseconds, which Electron reflects into the `VideoFrame`. */
  timestamp: number;
  handle: { nativePixmap: { planes: RuntimeViewerDmaBufPlane[]; modifier: string; supportsZeroCopyWebGpuImport: boolean } } | { ioSurface: Buffer };
}

const ELECTRON_SHARED_TEXTURE_PIXEL_FORMATS: readonly ElectronSharedTexturePixelFormat[] = ["bgra", "rgba", "rgbaf16", "nv12", "nv16", "p010le"];

function electronSharedTexturePixelFormatNamed(pixelFormatName: string | null): ElectronSharedTexturePixelFormat | null {
  return ELECTRON_SHARED_TEXTURE_PIXEL_FORMATS.find((pixelFormat) => pixelFormat === pixelFormatName) ?? null;
}

/** The shared-texture import of `imageFrame` stamped `timestampNs`, or why it has none: a format Electron cannot import, or memory that crossed only as CPU-readable bytes. */
export function sharedTextureImportOfARuntimeViewerFrame(imageFrame: RuntimeViewerImageFrame, timestampNs: number): Result<SharedTextureImportOfARuntimeViewerFrame, string> {
  const pixelFormat = electronSharedTexturePixelFormatNamed(imageFrame.electronPixelFormat);
  if (pixelFormat === null) return failedWith(`Electron cannot import a ${imageFrame.formatWireName} frame as a shared texture`);
  const shared = { pixelFormat, codedSize: { width: imageFrame.width, height: imageFrame.height }, timestamp: Math.round(timestampNs / 1000) };
  if (imageFrame.ioSurface !== null) return succeeded({ ...shared, handle: { ioSurface: imageFrame.ioSurface } });
  if (imageFrame.dmaBufPlanes !== null && imageFrame.dmaBufPlanes.length > 0 && imageFrame.dmaBufModifier !== null) {
    return succeeded({
      ...shared,
      handle: { nativePixmap: { planes: imageFrame.dmaBufPlanes, modifier: imageFrame.dmaBufModifier, supportsZeroCopyWebGpuImport: false } },
    });
  }
  return failedWith(`the ${imageFrame.width}x${imageFrame.height} ${imageFrame.formatWireName} frame crossed as CPU-readable memory, which no shared texture imports`);
}
