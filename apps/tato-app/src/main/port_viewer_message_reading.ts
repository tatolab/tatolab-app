// What a port viewer reads of one message of a family other than Image, from what the viewer addon
// handed over: a Channels block as one waveform per channel, an Array frame's attributes with the
// statistics of their numeric data, a Packets unit's codec, size and keyframe flag, and a Records
// message's keyed map.

import type { JsonValue, PortViewerArrayAttributeReading, PortViewerChannelWaveform, PortViewerMessageReading } from "../shared/tatolab_backend_contract.js";
import { isAJsonValue, parseJsonOnTheWire } from "./json_on_the_wire.js";
import type { RuntimeViewerArrayAttribute, RuntimeViewerChannelsBlock, RuntimeViewerMessageRead } from "./runtime_viewer_image_frame_import.js";

/** The most columns a channel's waveform is drawn in; a block of fewer samples gets one column a sample. */
export const PORT_VIEWER_WAVEFORM_COLUMNS = 512;

/** How a typed array of each Array dtype the Node visualizer reads statistics of is made over payload bytes, and its element size. */
const ARRAY_DTYPE_READERS: Record<string, { elementByteLength: number; elementsOver: (bytes: ArrayBuffer, byteOffset: number, length: number) => ArrayLike<number> }> = {
  float32: { elementByteLength: 4, elementsOver: (bytes, byteOffset, length) => new Float32Array(bytes, byteOffset, length) },
  float64: { elementByteLength: 8, elementsOver: (bytes, byteOffset, length) => new Float64Array(bytes, byteOffset, length) },
  int8: { elementByteLength: 1, elementsOver: (bytes, byteOffset, length) => new Int8Array(bytes, byteOffset, length) },
  uint8: { elementByteLength: 1, elementsOver: (bytes, byteOffset, length) => new Uint8Array(bytes, byteOffset, length) },
  int16: { elementByteLength: 2, elementsOver: (bytes, byteOffset, length) => new Int16Array(bytes, byteOffset, length) },
  uint16: { elementByteLength: 2, elementsOver: (bytes, byteOffset, length) => new Uint16Array(bytes, byteOffset, length) },
  int32: { elementByteLength: 4, elementsOver: (bytes, byteOffset, length) => new Int32Array(bytes, byteOffset, length) },
  uint32: { elementByteLength: 4, elementsOver: (bytes, byteOffset, length) => new Uint32Array(bytes, byteOffset, length) },
};

/** `payload`'s bytes in a buffer of their own, aligned for any typed array: a Node `Buffer` may sit at any offset of a shared pool. */
function alignedCopyOf(payload: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(payload.byteLength);
  new Uint8Array(copy).set(payload);
  return copy;
}

function waveformOfOneChannel(samples: ArrayLike<number>, firstSample: number, sampleCount: number): PortViewerChannelWaveform {
  const columnCount = Math.min(PORT_VIEWER_WAVEFORM_COLUMNS, sampleCount);
  const columnMinimums: number[] = [];
  const columnMaximums: number[] = [];
  let peak = 0;
  let sumOfSquares = 0;
  for (let column = 0; column < columnCount; column += 1) {
    const columnStart = Math.floor((column * sampleCount) / columnCount);
    const columnEnd = Math.floor(((column + 1) * sampleCount) / columnCount);
    let columnMinimum = Number.POSITIVE_INFINITY;
    let columnMaximum = Number.NEGATIVE_INFINITY;
    for (let sampleIndex = columnStart; sampleIndex < columnEnd; sampleIndex += 1) {
      const sample = samples[firstSample + sampleIndex] ?? 0;
      columnMinimum = Math.min(columnMinimum, sample);
      columnMaximum = Math.max(columnMaximum, sample);
      peak = Math.max(peak, Math.abs(sample));
      sumOfSquares += sample * sample;
    }
    columnMinimums.push(columnMinimum);
    columnMaximums.push(columnMaximum);
  }
  return { column_minimums: columnMinimums, column_maximums: columnMaximums, peak, rms: sampleCount === 0 ? 0 : Math.sqrt(sumOfSquares / sampleCount) };
}

function channelsReadingOf(block: RuntimeViewerChannelsBlock, payload: Uint8Array): PortViewerMessageReading {
  const sampleType = block.sampleType;
  if (sampleType !== "f32" && sampleType !== "f64") {
    return { family: "unreadable", port_family: "channels", because: "the block's sample type is not one the Node visualizer knows" };
  }
  const sampleCount = block.channelCount * block.samplesPerChannel;
  const alignedPayload = alignedCopyOf(payload);
  const samples = sampleType === "f32" ? new Float32Array(alignedPayload, 0, sampleCount) : new Float64Array(alignedPayload, 0, sampleCount);
  const channelWaveforms = Array.from({ length: block.channelCount }, (_, channel) => waveformOfOneChannel(samples, channel * block.samplesPerChannel, block.samplesPerChannel));
  return {
    family: "channels",
    start_sample: block.startSample,
    sample_rate: block.sampleRate,
    channel_count: block.channelCount,
    samples_per_channel: block.samplesPerChannel,
    sample_type: sampleType,
    channel_waveforms: channelWaveforms,
  };
}

function statisticsOf(attribute: RuntimeViewerArrayAttribute, alignedPayload: ArrayBuffer): PortViewerArrayAttributeReading["statistics"] {
  const dtypeReader = ARRAY_DTYPE_READERS[attribute.dtype];
  if (dtypeReader === undefined || attribute.payloadByteOffset === null || attribute.byteLen === null) return null;
  if (attribute.payloadByteOffset % dtypeReader.elementByteLength !== 0) return null;
  const elementCount = Math.floor(attribute.byteLen / dtypeReader.elementByteLength);
  if (elementCount === 0) return null;
  const elements = dtypeReader.elementsOver(alignedPayload, attribute.payloadByteOffset, elementCount);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
    const element = elements[elementIndex] ?? 0;
    minimum = Math.min(minimum, element);
    maximum = Math.max(maximum, element);
    sum += element;
  }
  return { element_count: elementCount, minimum, maximum, mean: sum / elementCount };
}

function arrayReadingOf(attributes: RuntimeViewerArrayAttribute[], payload: Uint8Array): PortViewerMessageReading {
  const alignedPayload = alignedCopyOf(payload);
  return {
    family: "array",
    attributes: attributes.map((attribute) => ({
      name: attribute.name,
      dtype: attribute.dtype,
      shape: attribute.shape,
      residency: attribute.residency === "gpu" ? "gpu" : "cpu",
      statistics: attribute.residency === "gpu" ? null : statisticsOf(attribute, alignedPayload),
    })),
  };
}

function recordsReadingOf(recordsJson: string): PortViewerMessageReading {
  const record = parseJsonOnTheWire(recordsJson);
  if (!record.ok || !isAJsonValue(record.value)) return { family: "unreadable", port_family: "records", because: "the record the viewer decoded is not JSON" };
  const decodedRecord: JsonValue = record.value;
  return { family: "records", record: decodedRecord };
}

/** What a port viewer shows of `messageRead`, a message of any family but Image. */
export function portViewerMessageReadingOf(messageRead: RuntimeViewerMessageRead): PortViewerMessageReading {
  const payload = messageRead.payload ?? new Uint8Array();
  if (messageRead.unreadableBecause !== null) return { family: "unreadable", port_family: messageRead.portFamily, because: messageRead.unreadableBecause };
  if (messageRead.portFamily === "channels" && messageRead.channelsBlock !== null) return channelsReadingOf(messageRead.channelsBlock, payload);
  if (messageRead.portFamily === "array" && messageRead.arrayAttributes !== null) return arrayReadingOf(messageRead.arrayAttributes, payload);
  if (messageRead.portFamily === "records" && messageRead.recordsJson !== null) return recordsReadingOf(messageRead.recordsJson);
  if (messageRead.portFamily === "packets") {
    return { family: "packets", codec: messageRead.packetsCodec ?? "", byte_length: payload.byteLength, starts_group: messageRead.startsGroup, timestamp_ns: messageRead.timestampNs };
  }
  return { family: "bytes", byte_length: payload.byteLength };
}
