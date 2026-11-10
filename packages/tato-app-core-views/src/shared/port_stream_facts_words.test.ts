import { expect, test } from "vitest";
import { portStreamFactsWords } from "./port_stream_facts_words";

test("an_image_outputs_facts_read_as_its_frame_rate_and_its_hdr_light_levels", () => {
  expect(
    portStreamFactsWords({
      stream_facts: {
        family: "image",
        frame_rate: { numerator: 60, denominator: 1 },
        content_light_level: { max_content_light_level: 1000, max_frame_average_light_level: 400 },
        mastering_display_colour_volume: { max_display_mastering_luminance: 10_000_000, min_display_mastering_luminance: 50 },
      },
      values_checked: null,
    }),
  ).toEqual(["60 fps", "MaxCLL 1000 · MaxFALL 400 cd/m²", "mastered 0.005–1000 cd/m²"]);
});

test("a_packets_outputs_facts_read_as_its_codec_picture_size_rate_channels_and_configuration_record", () => {
  expect(
    portStreamFactsWords({
      stream_facts: { family: "packets", rfc6381_codec: "opus", coded_width: null, coded_height: null, sample_rate: 48000, channel_count: 2, codec_configuration_byte_length: 19 },
      values_checked: null,
    }),
  ).toEqual(["opus", "48000 Hz", "2 ch", "19-byte configuration"]);
  expect(
    portStreamFactsWords({
      stream_facts: { family: "packets", rfc6381_codec: "avc1.64001f", coded_width: 1280, coded_height: 720, sample_rate: null, channel_count: null, codec_configuration_byte_length: null },
      values_checked: null,
    }),
  ).toEqual(["avc1.64001f", "1280×720"]);
});

test("a_records_port_reads_as_values_unchecked_and_a_port_stating_nothing_reads_as_nothing", () => {
  expect(portStreamFactsWords({ stream_facts: null, values_checked: false })).toEqual(["values unchecked"]);
  expect(portStreamFactsWords({ stream_facts: null, values_checked: null })).toEqual([]);
});
