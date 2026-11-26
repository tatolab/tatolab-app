// The machine's audio capture devices as a control watches them: listed through the runtime's
// `list_audio_capture_devices` once the watch starts, and again each time the runtime lists streams
// after it did not, as once it has started, so a menu drawn while the runtime was down fills in.

import type { AudioCaptureDevicesReading } from "../studio_readings.js";
import type { StopWatching, TatoAppViewConnection } from "../tato_app_view_connection.js";

/** What the watch asks of the frame's connection. */
export type AudioCaptureDevicesListedBy = Pick<TatoAppViewConnection, "listAudioCaptureDevices" | "watchListedStreams">;

/** Hands `listener` each listing of the machine's audio capture devices `connection` answers, the latest asked alone, until the watch stops. */
export function watchTheAudioCaptureDevices(connection: AudioCaptureDevicesListedBy, listener: (reading: AudioCaptureDevicesReading) => void): StopWatching {
  let isWatching = true;
  let listingsAsked = 0;
  const listTheDevices = (): void => {
    listingsAsked += 1;
    const listing = listingsAsked;
    void connection.listAudioCaptureDevices().then((reading) => {
      if (isWatching && listing === listingsAsked) listener(reading);
    });
  };
  let wasTheRuntimeListingStreams: boolean | null = null;
  const stopWatchingTheStreams = connection.watchListedStreams((streamsReading) => {
    const isTheRuntimeListingStreams = streamsReading.kind === "listed";
    if (wasTheRuntimeListingStreams === false && isTheRuntimeListingStreams) listTheDevices();
    wasTheRuntimeListingStreams = isTheRuntimeListingStreams;
  });
  listTheDevices();
  return () => {
    isWatching = false;
    stopWatchingTheStreams();
  };
}
