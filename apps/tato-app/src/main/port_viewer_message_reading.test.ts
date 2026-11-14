import { expect, test } from "vitest";
import { PORT_VIEWER_WAVEFORM_COLUMNS, portViewerMessageReadingOf } from "./port_viewer_message_reading.js";
import type { RuntimeViewerMessageRead } from "./runtime_viewer_image_frame_import.js";

function messageOf(portFamily: string, payload: Uint8Array, familyReading: Partial<RuntimeViewerMessageRead>): RuntimeViewerMessageRead {
  return {
    portFamily,
    timestampNs: 33_000_000,
    skippedSinceLastRead: 0,
    imageFrame: null,
    payload: Buffer.from(payload),
    startsGroup: false,
    channelsBlock: null,
    packetsCodec: null,
    arrayAttributes: null,
    recordsJson: null,
    unreadableBecause: null,
    ...familyReading,
  };
}

function bytesOfFloat32s(samples: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(samples).buffer);
}

test("a_channels_block_reads_as_one_waveform_per_channel_with_its_peak_and_rms", () => {
  const planarSamples = bytesOfFloat32s([0, 0.5, -0.5, 1, 0.25, 0.25, 0.25, 0.25]);
  const unalignedPayload = new Uint8Array(planarSamples.byteLength + 1).subarray(1);
  unalignedPayload.set(planarSamples);

  const reading = portViewerMessageReadingOf(
    messageOf("channels", unalignedPayload, { channelsBlock: { startSample: 96_000, sampleRate: 48_000, channelCount: 2, samplesPerChannel: 4, sampleType: "f32" } }),
  );

  expect(reading).toEqual({
    family: "channels",
    start_sample: 96_000,
    sample_rate: 48_000,
    channel_count: 2,
    samples_per_channel: 4,
    sample_type: "f32",
    channel_waveforms: [
      { column_minimums: [0, 0.5, -0.5, 1], column_maximums: [0, 0.5, -0.5, 1], peak: 1, rms: Math.sqrt((0.25 + 0.25 + 1) / 4) },
      { column_minimums: [0.25, 0.25, 0.25, 0.25], column_maximums: [0.25, 0.25, 0.25, 0.25], peak: 0.25, rms: 0.25 },
    ],
    channel_samples: [new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0.25, 0.25, 0.25, 0.25])],
  });
});

test("a_long_channels_block_is_drawn_in_the_waveforms_columns_each_holding_its_lowest_and_highest_sample", () => {
  const samplesPerChannel = PORT_VIEWER_WAVEFORM_COLUMNS * 4;
  const samples = Array.from({ length: samplesPerChannel }, (_, sampleIndex) => (sampleIndex % 4) / 4 - 0.5);

  const reading = portViewerMessageReadingOf(
    messageOf("channels", bytesOfFloat32s(samples), { channelsBlock: { startSample: 0, sampleRate: 16_000, channelCount: 1, samplesPerChannel, sampleType: "f32" } }),
  );

  if (reading.family !== "channels") throw new Error(`read as ${reading.family}`);
  const [waveform] = reading.channel_waveforms;
  expect(waveform?.column_minimums.length).toBe(PORT_VIEWER_WAVEFORM_COLUMNS);
  expect(new Set(waveform?.column_minimums)).toEqual(new Set([-0.5]));
  expect(new Set(waveform?.column_maximums)).toEqual(new Set([0.25]));
});

test("an_array_frames_cpu_attributes_read_with_their_statistics_and_a_gpu_attribute_by_its_shape", () => {
  const payload = new Uint8Array(64 + 16);
  new Float32Array(payload.buffer, 64, 4).set([1, 2, 3, 6]);

  const reading = portViewerMessageReadingOf(
    messageOf("array", payload, {
      arrayAttributes: [
        { name: "P", dtype: "float32", shape: [2, 2], residency: "cpu", payloadByteOffset: 64, byteLen: 16 },
        { name: "N", dtype: "float32", shape: [2, 2], residency: "gpu", payloadByteOffset: null, byteLen: null },
        { name: "labels", dtype: "bool", shape: [4], residency: "cpu", payloadByteOffset: 0, byteLen: 4 },
      ],
    }),
  );

  expect(reading).toEqual({
    family: "array",
    attributes: [
      { name: "P", dtype: "float32", shape: [2, 2], residency: "cpu", statistics: { element_count: 4, minimum: 1, maximum: 6, mean: 3 } },
      { name: "N", dtype: "float32", shape: [2, 2], residency: "gpu", statistics: null },
      { name: "labels", dtype: "bool", shape: [4], residency: "cpu", statistics: null },
    ],
  });
});

test("a_packets_unit_reads_as_its_codec_size_keyframe_flag_and_stamp", () => {
  expect(portViewerMessageReadingOf(messageOf("packets", new Uint8Array(1_400), { packetsCodec: "avc1.64001f", startsGroup: true }))).toEqual({
    family: "packets",
    codec: "avc1.64001f",
    byte_length: 1_400,
    starts_group: true,
    timestamp_ns: 33_000_000,
  });
});

test("a_records_message_reads_as_its_keyed_map_and_one_that_did_not_read_says_why_in_the_addons_words", () => {
  expect(portViewerMessageReadingOf(messageOf("records", new Uint8Array(8), { recordsJson: '{"label":"face","box":{"x":4}}' }))).toEqual({
    family: "records",
    record: { label: "face", box: { x: 4 } },
  });
  expect(portViewerMessageReadingOf(messageOf("records", new Uint8Array([0xc1]), { unreadableBecause: "the record's msgpack did not decode: reserved byte" }))).toEqual({
    family: "unreadable",
    port_family: "records",
    because: "the record's msgpack did not decode: reserved byte",
  });
});

test("a_payload_no_family_describes_reads_as_its_size", () => {
  expect(portViewerMessageReadingOf(messageOf("bytes", new Uint8Array(12), {}))).toEqual({ family: "bytes", byte_length: 12 });
});
