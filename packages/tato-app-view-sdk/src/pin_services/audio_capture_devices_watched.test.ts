import { expect, test } from "vitest";
import type { AudioCaptureDevicesReading, ListedStreamsReading } from "../studio_readings.js";
import { watchTheAudioCaptureDevices, type AudioCaptureDevicesListedBy } from "./audio_capture_devices_watched.js";

const LISTED: AudioCaptureDevicesReading = { kind: "listed", listing: { audio_backend: "stub-audio", devices: [{ id: "stub-microphone", name: "Stub Microphone", kind: "input" }] } };
const REFUSED: AudioCaptureDevicesReading = { kind: "not_listed", because: "No runtime answers." };

/** A connection answering each listing with the next of `readings`, the last again once they run out, whose listed streams the test tells. */
function connectionAnswering(...readings: [AudioCaptureDevicesReading, ...AudioCaptureDevicesReading[]]) {
  let listingsAsked = 0;
  const streamsListeners = new Set<(reading: ListedStreamsReading) => void>();
  const connection: AudioCaptureDevicesListedBy = {
    listAudioCaptureDevices: () => {
      listingsAsked += 1;
      return Promise.resolve(readings[Math.min(listingsAsked, readings.length) - 1] ?? readings[0]);
    },
    watchListedStreams: (listener) => {
      streamsListeners.add(listener);
      return () => streamsListeners.delete(listener);
    },
  };
  const tellTheStreams = (reading: ListedStreamsReading) => {
    for (const listener of streamsListeners) listener(reading);
  };
  return { connection, tellTheStreams, listingsAsked: () => listingsAsked, streamWatchesOpen: () => streamsListeners.size };
}

const flush = async () => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

test("the devices are listed as the watch starts, and again once the runtime lists streams after it did not", async () => {
  const { connection, tellTheStreams, listingsAsked } = connectionAnswering(REFUSED, LISTED);
  const readings: AudioCaptureDevicesReading[] = [];
  watchTheAudioCaptureDevices(connection, (reading) => readings.push(reading));
  await flush();
  expect(readings).toEqual([REFUSED]);

  tellTheStreams({ kind: "listed", streams: [] });
  await flush();
  expect(listingsAsked()).toBe(1);

  tellTheStreams({ kind: "not_listed", because: "the runtime stopped" });
  tellTheStreams({ kind: "listed", streams: [] });
  await flush();
  expect(listingsAsked()).toBe(2);
  expect(readings).toEqual([REFUSED, LISTED]);
});

test("a stopped watch hands on no listing still answering, and stops watching the listed streams", async () => {
  const { connection, streamWatchesOpen } = connectionAnswering(LISTED);
  const readings: AudioCaptureDevicesReading[] = [];
  const stop = watchTheAudioCaptureDevices(connection, (reading) => readings.push(reading));
  stop();
  await flush();
  expect(readings).toEqual([]);
  expect(streamWatchesOpen()).toBe(0);
});
