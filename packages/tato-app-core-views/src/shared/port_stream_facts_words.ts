// What a port states about its stream, as the studio writes it on a pin, in Properties and over the Viewer: an
// Image output's frame rate and HDR light levels, a Packets output's codec, picture size, sample rate, channels and
// configuration record, and a Records port's unchecked values.

import type { PortStreamFacts, StreamGraphDeclaredPort, StreamGraphSummary } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The H.265 SEI's luminance unit: 0.0001 cd/m². */
const MASTERING_LUMINANCE_STEPS_PER_CANDELA_PER_SQUARE_METRE = 10_000;

/** A frame rate in words, to two decimals where it is not whole: `30 fps`, `29.97 fps`. */
export function frameRateWords(numerator: number, denominator: number): string {
  const framesPerSecond = numerator / denominator;
  return `${Number.isInteger(framesPerSecond) ? framesPerSecond : framesPerSecond.toFixed(2)} fps`;
}

function streamFactsWords(facts: PortStreamFacts): string[] {
  if (facts.family === "image") {
    const words: string[] = [];
    if (facts.frame_rate !== null) words.push(frameRateWords(facts.frame_rate.numerator, facts.frame_rate.denominator));
    if (facts.content_light_level !== null) {
      words.push(`MaxCLL ${facts.content_light_level.max_content_light_level} · MaxFALL ${facts.content_light_level.max_frame_average_light_level} cd/m²`);
    }
    if (facts.mastering_display_colour_volume !== null) {
      const { min_display_mastering_luminance: minLuminance, max_display_mastering_luminance: maxLuminance } = facts.mastering_display_colour_volume;
      words.push(`mastered ${minLuminance / MASTERING_LUMINANCE_STEPS_PER_CANDELA_PER_SQUARE_METRE}–${maxLuminance / MASTERING_LUMINANCE_STEPS_PER_CANDELA_PER_SQUARE_METRE} cd/m²`);
    }
    return words;
  }
  const words: string[] = [];
  if (facts.rfc6381_codec !== null) words.push(facts.rfc6381_codec);
  if (facts.coded_width !== null && facts.coded_height !== null) words.push(`${facts.coded_width}×${facts.coded_height}`);
  if (facts.sample_rate !== null) words.push(`${facts.sample_rate} Hz`);
  if (facts.channel_count !== null) words.push(`${facts.channel_count} ch`);
  if (facts.codec_configuration_byte_length !== null) words.push(`${facts.codec_configuration_byte_length}-byte configuration`);
  return words;
}

/** Each fact `port` states about its stream in words, and `values unchecked` on a Records port; `[]` when it states none. */
export function portStreamFactsWords(port: Pick<StreamGraphDeclaredPort, "stream_facts" | "values_checked">): string[] {
  return [...(port.stream_facts === null ? [] : streamFactsWords(port.stream_facts)), ...(port.values_checked === false ? ["values unchecked"] : [])];
}

/** What a Records port's unchecked mark means, where the studio explains it. */
export const VALUES_UNCHECKED_MEANING = "The runtime checks only that each declared key is present; no type checks a Records port's values.";

/** The facts the input `inputPort` of `nodeName` receives: those of the output its one link reads, with its own unchecked mark; none while it has no link, or more than one. */
export function streamFactsAnInputReceives(
  graph: StreamGraphSummary,
  nodeName: string,
  inputPort: StreamGraphDeclaredPort,
): Pick<StreamGraphDeclaredPort, "stream_facts" | "values_checked"> {
  const linksIntoThePort = graph.links.filter((link) => link.target_node === nodeName && link.target_port === inputPort.name);
  const upstreamLink = linksIntoThePort.length === 1 ? linksIntoThePort[0] : undefined;
  const upstreamOutputPort =
    upstreamLink === undefined ? undefined : graph.nodes.find((node) => node.name === upstreamLink.source_node)?.output_ports.find((port) => port.name === upstreamLink.source_port);
  return { stream_facts: upstreamOutputPort?.stream_facts ?? null, values_checked: inputPort.values_checked };
}
