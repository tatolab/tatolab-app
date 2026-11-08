// The mock's port viewers: an Image port plays a drawn test pattern as `VideoFrame`s, the way the
// app's main process hands a runtime frame over as a shared texture; any other family reports each
// message's size.

import type { PortFamily, PortViewerEvent, PortViewerImageFrameFacts, PortViewerTarget } from "../../shared/tatolab_backend_contract";

const MOCK_IMAGE_FRAME_EVERY_MILLISECONDS = 33;
const MOCK_MESSAGE_EVERY_MILLISECONDS = 250;
const MOCK_IMAGE_FRAME_WIDTH = 640;
const MOCK_IMAGE_FRAME_HEIGHT = 360;
const MOCK_PAYLOAD_BYTE_LENGTHS_BY_FAMILY: Partial<Record<PortFamily, number>> = { channels: 3840, records: 96, packets: 1400, array: 4096 };

/** Every port viewer the mock's window opened, each playing until closed. */
export class MockPortViewers {
  private readonly stopPlayingByPortViewer = new Map<string, () => void>();
  private readonly eventListeners = new Set<(event: PortViewerEvent) => void>();
  private readonly imageFrameListeners = new Set<(videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => void>();
  private portViewersOpened = 0;

  /** Open a port viewer of `target`, whose port carries `portFamily`, answering the id its events arrive under. */
  open(target: PortViewerTarget, portFamily: PortFamily | null): string {
    this.portViewersOpened += 1;
    const portViewer = `port-viewer-${this.portViewersOpened}`;
    const playing = portFamily === "image" ? this.playATestPattern(portViewer, target) : this.reportMessages(portViewer, portFamily);
    this.stopPlayingByPortViewer.set(portViewer, playing);
    return portViewer;
  }

  close(portViewer: string): void {
    this.stopPlayingByPortViewer.get(portViewer)?.();
    this.stopPlayingByPortViewer.delete(portViewer);
  }

  onEvent(listener: (event: PortViewerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onImageFrame(listener: (videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => void): () => void {
    this.imageFrameListeners.add(listener);
    return () => this.imageFrameListeners.delete(listener);
  }

  private playATestPattern(portViewer: string, target: PortViewerTarget): () => void {
    if (typeof OffscreenCanvas === "undefined" || typeof VideoFrame === "undefined") {
      const timer = window.setTimeout(() => {
        for (const listener of this.eventListeners) listener({ port_viewer: portViewer, kind: "ended", because: "This page has no WebCodecs VideoFrame to play the mock's frames." });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const testPatternCanvas = new OffscreenCanvas(MOCK_IMAGE_FRAME_WIDTH, MOCK_IMAGE_FRAME_HEIGHT);
    const drawing = testPatternCanvas.getContext("2d");
    let framesDrawn = 0;
    const timer = window.setInterval(() => {
      if (drawing === null) return;
      framesDrawn += 1;
      drawAMockTestPattern(drawing, framesDrawn, `${target.node} › ${target.port}`);
      const frameFacts: PortViewerImageFrameFacts = { port_viewer: portViewer, format_wire_name: "bgra32", skipped_since_last_read: 0 };
      for (const listener of this.imageFrameListeners) {
        listener(new VideoFrame(testPatternCanvas, { timestamp: framesDrawn * MOCK_IMAGE_FRAME_EVERY_MILLISECONDS * 1000 }), frameFacts);
      }
    }, MOCK_IMAGE_FRAME_EVERY_MILLISECONDS);
    return () => window.clearInterval(timer);
  }

  private reportMessages(portViewer: string, portFamily: PortFamily | null): () => void {
    const timer = window.setInterval(() => {
      const event: PortViewerEvent = {
        port_viewer: portViewer,
        kind: "message",
        port_family: portFamily ?? "bytes",
        payload_byte_length: (portFamily === null ? undefined : MOCK_PAYLOAD_BYTE_LENGTHS_BY_FAMILY[portFamily]) ?? 64,
        skipped_since_last_read: 0,
      };
      for (const listener of this.eventListeners) listener(event);
    }, MOCK_MESSAGE_EVERY_MILLISECONDS);
    return () => window.clearInterval(timer);
  }
}

function drawAMockTestPattern(drawing: OffscreenCanvasRenderingContext2D, framesDrawn: number, label: string): void {
  const barColours = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
  const barWidth = MOCK_IMAGE_FRAME_WIDTH / barColours.length;
  barColours.forEach((barColour, barIndex) => {
    drawing.fillStyle = barColour;
    drawing.fillRect(barIndex * barWidth, 0, barWidth, MOCK_IMAGE_FRAME_HEIGHT);
  });
  const sweepX = (framesDrawn * 6) % MOCK_IMAGE_FRAME_WIDTH;
  drawing.fillStyle = "#ffffff";
  drawing.fillRect(sweepX, 0, 4, MOCK_IMAGE_FRAME_HEIGHT);
  drawing.fillStyle = "rgba(0, 0, 0, 0.6)";
  drawing.fillRect(0, MOCK_IMAGE_FRAME_HEIGHT - 44, MOCK_IMAGE_FRAME_WIDTH, 44);
  drawing.fillStyle = "#ffffff";
  drawing.font = "20px monospace";
  drawing.fillText(`${label}  frame ${framesDrawn}`, 16, MOCK_IMAGE_FRAME_HEIGHT - 16);
}
