// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! A preview of the frame an output port carries: one bag tapped, and the surface id it names
//! exchanged for a PNG right after, while the frame's pool slot still holds it; a frame the
//! runtime recycled between the two is tapped afresh.

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::Serialize;

use crate::local_api_client::{
    ExchangedSurfaceImage, LocalApiClient, SurfaceImageExchange, LARGEST_LOCAL_API_RESPONSE_BYTES,
};
use crate::output_port_tap_sample::TAPPED_BAG_HEX_BYTE_LIMIT;

/// The smallest long edge, in pixels, a preview may be bounded to.
pub const SMALLEST_FRAME_PREVIEW_LONG_EDGE_PIXELS: u32 = 64;

/// The largest long edge, in pixels, a preview may be bounded to.
pub const LARGEST_FRAME_PREVIEW_LONG_EDGE_PIXELS: u32 = 1920;

/// Tap-then-exchange rounds one preview spends before a frame recycled on every round refuses it.
const FRAME_PREVIEW_ATTEMPTS: u32 = 3;

/// The bytes every PNG starts with.
const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];

/// A PNG's bytes beyond its pixels — row filter bytes, deflate blocks, chunk headers — at the
/// largest preview, with room to spare.
const PNG_BYTES_BEYOND_ITS_PIXELS_AT_THE_LARGEST_PREVIEW: usize = 64 * 1024;

// The largest preview — a square RGBA frame that does not compress at all — fits one local API
// response.
const _: () = assert!(
    LARGEST_FRAME_PREVIEW_LONG_EDGE_PIXELS as usize
        * LARGEST_FRAME_PREVIEW_LONG_EDGE_PIXELS as usize
        * 4
        + PNG_BYTES_BEYOND_ITS_PIXELS_AT_THE_LARGEST_PREVIEW
        <= LARGEST_LOCAL_API_RESPONSE_BYTES
);

/// A frame an output port carried, as a PNG the window shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FramePreview {
    /// The output port's address as the runtime answered it, `<stream>/<node>/<port>`.
    pub channel: String,
    pub surface_id: String,
    /// The PNG, base64-encoded.
    pub png_base64: String,
    /// The PNG's own width, which the long-edge cap bounds.
    pub image_width: u32,
    /// The PNG's own height, which the long-edge cap bounds.
    pub image_height: u32,
    /// The surface's own width; `None` when the runtime did not state it.
    pub source_width: Option<u32>,
    /// The surface's own height; `None` when the runtime did not state it.
    pub source_height: Option<u32>,
    /// When the channel carried the tapped bag; `None` when its frame header could not be read.
    pub timestamp_ns: Option<i64>,
    /// The tap-then-exchange rounds the preview took.
    pub attempts: u32,
}

/// A preview of the frame the output port at `channel` carries now, its long edge at most
/// `long_edge_px` clamped to [64, 1920]; refused in plain words when no bag arrives, its bags
/// name no frame, the runtime refuses, or every frame tapped is recycled before its exchange.
pub fn preview_output_frame(
    local_api_client: &LocalApiClient,
    channel: &str,
    long_edge_px: u32,
) -> Result<FramePreview, String> {
    let long_edge_pixel_cap = long_edge_px.clamp(
        SMALLEST_FRAME_PREVIEW_LONG_EDGE_PIXELS,
        LARGEST_FRAME_PREVIEW_LONG_EDGE_PIXELS,
    );
    for attempt in 1..=FRAME_PREVIEW_ATTEMPTS {
        let tap_sample = local_api_client
            .tap_output_port(channel, 1, TAPPED_BAG_HEX_BYTE_LIMIT)
            .map_err(|failure| failure.failure_description)?;
        let Some(tapped_bag) = tap_sample.bags.into_iter().next() else {
            return Err(format!(
                "no bag arrived on {channel} within {} ms",
                tap_sample.window_ms
            ));
        };
        if let Some(decode_error) = tapped_bag.decode_error {
            return Err(format!("{channel}'s bag could not be read: {decode_error}"));
        }
        let Some(surface_id) = tapped_bag.surface_id else {
            return Err(format!(
                "{channel}'s bags carry no surface_id, so there is no frame to show"
            ));
        };
        match local_api_client
            .exchange_surface_for_png_image(&surface_id, long_edge_pixel_cap)
            .map_err(|failure| failure.failure_description)?
        {
            SurfaceImageExchange::Exchanged(exchanged_surface_image) => {
                return frame_preview_of(
                    tap_sample.channel,
                    surface_id,
                    exchanged_surface_image,
                    tapped_bag.timestamp_ns,
                    attempt,
                );
            }
            SurfaceImageExchange::FrameRecycled { refusal } => tracing::debug!(
                %refusal,
                attempt,
                "the tapped frame was recycled before its exchange; tapping a newer one"
            ),
        }
    }
    Err(format!(
        "every frame tapped from {channel} was recycled before it could be exchanged, \
         {FRAME_PREVIEW_ATTEMPTS} times in a row"
    ))
}

fn frame_preview_of(
    channel: String,
    surface_id: String,
    exchanged_surface_image: ExchangedSurfaceImage,
    timestamp_ns: Option<i64>,
    attempts: u32,
) -> Result<FramePreview, String> {
    let (image_width, image_height) =
        png_image_dimensions(&exchanged_surface_image.png_image_bytes).ok_or_else(|| {
            format!("the runtime exchanged {surface_id} for bytes that are not a PNG")
        })?;
    Ok(FramePreview {
        channel,
        surface_id,
        png_base64: BASE64_STANDARD.encode(&exchanged_surface_image.png_image_bytes),
        image_width,
        image_height,
        source_width: exchanged_surface_image.source_surface_pixel_width,
        source_height: exchanged_surface_image.source_surface_pixel_height,
        timestamp_ns,
        attempts,
    })
}

/// The width and height a PNG's first chunk, its IHDR, states: after the signature come the
/// chunk's 4-byte length, its type, then the big-endian width and height. `None` for bytes that
/// are not a PNG.
fn png_image_dimensions(png_image_bytes: &[u8]) -> Option<(u32, u32)> {
    let (signature, chunks) = png_image_bytes.split_at_checked(PNG_SIGNATURE.len())?;
    if signature != PNG_SIGNATURE || chunks.get(4..8)? != b"IHDR" {
        return None;
    }
    let image_width = u32::from_be_bytes(chunks.get(8..12)?.try_into().ok()?);
    let image_height = u32::from_be_bytes(chunks.get(12..16)?.try_into().ok()?);
    Some((image_width, image_height))
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::time::Duration;

    use serde_json::{json, Value};

    use super::*;
    use crate::fake_local_api_server::{
        http_response, http_response_with_headers, tool_result_response, FakeLocalApiServer,
    };

    const CHANNEL: &str = "main/invertingeffect/video_to_downstream";

    /// A real runtime's 640-pixel exchange of a 1280 × 720 test-pattern frame.
    const A_REAL_640_PIXEL_PNG: &[u8] = include_bytes!(
        "../test-fixtures/local-api-surface-image-of-a-1280x720-test-pattern-frame-at-640.png"
    );

    /// The head a real runtime answered a recycled frame's exchange with, its 328-byte body cut.
    const A_REAL_RECYCLED_FRAME_RESPONSE_HEAD: &[u8] = include_bytes!(
        "../test-fixtures/local-api-surface-image-exchange-head-of-a-recycled-frame.txt"
    );

    /// A real runtime's `tap` answer carrying only the fixture's bag at `bag_index`.
    fn tap_tool_result_of_the_real_bag(bag_index: usize) -> Vec<u8> {
        let mut tap_tool_result: Value = serde_json::from_str(include_str!(
            "../test-fixtures/local-api-tap-tool-result-of-main-invertingeffect-video_to_downstream-3-bags.json"
        ))
        .unwrap();
        let tapped_bag = tap_tool_result["bags"][bag_index].clone();
        tap_tool_result["requested"] = json!(1);
        tap_tool_result["received"] = json!(1);
        tap_tool_result["bags"] = json!([tapped_bag]);
        tool_result_response(tap_tool_result)
    }

    /// The exchange's `200`, carrying the real 640-pixel PNG of a 1280 × 720 surface.
    fn the_real_exchange_answer() -> Vec<u8> {
        http_response_with_headers(
            "200 OK",
            &[
                ("content-type", "image/png"),
                ("x-streamlib-surface-pixel-width", "1280"),
                ("x-streamlib-surface-pixel-height", "720"),
            ],
            A_REAL_640_PIXEL_PNG,
        )
    }

    /// The exchange's `410` for `surface_id`, as the runtime words a recycled frame.
    fn recycled_frame_answer(surface_id: &str) -> Vec<u8> {
        let refusal = format!(
            "surface '{surface_id}' names a recycled frame: its pool slot has been rehanded to \
             the producer since (this id published generation 72516, the slot is on generation \
             72524), so the frame this id named no longer exists — a frame must be claimed at \
             read time to outlive the pool's cycling"
        );
        let body = json!({ "error": refusal }).to_string();
        assert_eq!(
            body.len(),
            328,
            "the body the real head's content-length counts"
        );
        let mut response = A_REAL_RECYCLED_FRAME_RESPONSE_HEAD.to_vec();
        response.extend_from_slice(body.as_bytes());
        response
    }

    fn tap_tool_result_holding_bags(bags: Value) -> Vec<u8> {
        tool_result_response(json!({
            "channel": CHANNEL, "requested": 1, "received": bags.as_array().unwrap().len(),
            "window_ms": 500, "dropped_bags": 0, "max_bag_bytes": 65536,
            "bags_withheld_at_byte_budget": 0, "bags": bags
        }))
    }

    /// The hex of a bag whose frame header frames `payload`.
    fn hex_of_a_bag_framing(payload: &rmpv::Value) -> String {
        let mut payload_bytes = Vec::new();
        rmpv::encode::write_value(&mut payload_bytes, payload).unwrap();
        let mut bag_bytes = vec![0u8; 64];
        bag_bytes[0] = 5;
        bag_bytes[1..6].copy_from_slice(b"audio");
        bag_bytes.extend_from_slice(&42i64.to_le_bytes());
        bag_bytes.extend_from_slice(&u32::try_from(payload_bytes.len()).unwrap().to_le_bytes());
        bag_bytes.extend_from_slice(&payload_bytes);
        bag_bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn request_line(request: &str) -> &str {
        request.lines().next().unwrap()
    }

    #[test]
    fn a_frame_is_tapped_then_exchanged_for_its_png_at_once() {
        let server = FakeLocalApiServer::answering(vec![
            tap_tool_result_of_the_real_bag(0),
            the_real_exchange_answer(),
        ]);

        let frame_preview = preview_output_frame(&server.client(), CHANNEL, 640).unwrap();

        assert_eq!(
            BASE64_STANDARD.decode(&frame_preview.png_base64).unwrap(),
            A_REAL_640_PIXEL_PNG
        );
        assert_eq!(
            frame_preview,
            FramePreview {
                channel: CHANNEL.to_string(),
                surface_id: "c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516".to_string(),
                png_base64: frame_preview.png_base64.clone(),
                image_width: 640,
                image_height: 360,
                source_width: Some(1280),
                source_height: Some(720),
                timestamp_ns: Some(3527313199945666),
                attempts: 1,
            }
        );
        let received_requests = server.received_requests();
        assert_eq!(request_line(&received_requests[0]), "POST /mcp HTTP/1.1");
        assert!(received_requests[0].contains(
            r#""arguments":{"channel":"main/invertingeffect/video_to_downstream","count":1,"max_bag_bytes":65536}"#
        ));
        assert_eq!(
            request_line(&received_requests[1]),
            "GET /api/surfaces/c6ecf65b-9da5-493d-9017-9799ad80d3ff%2372516/image?downscale_long_edge_pixel_cap=640 HTTP/1.1"
        );
    }

    #[test]
    fn a_frame_recycled_before_its_exchange_is_tapped_afresh() {
        let server = FakeLocalApiServer::answering(vec![
            tap_tool_result_of_the_real_bag(0),
            recycled_frame_answer("c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516"),
            tap_tool_result_of_the_real_bag(1),
            the_real_exchange_answer(),
        ]);

        let frame_preview = preview_output_frame(&server.client(), CHANNEL, 640).unwrap();

        assert_eq!(frame_preview.attempts, 2);
        assert_eq!(
            frame_preview.surface_id,
            "e17a285e-5861-495a-91fe-30dd9d97c5e5#72517"
        );
        assert_eq!(frame_preview.timestamp_ns, Some(3527313244200208));
        let request_lines: Vec<String> = server
            .received_requests()
            .iter()
            .map(|request| request_line(request).to_string())
            .collect();
        assert_eq!(
            request_lines,
            vec![
                "POST /mcp HTTP/1.1",
                "GET /api/surfaces/c6ecf65b-9da5-493d-9017-9799ad80d3ff%2372516/image?downscale_long_edge_pixel_cap=640 HTTP/1.1",
                "POST /mcp HTTP/1.1",
                "GET /api/surfaces/e17a285e-5861-495a-91fe-30dd9d97c5e5%2372517/image?downscale_long_edge_pixel_cap=640 HTTP/1.1",
            ]
        );
    }

    #[test]
    fn a_frame_recycled_on_every_attempt_is_refused_after_three() {
        let server = FakeLocalApiServer::answering(
            [0, 1, 2]
                .into_iter()
                .flat_map(|bag_index| {
                    [
                        tap_tool_result_of_the_real_bag(bag_index),
                        recycled_frame_answer("c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516"),
                    ]
                })
                .collect(),
        );

        assert_eq!(
            preview_output_frame(&server.client(), CHANNEL, 640),
            Err(
                "every frame tapped from main/invertingeffect/video_to_downstream was recycled \
                 before it could be exchanged, 3 times in a row"
                    .to_string()
            )
        );
        assert_eq!(server.received_requests().len(), 6);
    }

    #[test]
    fn a_quiet_channel_or_bags_naming_no_frame_are_refused_in_plain_words() {
        let quiet = FakeLocalApiServer::answering(vec![tap_tool_result_holding_bags(json!([]))]);
        assert_eq!(
            preview_output_frame(&quiet.client(), CHANNEL, 640),
            Err(
                "no bag arrived on main/invertingeffect/video_to_downstream within 500 ms"
                    .to_string()
            )
        );

        let audio_bag = hex_of_a_bag_framing(&rmpv::Value::Map(vec![(
            rmpv::Value::from("samples"),
            rmpv::Value::Binary(vec![0; 16]),
        )]));
        let frameless = FakeLocalApiServer::answering(vec![tap_tool_result_holding_bags(json!([
            { "byte_len": audio_bag.len() / 2, "hex_preview": audio_bag, "hex_truncated": false }
        ]))]);
        assert_eq!(
            preview_output_frame(&frameless.client(), CHANNEL, 640),
            Err(
                "main/invertingeffect/video_to_downstream's bags carry no surface_id, so there is \
                 no frame to show"
                    .to_string()
            )
        );

        let unreadable = FakeLocalApiServer::answering(vec![tap_tool_result_holding_bags(json!([
            { "byte_len": 2, "hex_preview": "0102", "hex_truncated": false }
        ]))]);
        assert_eq!(
            preview_output_frame(&unreadable.client(), CHANNEL, 640),
            Err(
                "main/invertingeffect/video_to_downstream's bag could not be read: the bag's 2 \
                 bytes cannot hold a 76-byte frame header"
                    .to_string()
            )
        );
    }

    #[test]
    fn a_tap_or_an_exchange_the_runtime_refuses_carries_its_own_words() {
        let tap_refusal = "tap attach failed: Resource not found: no output port `nope`";
        let refused_tap = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "application/json",
            &json!({
                "jsonrpc": "2.0", "id": 1,
                "result": { "content": [{ "type": "text", "text": tap_refusal }], "isError": true }
            })
            .to_string(),
        )]);
        assert_eq!(
            preview_output_frame(&refused_tap.client(), CHANNEL, 640),
            Err(tap_refusal.to_string())
        );

        let exchange_refusal = "Resource not found: no surface `c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516` resolves on this node";
        let refused_exchange = FakeLocalApiServer::answering(vec![
            tap_tool_result_of_the_real_bag(0),
            http_response(
                "404 Not Found",
                "application/json",
                &json!({ "error": exchange_refusal }).to_string(),
            ),
        ]);
        assert_eq!(
            preview_output_frame(&refused_exchange.client(), CHANNEL, 640),
            Err(exchange_refusal.to_string())
        );
    }

    #[test]
    fn the_long_edge_asked_for_is_clamped_to_64_through_1920() {
        for (long_edge_px, long_edge_pixel_cap) in [(10, 64), (640, 640), (5000, 1920)] {
            let server = FakeLocalApiServer::answering(vec![
                tap_tool_result_of_the_real_bag(0),
                the_real_exchange_answer(),
            ]);

            preview_output_frame(&server.client(), CHANNEL, long_edge_px).unwrap();

            assert!(
                request_line(&server.received_requests()[1]).ends_with(&format!(
                    "?downscale_long_edge_pixel_cap={long_edge_pixel_cap} HTTP/1.1"
                )),
                "{long_edge_px}"
            );
        }
    }

    #[test]
    fn an_exchange_answering_bytes_that_are_not_a_png_is_refused() {
        let server = FakeLocalApiServer::answering(vec![
            tap_tool_result_of_the_real_bag(0),
            http_response_with_headers("200 OK", &[("content-type", "image/png")], b"not a png"),
        ]);

        assert_eq!(
            preview_output_frame(&server.client(), CHANNEL, 640),
            Err(
                "the runtime exchanged c6ecf65b-9da5-493d-9017-9799ad80d3ff#72516 for bytes that \
                 are not a PNG"
                    .to_string()
            )
        );
    }

    #[test]
    fn a_pngs_dimensions_come_from_its_ihdr() {
        assert_eq!(png_image_dimensions(A_REAL_640_PIXEL_PNG), Some((640, 360)));
        assert_eq!(png_image_dimensions(&A_REAL_640_PIXEL_PNG[..20]), None);
        let mut not_ihdr_first = A_REAL_640_PIXEL_PNG.to_vec();
        not_ihdr_first[12..16].copy_from_slice(b"IDAT");
        assert_eq!(png_image_dimensions(&not_ihdr_first), None);
    }

    /// Against a running runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> cargo test --
    /// --ignored a_running_runtimes`, naming another channel than the local proof's in
    /// `TATOLAB_APP_LIVE_FRAME_CHANNEL`.
    #[test]
    #[ignore = "needs a running tatolabd; name its socket in TATOLAB_APP_LIVE_LOCAL_API_SOCKET"]
    fn a_running_runtimes_output_port_is_tapped_and_its_frame_previewed() {
        let socket_path = std::env::var_os("TATOLAB_APP_LIVE_LOCAL_API_SOCKET")
            .expect("TATOLAB_APP_LIVE_LOCAL_API_SOCKET names a running runtime's local API socket");
        let channel =
            std::env::var("TATOLAB_APP_LIVE_FRAME_CHANNEL").unwrap_or_else(|_| CHANNEL.to_string());
        let client = LocalApiClient::new(Path::new(&socket_path), Duration::from_secs(5));

        let tap_sample = client
            .tap_output_port(&channel, 3, TAPPED_BAG_HEX_BYTE_LIMIT)
            .unwrap();
        assert!(tap_sample.received > 0, "{tap_sample:?}");
        for tapped_bag in &tap_sample.bags {
            assert_eq!(tapped_bag.decode_error, None, "{tapped_bag:?}");
            assert!(tapped_bag.timestamp_ns.is_some(), "{tapped_bag:?}");
            assert!(tapped_bag.surface_id.is_some(), "{tapped_bag:?}");
        }

        let frame_preview = preview_output_frame(&client, &channel, 640).unwrap();
        let png_image_bytes = BASE64_STANDARD.decode(&frame_preview.png_base64).unwrap();
        assert_eq!(
            png_image_dimensions(&png_image_bytes),
            Some((frame_preview.image_width, frame_preview.image_height))
        );
        let source_long_edge = frame_preview
            .source_width
            .zip(frame_preview.source_height)
            .map(|(source_width, source_height)| source_width.max(source_height))
            .unwrap();
        assert_eq!(
            frame_preview.image_width.max(frame_preview.image_height),
            source_long_edge.min(640)
        );
        assert!(frame_preview.attempts <= FRAME_PREVIEW_ATTEMPTS);
    }
}
