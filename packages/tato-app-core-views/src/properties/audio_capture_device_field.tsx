import { useEffect, useState } from "react";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { PropertyChoiceField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import type { AudioCaptureDevicesReading, JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { audioCaptureDeviceChoicesOf, chosenAudioCaptureDeviceChoice, type AudioCaptureDevicesForTheDeviceMenu } from "./audio_capture_device_choices";

/** The menu's devices from a reading of them, `null` while none arrived. */
function devicesForTheDeviceMenuOf(reading: AudioCaptureDevicesReading | null): AudioCaptureDevicesForTheDeviceMenu {
  if (reading === null) return { kind: "not_listed_yet" };
  return reading.kind === "listed" ? { kind: "listed", devices: reading.listing.devices } : { kind: "refused", because: reading.because };
}

/**
 * The menu of a setting naming an audio capture device, the machine's devices listed as it is drawn and again each time the
 * runtime lists streams after it did not, as once it has started; read only without `onDeviceChosen`. Choosing Default input
 * unsets the setting, and choosing the entry held does nothing.
 */
export function AudioCaptureDeviceFieldOfTheSetting({
  fieldId,
  name,
  value,
  isTheTypesDefault,
  connection,
  onDeviceChosen,
  onDefaultChosen,
}: {
  fieldId: string;
  name: string;
  value: JsonValue | null;
  isTheTypesDefault: boolean;
  /** The view's connection to Studio, `null` where no project is open, which lists no device. */
  connection: Pick<TatoAppViewConnection, "listAudioCaptureDevices" | "watchListedStreams"> | null;
  onDeviceChosen?: (deviceId: string) => void;
  onDefaultChosen?: () => void;
}) {
  const [reading, setReading] = useState<AudioCaptureDevicesReading | null>(null);
  const [listingsAsked, setListingsAsked] = useState(0);
  useEffect(() => {
    if (connection === null) return undefined;
    let wasTheRuntimeListingStreams: boolean | null = null;
    return connection.watchListedStreams((streamsReading) => {
      const isTheRuntimeListingStreams = streamsReading.kind === "listed";
      if (wasTheRuntimeListingStreams === false && isTheRuntimeListingStreams) setListingsAsked((asked) => asked + 1);
      wasTheRuntimeListingStreams = isTheRuntimeListingStreams;
    });
  }, [connection]);
  useEffect(() => {
    if (connection === null) return undefined;
    let isStillDrawn = true;
    void connection.listAudioCaptureDevices().then((devicesRead) => {
      if (isStillDrawn) setReading(devicesRead);
    });
    return () => {
      isStillDrawn = false;
    };
  }, [connection, listingsAsked]);
  const devices = devicesForTheDeviceMenuOf(reading);
  const choices = audioCaptureDeviceChoicesOf(devices, value);
  const chosen = chosenAudioCaptureDeviceChoice(choices, value);
  return (
    <div className="flex min-w-0 flex-col gap-1" data-property-audio-capture-device={name}>
      <PropertyChoiceField
        fieldId={fieldId}
        label={`Value of ${name}`}
        words={chosen?.words ?? ""}
        isTheTypesDefault={isTheTypesDefault}
        choices={
          onDeviceChosen === undefined || onDefaultChosen === undefined
            ? undefined
            : choices.map((choice) => ({
                words: choice.words,
                onChosen: () => {
                  if (choice === chosen) return;
                  if (choice.device_id === null) onDefaultChosen();
                  else onDeviceChosen(choice.device_id);
                },
              }))
        }
      />
      {devices.kind === "refused" && <RefusalLine lead="The machine's audio inputs weren't listed:" words={devices.because} data-property-audio-capture-device-listing-refusal="" />}
    </div>
  );
}
