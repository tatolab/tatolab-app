import { expect, test } from "vitest";
import { sharedTextureImportOfARuntimeViewerFrame, type RuntimeViewerImageFrame } from "./runtime_viewer_image_frame_import.js";

const LINUX_DMA_BUF_FRAME: RuntimeViewerImageFrame = {
  heldFrameId: 7,
  width: 1920,
  height: 1080,
  formatWireName: "bgra32",
  electronPixelFormat: "bgra",
  bytesPerRow: 7680,
  dmaBufPlanes: [{ fd: 41, stride: 7680, offset: 0, size: 8_294_400 }],
  dmaBufModifier: "0",
  cpuReadBytes: null,
  ioSurface: null,
};

test("a_dma_buf_frame_imports_as_a_native_pixmap_with_its_planes_and_modifier", () => {
  const sharedTextureImport = sharedTextureImportOfARuntimeViewerFrame(LINUX_DMA_BUF_FRAME, 2_500_000_000);

  expect(sharedTextureImport).toEqual({
    ok: true,
    value: {
      pixelFormat: "bgra",
      codedSize: { width: 1920, height: 1080 },
      timestamp: 2_500_000,
      handle: { nativePixmap: { planes: [{ fd: 41, stride: 7680, offset: 0, size: 8_294_400 }], modifier: "0", supportsZeroCopyWebGpuImport: false } },
    },
  });
});

test("an_io_surface_frame_imports_as_its_io_surface", () => {
  const ioSurface = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const macFrame: RuntimeViewerImageFrame = { ...LINUX_DMA_BUF_FRAME, dmaBufPlanes: null, dmaBufModifier: null, ioSurface };

  const sharedTextureImport = sharedTextureImportOfARuntimeViewerFrame(macFrame, 0);

  expect(sharedTextureImport.ok && sharedTextureImport.value.handle).toEqual({ ioSurface });
});

test("a_frame_in_a_format_electron_cannot_import_says_so_by_its_wire_name", () => {
  const rgba16Frame: RuntimeViewerImageFrame = { ...LINUX_DMA_BUF_FRAME, formatWireName: "rgba64", electronPixelFormat: null };

  expect(sharedTextureImportOfARuntimeViewerFrame(rgba16Frame, 0)).toEqual({ ok: false, failure: "Electron cannot import a rgba64 frame as a shared texture" });
});

test("a_frame_that_crossed_as_cpu_readable_memory_has_no_shared_texture_import", () => {
  const cpuReadFrame: RuntimeViewerImageFrame = { ...LINUX_DMA_BUF_FRAME, dmaBufPlanes: null, dmaBufModifier: null, cpuReadBytes: Buffer.alloc(16) };

  expect(sharedTextureImportOfARuntimeViewerFrame(cpuReadFrame, 0)).toEqual({
    ok: false,
    failure: "the 1920x1080 bgra32 frame crossed as CPU-readable memory, which no shared texture imports",
  });
});
