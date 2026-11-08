// An output port's stream facts as the runtime's `graph` renders them under `stream_facts`: an object tagged by
// `family` (`image` or `packets`) whose other keys are that family's facts, each one absent when the port does not
// state it. Facts only describe a stream, so one of another shape reads as none rather than refusing the graph.

import type { ImageStreamContentLightLevel, ImageStreamFrameRate, ImageStreamMasteringDisplayColourVolume, PortStreamFacts } from "../shared/tatolab_backend_contract.js";
import { isAJsonObject, type JsonObjectOnTheWire } from "./json_on_the_wire.js";

/** The facts `port` states under `stream_facts`; `null` for none, or for facts of a family or shape this app does not read. */
export function portStreamFactsOnTheWire(port: JsonObjectOnTheWire): PortStreamFacts | null {
  const streamFacts = port["stream_facts"];
  if (!isAJsonObject(streamFacts)) return null;
  if (streamFacts["family"] === "image") {
    return {
      family: "image",
      frame_rate: imageStreamFrameRateOnTheWire(streamFacts["frame_rate"]),
      content_light_level: imageStreamContentLightLevelOnTheWire(streamFacts["content_light_level"]),
      mastering_display_colour_volume: imageStreamMasteringDisplayColourVolumeOnTheWire(streamFacts["mastering_display_colour_volume"]),
    };
  }
  if (streamFacts["family"] === "packets") {
    const codecConfigurationHex = streamFacts["codec_configuration_hex"];
    return {
      family: "packets",
      rfc6381_codec: typeof streamFacts["rfc6381_codec"] === "string" ? streamFacts["rfc6381_codec"] : null,
      coded_width: wholeNumberOrNull(streamFacts["coded_width"]),
      coded_height: wholeNumberOrNull(streamFacts["coded_height"]),
      sample_rate: wholeNumberOrNull(streamFacts["sample_rate"]),
      channel_count: wholeNumberOrNull(streamFacts["channel_count"]),
      codec_configuration_byte_length: typeof codecConfigurationHex === "string" ? Math.floor(codecConfigurationHex.length / 2) : null,
    };
  }
  return null;
}

/** `false` when `port` renders `values_checked: false`, as a Records port does; `null` when it renders no such key. */
export function portValuesCheckedOnTheWire(port: JsonObjectOnTheWire): boolean | null {
  const valuesChecked = port["values_checked"];
  return typeof valuesChecked === "boolean" ? valuesChecked : null;
}

function wholeNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function imageStreamFrameRateOnTheWire(frameRate: unknown): ImageStreamFrameRate | null {
  if (!isAJsonObject(frameRate)) return null;
  const numerator = wholeNumberOrNull(frameRate["numerator"]);
  const denominator = wholeNumberOrNull(frameRate["denominator"]);
  if (numerator === null || denominator === null || numerator === 0 || denominator === 0) return null;
  return { numerator, denominator };
}

function imageStreamContentLightLevelOnTheWire(contentLightLevel: unknown): ImageStreamContentLightLevel | null {
  if (!isAJsonObject(contentLightLevel)) return null;
  const maxContentLightLevel = wholeNumberOrNull(contentLightLevel["max_content_light_level"]);
  const maxFrameAverageLightLevel = wholeNumberOrNull(contentLightLevel["max_frame_average_light_level"]);
  if (maxContentLightLevel === null || maxFrameAverageLightLevel === null) return null;
  return { max_content_light_level: maxContentLightLevel, max_frame_average_light_level: maxFrameAverageLightLevel };
}

function imageStreamMasteringDisplayColourVolumeOnTheWire(masteringDisplayColourVolume: unknown): ImageStreamMasteringDisplayColourVolume | null {
  if (!isAJsonObject(masteringDisplayColourVolume)) return null;
  const maxLuminance = wholeNumberOrNull(masteringDisplayColourVolume["max_display_mastering_luminance"]);
  const minLuminance = wholeNumberOrNull(masteringDisplayColourVolume["min_display_mastering_luminance"]);
  if (maxLuminance === null || minLuminance === null) return null;
  return { max_display_mastering_luminance: maxLuminance, min_display_mastering_luminance: minLuminance };
}
