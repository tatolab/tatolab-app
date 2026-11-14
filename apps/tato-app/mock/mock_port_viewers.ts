// The mock's port viewers: an Image port plays a drawn test pattern as `VideoFrame`s, the way the
// app's main process hands a runtime frame over as a shared texture; any other family plays
// readings the way the main process reads them: a stereo tone as Channels, a detection as Records,
// a point cloud's attributes as Array, and an encoder's units, a keyframe each second, as Packets.

import type {
  PortFamily,
  PortViewerChannelWaveform,
  PortViewerEvent,
  PortViewerImageFrameFacts,
  PortViewerMessageReading,
  PortViewerTarget,
} from "../src/shared/tatolab_backend_contract";

const MOCK_IMAGE_FRAME_EVERY_MILLISECONDS = 33;
const MOCK_MESSAGE_EVERY_MILLISECONDS = 33;
const MOCK_IMAGE_FRAME_WIDTH = 640;
const MOCK_IMAGE_FRAME_HEIGHT = 360;
const MOCK_CHANNELS_SAMPLE_RATE = 48_000;
const MOCK_CHANNELS_SAMPLES_PER_BLOCK = 1_600;
const MOCK_CHANNELS_WAVEFORM_COLUMNS = 400;
const MOCK_PACKETS_KEYFRAME_EVERY_UNITS = 30;

function mockWaveformOfATone(frequencyHz: number, amplitude: number, firstSample: number): PortViewerChannelWaveform {
  const samplesPerColumn = MOCK_CHANNELS_SAMPLES_PER_BLOCK / MOCK_CHANNELS_WAVEFORM_COLUMNS;
  const columnMinimums: number[] = [];
  const columnMaximums: number[] = [];
  let sumOfSquares = 0;
  for (let column = 0; column < MOCK_CHANNELS_WAVEFORM_COLUMNS; column += 1) {
    let columnMinimum = Number.POSITIVE_INFINITY;
    let columnMaximum = Number.NEGATIVE_INFINITY;
    for (let sampleInColumn = 0; sampleInColumn < samplesPerColumn; sampleInColumn += 1) {
      const sampleIndex = firstSample + column * samplesPerColumn + sampleInColumn;
      const sample = amplitude * Math.sin((2 * Math.PI * frequencyHz * sampleIndex) / MOCK_CHANNELS_SAMPLE_RATE);
      columnMinimum = Math.min(columnMinimum, sample);
      columnMaximum = Math.max(columnMaximum, sample);
      sumOfSquares += sample * sample;
    }
    columnMinimums.push(columnMinimum);
    columnMaximums.push(columnMaximum);
  }
  return { column_minimums: columnMinimums, column_maximums: columnMaximums, peak: amplitude, rms: Math.sqrt(sumOfSquares / MOCK_CHANNELS_SAMPLES_PER_BLOCK) };
}

/** The mock's `messagesRead`th message of a port carrying `portFamily`. */
export function mockPortViewerMessageReading(portFamily: PortFamily | null, messagesRead: number): PortViewerMessageReading {
  if (portFamily === "channels") {
    const startSample = messagesRead * MOCK_CHANNELS_SAMPLES_PER_BLOCK;
    return {
      family: "channels",
      start_sample: startSample,
      sample_rate: MOCK_CHANNELS_SAMPLE_RATE,
      channel_count: 2,
      samples_per_channel: MOCK_CHANNELS_SAMPLES_PER_BLOCK,
      sample_type: "f32",
      channel_waveforms: [mockWaveformOfATone(120, 0.8, startSample), mockWaveformOfATone(180, 0.45, startSample)],
      channel_samples: [new Float32Array(MOCK_CHANNELS_SAMPLES_PER_BLOCK), new Float32Array(MOCK_CHANNELS_SAMPLES_PER_BLOCK)],
    };
  }
  if (portFamily === "records") {
    return {
      family: "records",
      record: { label: "face", score: Math.round((0.9 + 0.05 * Math.sin(messagesRead / 10)) * 1000) / 1000, frame: messagesRead, box: { x: 412 + (messagesRead % 40), y: 188, width: 160, height: 160 } },
    };
  }
  if (portFamily === "packets") {
    const startsGroup = messagesRead % MOCK_PACKETS_KEYFRAME_EVERY_UNITS === 0;
    return { family: "packets", codec: "avc1.64001f", byte_length: startsGroup ? 48_000 : 3_000 + ((messagesRead * 977) % 4_000), starts_group: startsGroup, timestamp_ns: messagesRead * 33_333_333 };
  }
  if (portFamily === "array") {
    const sweep = Math.sin(messagesRead / 15);
    return {
      family: "array",
      attributes: [
        { name: "P", dtype: "float32", shape: [2048, 3], residency: "cpu", statistics: { element_count: 6144, minimum: -1 + 0.1 * sweep, maximum: 1 + 0.1 * sweep, mean: 0.02 * sweep } },
        { name: "Cd", dtype: "float32", shape: [2048, 3], residency: "cpu", statistics: { element_count: 6144, minimum: 0, maximum: 1, mean: 0.5 } },
        { name: "N", dtype: "float32", shape: [2048, 3], residency: "gpu", statistics: null },
      ],
    };
  }
  return { family: "bytes", byte_length: 64 };
}

/** Every port viewer the mock's window opened, each playing until closed. */
export class MockPortViewers {
  private readonly stopPlayingByPortViewer = new Map<string, () => void>();
  private readonly eventListeners = new Set<(event: PortViewerEvent) => void>();
  private readonly imageFrameListeners = new Set<(videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => void>();
  private portViewersOpened = 0;

  /** Open a port viewer of `target`, on the node named `nodeName`, whose port carries `portFamily`, answering the id its events arrive under; an Image port of a node not ready plays transparent frames, as the runtime sends. */
  open(target: PortViewerTarget, nodeName: string, portFamily: PortFamily | null, isTheNodeNotReady: boolean): string {
    this.portViewersOpened += 1;
    const portViewer = `port-viewer-${this.portViewersOpened}`;
    const playing = portFamily === "image" ? this.playATestPattern(portViewer, `${nodeName} › ${target.port}`, isTheNodeNotReady) : this.reportMessages(portViewer, portFamily);
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

  private playATestPattern(portViewer: string, portWords: string, isTheNodeNotReady: boolean): () => void {
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
      if (isTheNodeNotReady) drawing.clearRect(0, 0, MOCK_IMAGE_FRAME_WIDTH, MOCK_IMAGE_FRAME_HEIGHT);
      else drawAMockTestPattern(drawing, framesDrawn, portWords);
      const frameFacts: PortViewerImageFrameFacts = { port_viewer: portViewer, format_wire_name: "bgra32", skipped_since_last_read: 0 };
      for (const listener of this.imageFrameListeners) {
        listener(new VideoFrame(testPatternCanvas, { timestamp: framesDrawn * MOCK_IMAGE_FRAME_EVERY_MILLISECONDS * 1000 }), frameFacts);
      }
    }, MOCK_IMAGE_FRAME_EVERY_MILLISECONDS);
    return () => window.clearInterval(timer);
  }

  private reportMessages(portViewer: string, portFamily: PortFamily | null): () => void {
    let messagesRead = 0;
    const timer = window.setInterval(() => {
      const event: PortViewerEvent = { port_viewer: portViewer, kind: "message", reading: mockPortViewerMessageReading(portFamily, messagesRead), skipped_since_last_read: 0 };
      messagesRead += 1;
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
