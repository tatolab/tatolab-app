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
const FRAME_HEADER_BYTE_LEN: usize =
    FRAME_HEADER_PAYLOAD_LEN_OFFSET + FRAME_HEADER_PAYLOAD_LEN_BYTE_LEN;

/// A tapped bag read at its frame header: what the header says, and the bytes after it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TappedBagFrame<'bag> {
    /// When the channel carried the bag, in the runtime's monotonic nanoseconds.
    pub timestamp_ns: i64,
    declared_payload_byte_len: u32,
    bytes_after_the_header: &'bag [u8],
}

/// `bag_bytes` read at the frame header they start with; refused when they are too short to hold
/// one.
pub fn read_tapped_bag_frame(bag_bytes: &[u8]) -> Result<TappedBagFrame<'_>, String> {
    tapped_bag_frame_fields(bag_bytes).ok_or_else(|| {
        format!(
            "the bag's {} bytes cannot hold a {FRAME_HEADER_BYTE_LEN}-byte frame header",
            bag_bytes.len()
        )
    })
}

impl<'bag> TappedBagFrame<'bag> {
    /// The payload the header declares, right after it; refused when fewer bytes followed. Bytes
    /// past it are the transport's slack.
    pub fn payload(&self) -> Result<&'bag [u8], String> {
        usize::try_from(self.declared_payload_byte_len)
            .ok()
            .and_then(|declared_payload_byte_len| {
                self.bytes_after_the_header.get(..declared_payload_byte_len)
            })
            .ok_or_else(|| {
                format!(
                    "the bag's frame header declares a {}-byte payload, but {} bytes followed it",
                    self.declared_payload_byte_len,
                    self.bytes_after_the_header.len()
                )
            })
    }
}

fn tapped_bag_frame_fields(bag_bytes: &[u8]) -> Option<TappedBagFrame<'_>> {
    let (frame_header, bytes_after_the_header) =
        bag_bytes.split_at_checked(FRAME_HEADER_BYTE_LEN)?;
    let timestamp_ns_bytes =
        frame_header.get(FRAME_HEADER_PORT_KEY_BYTE_LEN..FRAME_HEADER_PAYLOAD_LEN_OFFSET)?;
    let payload_len_bytes = frame_header.get(FRAME_HEADER_PAYLOAD_LEN_OFFSET..)?;
    Some(TappedBagFrame {
        timestamp_ns: i64::from_le_bytes(timestamp_ns_bytes.try_into().ok()?),
        declared_payload_byte_len: u32::from_le_bytes(payload_len_bytes.try_into().ok()?),
        bytes_after_the_header,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake_local_api_server::the_real_tapped_bag_hex;
    use crate::output_port_tap_sample::bytes_from_tap_tool_hex;

    /// The first bag a real runtime's `tap` returned from `main/invertingeffect/video_to_downstream`.
    fn a_real_video_bag() -> Vec<u8> {
        bytes_from_tap_tool_hex(&the_real_tapped_bag_hex(0)).unwrap()
    }

    #[test]
    fn a_real_bag_splits_into_its_76_byte_header_and_the_msgpack_payload_it_declares() {
        let bag_bytes = a_real_video_bag();
        assert_eq!(FRAME_HEADER_BYTE_LEN, 76);
        assert_eq!(bag_bytes.len(), 226);
        assert_eq!(&bag_bytes[1..20], b"video_to_downstream");

        let tapped_bag_frame = read_tapped_bag_frame(&bag_bytes).unwrap();
        assert_eq!(tapped_bag_frame.timestamp_ns, 3527313199945666);
        assert_eq!(tapped_bag_frame.declared_payload_byte_len, 150);
        let payload = tapped_bag_frame.payload().unwrap();
        assert_eq!(payload.len(), 150);
        assert_eq!(payload[0], 0x85, "a five-entry msgpack map");
        assert_eq!(&payload[1..12], b"\xaasurface_id");
    }

    #[test]
    fn bytes_past_the_declared_payload_are_slack() {
        let mut bag_bytes = a_real_video_bag();
        bag_bytes.extend_from_slice(b"slack");

        let tapped_bag_frame = read_tapped_bag_frame(&bag_bytes).unwrap();

        assert_eq!(tapped_bag_frame.payload().unwrap().len(), 150);
    }

    #[test]
    fn bytes_too_short_for_a_header_or_for_the_payload_it_declares_are_refused() {
        let bag_bytes = a_real_video_bag();

        assert_eq!(
            read_tapped_bag_frame(&bag_bytes[..75]),
            Err("the bag's 75 bytes cannot hold a 76-byte frame header".to_string())
        );
        assert_eq!(
            read_tapped_bag_frame(&bag_bytes[..100]).unwrap().payload(),
            Err(
                "the bag's frame header declares a 150-byte payload, but 24 bytes followed it"
                    .to_string()
            )
        );
    }
}
