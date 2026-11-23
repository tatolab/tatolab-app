import { expect, test } from "vitest";
import { portStreamFactsWords } from "./port_stream_facts_words";

test("an_untyped_image_outputs_facts_read_as_its_frame_rate_and_its_hdr_light_levels", () => {
  expect(
    portStreamFactsWords({
      stream_facts: {
        family: "image",
        frame_rate: { numerator: 60, denominator: 1 },
        content_light_level: { max_content_light_level: 1000, max_frame_average_light_level: 400 },
        mastering_display_colour_volume: { max_display_mastering_luminance: 10_000_000, min_display_mastering_luminance: 50 },
      },
    }),
  ).toEqual(["60 fps", "MaxCLL 1000 · MaxFALL 400 cd/m²", "mastered 0.005–1000 cd/m²"]);
});

test("an_untyped_packets_outputs_facts_read_as_its_codec_picture_size_rate_channels_and_configuration_record", () => {
  expect(
    portStreamFactsWords({
      stream_facts: { family: "packets", rfc6381_codec: "opus", sample_rate: 48000, channel_count: 2, codec_configuration_hex: "4f707573486561640102380180bb0000000000" },
    }),
  ).toEqual(["opus", "48000 Hz", "2 ch", "19-byte configuration"]);
  expect(
    portStreamFactsWords({
      stream_facts: { family: "packets", rfc6381_codec: "avc1.64001f", coded_width: 1280, coded_height: 720 },
    }),
  ).toEqual(["avc1.64001f", "1280×720"]);
});

test("a_records_port_reads_as_values_unchecked_and_a_port_stating_nothing_reads_as_nothing", () => {
  expect(portStreamFactsWords({ values_checked: false })).toEqual(["values unchecked"]);
  expect(portStreamFactsWords({})).toEqual([]);
});

test("a_texture_outputs_facts_read_by_their_type_with_no_family", () => {
  expect(portStreamFactsWords({ stream_facts: { type: "texture", frame_rate: { numerator: 30000, denominator: 1001 }, content_light_level: { max_content_light_level: 1000, max_frame_average_light_level: 400 } } })).toEqual([
    "29.97 fps",
    "MaxCLL 1000 · MaxFALL 400 cd/m²",
  ]);
});

test("both_encoded_types_facts_read_as_the_same_fields_by_their_type_with_no_family", () => {
  expect(portStreamFactsWords({ stream_facts: { type: "encoded_audio", rfc6381_codec: "opus", sample_rate: 48000, channel_count: 2 } })).toEqual(["opus", "48000 Hz", "2 ch"]);
  expect(portStreamFactsWords({ stream_facts: { type: "encoded_video", rfc6381_codec: "avc1.64001f", coded_width: 1920, coded_height: 1080, codec_configuration_hex: "0164001f" } })).toEqual([
    "avc1.64001f",
    "1920×1080",
    "4-byte configuration",
  ]);
});

test("a_typed_outputs_facts_are_read_by_their_type_over_the_family_beside_it", () => {
  expect(portStreamFactsWords({ stream_facts: { type: "encoded_audio", family: "image", rfc6381_codec: "opus" } })).toEqual(["opus"]);
  expect(portStreamFactsWords({ stream_facts: { type: "float", family: "packets", rfc6381_codec: "opus" } })).toEqual([]);
});

test("facts_naming_a_null_type_read_as_an_untyped_ports_by_their_family", () => {
  expect(portStreamFactsWords({ stream_facts: { type: null, family: "image", frame_rate: { numerator: 25, denominator: 1 } } })).toEqual(["25 fps"]);
  expect(portStreamFactsWords({ stream_facts: { type: null, family: "packets", rfc6381_codec: "opus" } })).toEqual(["opus"]);
});
