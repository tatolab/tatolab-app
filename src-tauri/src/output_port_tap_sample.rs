// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! A sample of the bags one output port carried, read from the runtime's `tap` tool result: each
//! bag hex-decoded, split at its frame header, and its msgpack payload shown field by field — or
//! the reason it could not be.

use serde::{Deserialize, Serialize};

use crate::local_api_client::LARGEST_LOCAL_API_RESPONSE_BYTES;
use crate::tapped_bag_frame_header::{read_tapped_bag_frame_header, tapped_bag_payload};
use crate::tapped_bag_payload_fields::{
    decode_tapped_bag_payload, displayed_payload_fields, surface_id_named_by_the_payload,
};

/// The most bags one tap the window asks for samples.
pub const LARGEST_TAP_SAMPLE_BAG_COUNT: u32 = 32;

/// The most bytes of each bag the runtime hex-encodes into a tap result; a bigger bag comes back
/// truncated and undecoded.
pub const TAPPED_BAG_HEX_BYTE_LIMIT: u32 = 64 * 1024;

/// The JSON one tap result spends on a bag beyond its hex, with room to spare.
const TAP_RESULT_JSON_BYTES_PER_BAG: usize = 1024;

// The largest sample's hex — two digits a byte — and its JSON fit one local API response.
const _: () = assert!(
    LARGEST_TAP_SAMPLE_BAG_COUNT as usize
        * (2 * TAPPED_BAG_HEX_BYTE_LIMIT as usize + TAP_RESULT_JSON_BYTES_PER_BAG)
        <= LARGEST_LOCAL_API_RESPONSE_BYTES
);

/// A sample of the bags one output port carried, in the order it carried them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TapSample {
    /// The output port's address as the runtime answered it, `<stream>/<node>/<port>`.
    pub channel: String,
    pub received: usize,
    /// Bags the tap dropped because the sample fell behind the channel.
    pub dropped_bags: u64,
    /// The longest the runtime waited to fill the sample.
    pub window_ms: u64,
    pub bags: Vec<TapSampleBag>,
}

/// One bag of a [`TapSample`], decoded as far as it could be.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TapSampleBag {
    /// The whole bag's length, frame header included.
    pub byte_len: u64,
    /// When the channel carried the bag, as its frame header stamps it; `None` when the header
    /// could not be read.
    pub timestamp_ns: Option<i64>,
    /// The frame a frame bag names in its `surface_id` field; `None` for any other bag.
    pub surface_id: Option<String>,
    /// The payload's fields in its own order, each as `[key, display text]`.
    pub fields: Vec<(String, String)>,
    /// Whether the tap returned less than the whole bag.
    pub hex_truncated: bool,
    /// Why the bag could not be decoded; `None` when it was.
    pub decode_error: Option<String>,
}

/// The `tap` tool's result, read as far as a sample shows it.
#[derive(Deserialize)]
struct TapToolResultOnTheWire {
    channel: String,
    received: usize,
    window_ms: u64,
    dropped_bags: u64,
    #[serde(default)]
    bags: Vec<TapToolResultBagOnTheWire>,
}

/// One bag of the `tap` tool's result: the frame as the channel carried it, hex-encoded.
#[derive(Deserialize)]
struct TapToolResultBagOnTheWire {
    byte_len: u64,
    hex_preview: String,
    hex_truncated: bool,
}

/// The address `tap` names an output port by: `<stream>/<node>/<port>`.
pub fn output_port_channel_address(stream: &str, node: &str, port: &str) -> String {
    format!("{stream}/{node}/{port}")
}

/// The sample a `tap` tool result's text holds.
pub fn tap_sample_from_the_tap_tool_result(tool_result_text: &str) -> Result<TapSample, String> {
    let tap_tool_result: TapToolResultOnTheWire = serde_json::from_str(tool_result_text)
        .map_err(|failure| format!("the runtime's tap result could not be read: {failure}"))?;
    Ok(TapSample {
        channel: tap_tool_result.channel,
        received: tap_tool_result.received,
        dropped_bags: tap_tool_result.dropped_bags,
        window_ms: tap_tool_result.window_ms,
        bags: tap_tool_result
            .bags
            .into_iter()
            .map(tap_sample_bag_from)
            .collect(),
    })
}

/// The bytes the `tap` tool's hex spells, two digits a byte.
pub fn bytes_from_tap_tool_hex(hex: &str) -> Result<Vec<u8>, String> {
    let (digit_pairs, unpaired_digit) = hex.as_bytes().as_chunks::<2>();
    if !unpaired_digit.is_empty() {
        return Err(format!(
            "the bag's hex has an odd number of digits, {}",
            hex.len()
        ));
    }
    digit_pairs
        .iter()
        .map(|&[high_digit, low_digit]| {
            Some(hex_digit_value(high_digit)? << 4 | hex_digit_value(low_digit)?)
        })
        .collect::<Option<Vec<u8>>>()
        .ok_or_else(|| "the bag's hex holds a character that is not a hex digit".to_string())
}

fn hex_digit_value(hex_digit: u8) -> Option<u8> {
    match hex_digit {
        b'0'..=b'9' => Some(hex_digit - b'0'),
        b'a'..=b'f' => Some(hex_digit - b'a' + 10),
        b'A'..=b'F' => Some(hex_digit - b'A' + 10),
        _ => None,
    }
}

fn tap_sample_bag_from(tapped_bag: TapToolResultBagOnTheWire) -> TapSampleBag {
    let mut tap_sample_bag = TapSampleBag {
        byte_len: tapped_bag.byte_len,
        timestamp_ns: None,
        surface_id: None,
        fields: Vec::new(),
        hex_truncated: tapped_bag.hex_truncated,
        decode_error: None,
    };
    if let Err(decode_error) = decode_tapped_bag_into(&mut tap_sample_bag, &tapped_bag.hex_preview)
    {
        tap_sample_bag.decode_error = Some(decode_error);
    }
    tap_sample_bag
}

/// Fill `tap_sample_bag` from the bag `hex_preview` spells, as far as it decodes: the header's
/// timestamp first, then, for a whole bag, its payload's surface id and fields.
fn decode_tapped_bag_into(
    tap_sample_bag: &mut TapSampleBag,
    hex_preview: &str,
) -> Result<(), String> {
    let bag_bytes = bytes_from_tap_tool_hex(hex_preview)?;
    let frame_header = read_tapped_bag_frame_header(&bag_bytes)?;
    tap_sample_bag.timestamp_ns = Some(frame_header.timestamp_ns);
    if tap_sample_bag.hex_truncated {
        return Err(format!(
            "the tap returned the first {} of the bag's {} bytes, so its payload was not decoded",
            bag_bytes.len(),
            tap_sample_bag.byte_len
        ));
    }
    let payload = decode_tapped_bag_payload(tapped_bag_payload(&bag_bytes, &frame_header)?)?;
    tap_sample_bag.surface_id = surface_id_named_by_the_payload(&payload);
    tap_sample_bag.fields = displayed_payload_fields(&payload);
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    /// What a real runtime's `tap` answered for 3 bags of `main/invertingeffect/video_to_downstream`.
    const A_REAL_TAP_OF_THREE_VIDEO_BAGS: &str = include_str!(
        "../test-fixtures/local-api-tap-tool-result-of-main-invertingeffect-video_to_downstream-3-bags.json"
    );

    fn video_frame_fields(surface_id: &str, payload_timestamp_ns: &str) -> Vec<(String, String)> {
        [
            ("surface_id", surface_id),
            ("width", "1280"),
            ("height", "720"),
            ("timestamp_ns", payload_timestamp_ns),
            ("color_info", "primaries=bt709 transfer=srgb range=full"),
        ]
        .into_iter()
        .map(|(key, display_text)| (key.to_string(), display_text.to_string()))
        .collect()
    }

    fn tap_tool_result_holding(bags: serde_json::Value) -> String {
        json!({
            "channel": "main/invertingeffect/video_to_downstream",
            "requested": 1,
            "received": 1,
            "window_ms": 500,
            "dropped_bags": 0,
            "max_bag_bytes": 65536,
            "bags_withheld_at_byte_budget": 0,
            "bags": bags
        })
        .to_string()
    }

    fn the_first_real_bags_hex() -> String {
        let tap_tool_result: serde_json::Value =
            serde_json::from_str(A_REAL_TAP_OF_THREE_VIDEO_BAGS).unwrap();
        tap_tool_result["bags"][0]["hex_preview"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[test]
    fn a_real_tap_of_three_video_bags_names_each_frame_and_its_fields() {
        let tap_sample =
            tap_sample_from_the_tap_tool_result(A_REAL_TAP_OF_THREE_VIDEO_BAGS).unwrap();

        assert_eq!(
            tap_sample.channel,
            "main/invertingeffect/video_to_downstream"
        );
        assert_eq!(
            (
                tap_sample.received,
                tap_sample.dropped_bags,
                tap_sample.window_ms
            ),
            (3, 0, 500)
        );
        assert_eq!(
            tap_sample.bags,
            vec![
                TapSampleBag {
                    byte_len: 226,
                    timestamp_ns: Some(3527313199945666),
                    surface_id: Some("c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516".to_string()),
                    fields: video_frame_fields(
                        "c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516",
                        "3527313191366625"
                    ),
                    hex_truncated: false,
                    decode_error: None,
                },
                TapSampleBag {
                    byte_len: 226,
                    timestamp_ns: Some(3527313244200208),
                    surface_id: Some("e17a285e-5861-495a-91fe-30dd9d97c5e5#72517".to_string()),
                    fields: video_frame_fields(
                        "e17a285e-5861-495a-91fe-30dd9d97c5e5#72517",
                        "3527313234384708"
                    ),
                    hex_truncated: false,
                    decode_error: None,
                },
                TapSampleBag {
                    byte_len: 226,
                    timestamp_ns: Some(3527313290829666),
                    surface_id: Some("c6ecf65b-9da5-493d-9017-9799ad80d3ff#72517".to_string()),
                    fields: video_frame_fields(
                        "c6ecf65b-9da5-493d-9017-9799ad80d3ff#72517",
                        "3527313277551083"
                    ),
                    hex_truncated: false,
                    decode_error: None,
                },
            ]
        );
    }

    #[test]
    fn a_truncated_bag_keeps_its_timestamp_and_says_why_its_payload_was_not_decoded() {
        let first_100_bytes_of_hex = &the_first_real_bags_hex()[..200];

        let tap_sample = tap_sample_from_the_tap_tool_result(&tap_tool_result_holding(json!([
            { "byte_len": 226, "hex_preview": first_100_bytes_of_hex, "hex_truncated": true }
        ])))
        .unwrap();

        assert_eq!(
            tap_sample.bags,
            vec![TapSampleBag {
                byte_len: 226,
                timestamp_ns: Some(3527313199945666),
                surface_id: None,
                fields: Vec::new(),
                hex_truncated: true,
                decode_error: Some(
                    "the tap returned the first 100 of the bag's 226 bytes, so its payload was \
                     not decoded"
                        .to_string()
                ),
            }]
        );
    }

    #[test]
    fn a_bag_that_does_not_decode_says_why_and_the_rest_of_the_sample_still_reads() {
        let tap_sample = tap_sample_from_the_tap_tool_result(&tap_tool_result_holding(json!([
            { "byte_len": 2, "hex_preview": "zz", "hex_truncated": false },
            { "byte_len": 3, "hex_preview": "abc", "hex_truncated": false },
            { "byte_len": 2, "hex_preview": "0102", "hex_truncated": false },
            { "byte_len": 226, "hex_preview": the_first_real_bags_hex(), "hex_truncated": false }
        ])))
        .unwrap();

        let decode_errors: Vec<Option<&str>> = tap_sample
            .bags
            .iter()
            .map(|bag| bag.decode_error.as_deref())
            .collect();
        assert_eq!(
            decode_errors,
            vec![
                Some("the bag's hex holds a character that is not a hex digit"),
                Some("the bag's hex has an odd number of digits, 3"),
                Some("the bag's 2 bytes cannot hold a 76-byte frame header"),
                None,
            ]
        );
        assert!(tap_sample.bags[..3]
            .iter()
            .all(|bag| bag.timestamp_ns.is_none() && bag.fields.is_empty()));
        assert!(tap_sample.bags[3].surface_id.is_some());
    }

    #[test]
    fn a_result_naming_no_channel_is_refused_and_fields_this_app_does_not_know_are_ignored() {
        let failure = tap_sample_from_the_tap_tool_result(
            &json!({ "received": 0, "window_ms": 500, "dropped_bags": 0, "bags": [] }).to_string(),
        )
        .unwrap_err();
        assert!(failure.contains("channel"), "{failure}");

        let tap_sample = tap_sample_from_the_tap_tool_result(
            &json!({
                "channel": "main/quiet/out", "received": 0, "window_ms": 500, "dropped_bags": 2,
                "a_field_from_later": true
            })
            .to_string(),
        )
        .unwrap();
        assert_eq!(tap_sample.bags, Vec::new());
        assert_eq!(tap_sample.dropped_bags, 2);
    }

    #[test]
    fn hex_reads_in_either_case() {
        assert_eq!(
            bytes_from_tap_tool_hex("00ff7Fa0"),
            Ok(vec![0x00, 0xff, 0x7f, 0xa0])
        );
        assert_eq!(bytes_from_tap_tool_hex(""), Ok(Vec::new()));
        assert!(bytes_from_tap_tool_hex("+f").is_err());
    }

    #[test]
    fn an_output_port_is_addressed_stream_node_port() {
        assert_eq!(
            output_port_channel_address("main", "invertingeffect", "video_to_downstream"),
            "main/invertingeffect/video_to_downstream"
        );
    }
}
