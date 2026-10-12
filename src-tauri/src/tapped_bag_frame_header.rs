// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The frame header every tapped bag starts with, laid out as StreamLib's `streamlib-ipc-types`
//! writes it (`FrameHeader`, `FRAME_HEADER_SIZE`) and mirrored here because that crate pulls in
//! iceoryx2: `[port_key: 64][timestamp_ns: 8, little-endian i64][len: 4, little-endian u32]
//! [data: len]`, the port key being a length byte and 63 name bytes.

/// The port key's bytes: its length byte and its 63 name bytes.
const FRAME_HEADER_PORT_KEY_BYTE_LEN: usize = 64;

/// The timestamp's bytes, a little-endian `i64` of nanoseconds.
const FRAME_HEADER_TIMESTAMP_NS_BYTE_LEN: usize = 8;

/// The payload length's bytes, a little-endian `u32`.
const FRAME_HEADER_PAYLOAD_LEN_BYTE_LEN: usize = 4;

/// Where the payload length starts, after the port key and the timestamp.
const FRAME_HEADER_PAYLOAD_LEN_OFFSET: usize =
    FRAME_HEADER_PORT_KEY_BYTE_LEN + FRAME_HEADER_TIMESTAMP_NS_BYTE_LEN;

/// The whole frame header's bytes: 76.
pub const FRAME_HEADER_BYTE_LEN: usize =
    FRAME_HEADER_PAYLOAD_LEN_OFFSET + FRAME_HEADER_PAYLOAD_LEN_BYTE_LEN;

/// What a tapped bag's frame header says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TappedBagFrameHeader {
    /// When the channel carried the bag, in the runtime's monotonic nanoseconds.
    pub timestamp_ns: i64,
    /// How many payload bytes follow the header.
    pub declared_payload_byte_len: u32,
}

/// The frame header `bag_bytes` starts with; refused when they are too short to hold one.
pub fn read_tapped_bag_frame_header(bag_bytes: &[u8]) -> Result<TappedBagFrameHeader, String> {
    frame_header_fields(bag_bytes).ok_or_else(|| {
        format!(
            "the bag's {} bytes cannot hold a {FRAME_HEADER_BYTE_LEN}-byte frame header",
            bag_bytes.len()
        )
    })
}

/// The payload `frame_header` declares, right after the header in `bag_bytes`; refused when fewer
/// bytes followed. Bytes past it are the transport's slack.
pub fn tapped_bag_payload<'bag>(
    bag_bytes: &'bag [u8],
    frame_header: &TappedBagFrameHeader,
) -> Result<&'bag [u8], String> {
    let followed_payload = bag_bytes.get(FRAME_HEADER_BYTE_LEN..).unwrap_or_default();
    usize::try_from(frame_header.declared_payload_byte_len)
        .ok()
        .and_then(|declared_payload_byte_len| followed_payload.get(..declared_payload_byte_len))
        .ok_or_else(|| {
            format!(
                "the bag's frame header declares a {}-byte payload, but {} bytes followed it",
                frame_header.declared_payload_byte_len,
                followed_payload.len()
            )
        })
}

fn frame_header_fields(bag_bytes: &[u8]) -> Option<TappedBagFrameHeader> {
    let (frame_header, _payload) = bag_bytes.split_at_checked(FRAME_HEADER_BYTE_LEN)?;
    let timestamp_ns_bytes =
        frame_header.get(FRAME_HEADER_PORT_KEY_BYTE_LEN..FRAME_HEADER_PAYLOAD_LEN_OFFSET)?;
    let payload_len_bytes = frame_header.get(FRAME_HEADER_PAYLOAD_LEN_OFFSET..)?;
    Some(TappedBagFrameHeader {
        timestamp_ns: i64::from_le_bytes(timestamp_ns_bytes.try_into().ok()?),
        declared_payload_byte_len: u32::from_le_bytes(payload_len_bytes.try_into().ok()?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::output_port_tap_sample::bytes_from_tap_tool_hex;

    /// The first bag a real runtime's `tap` returned from `main/invertingeffect/video_to_downstream`.
    fn a_real_video_bag() -> Vec<u8> {
        let tap_tool_result: serde_json::Value = serde_json::from_str(include_str!(
            "../test-fixtures/local-api-tap-tool-result-of-main-invertingeffect-video_to_downstream-3-bags.json"
        ))
        .unwrap();
        bytes_from_tap_tool_hex(tap_tool_result["bags"][0]["hex_preview"].as_str().unwrap())
            .unwrap()
    }

    #[test]
    fn a_real_bag_splits_into_its_76_byte_header_and_the_msgpack_payload_it_declares() {
        let bag_bytes = a_real_video_bag();
        assert_eq!(FRAME_HEADER_BYTE_LEN, 76);
        assert_eq!(bag_bytes.len(), 226);
        assert_eq!(&bag_bytes[1..20], b"video_to_downstream");

        let frame_header = read_tapped_bag_frame_header(&bag_bytes).unwrap();
        assert_eq!(
            frame_header,
            TappedBagFrameHeader {
                timestamp_ns: 3527313199945666,
                declared_payload_byte_len: 150,
            }
        );
        let payload = tapped_bag_payload(&bag_bytes, &frame_header).unwrap();
        assert_eq!(payload.len(), 150);
        assert_eq!(payload[0], 0x85, "a five-entry msgpack map");
        assert_eq!(&payload[1..12], b"\xaasurface_id");
    }

    #[test]
    fn bytes_past_the_declared_payload_are_slack() {
        let mut bag_bytes = a_real_video_bag();
        bag_bytes.extend_from_slice(b"slack");

        let frame_header = read_tapped_bag_frame_header(&bag_bytes).unwrap();

        assert_eq!(
            tapped_bag_payload(&bag_bytes, &frame_header).unwrap().len(),
            150
        );
    }

    #[test]
    fn bytes_too_short_for_a_header_or_for_the_payload_it_declares_are_refused() {
        let bag_bytes = a_real_video_bag();

        assert_eq!(
            read_tapped_bag_frame_header(&bag_bytes[..75]),
            Err("the bag's 75 bytes cannot hold a 76-byte frame header".to_string())
        );
        let frame_header = read_tapped_bag_frame_header(&bag_bytes[..100]).unwrap();
        assert_eq!(
            tapped_bag_payload(&bag_bytes[..100], &frame_header),
            Err(
                "the bag's frame header declares a 150-byte payload, but 24 bytes followed it"
                    .to_string()
            )
        );
    }
}
