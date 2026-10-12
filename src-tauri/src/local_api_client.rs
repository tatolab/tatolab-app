// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's client of the runtime's local API: one short HTTP/1.1 request per call over the
//! local API's Unix socket. `GET /health` says the runtime is up, the MCP tools `list_streams`,
//! `logs` and `tap` over `POST /mcp` list its streams, read one's log records and sample the bags
//! an output port carries, `GET /api/graph` names the machine and draws one stream's graph, and
//! `GET /api/surfaces/{surface_id}/image` exchanges a published frame for its pixels.
//!
//! The MCP request is spelled as StreamLib's runtime requires one (`streamlib-api-server`'s
//! `mcp.rs` serves rmcp's stateless Streamable HTTP with per-request protocol metadata
//! required): the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, an `Accept` of
//! both JSON and SSE, and `_meta` carrying the protocol version, client info and capabilities.

use std::fmt::Write as _;
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::output_port_tap_sample::{tap_sample_from_the_tap_tool_result, TapSample};
use crate::stream_graph_summary::{stream_graph_summary_from_the_graph_json, StreamGraphSummary};
use crate::stream_log_records_page::{
    stream_log_records_page_from_the_logs_tool_result, StreamLogRecordsPage,
};
use crate::tatolab_status::ListedStream;

/// The MCP protocol revision the runtime serves, and the only one.
pub const LOCAL_API_MCP_PROTOCOL_VERSION: &str = "2026-07-28";

/// The client name the app gives the runtime in every MCP request's `_meta`.
const LOCAL_API_MCP_CLIENT_NAME: &str = "tatolab-app";

/// The most bytes one local API response may carry before the client gives up on it.
const LARGEST_LOCAL_API_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

/// The most bags one tap asks for.
pub const LARGEST_TAP_SAMPLE_BAG_COUNT: u32 = 32;

/// The most bytes of each bag a tap asks the runtime to hex-encode; a bigger bag comes back
/// truncated and undecoded.
const TAPPED_BAG_HEX_BYTE_LIMIT: u32 = 64 * 1024;

/// The JSON one tap result spends on a bag beyond its hex, with room to spare.
const TAP_RESULT_JSON_BYTES_PER_BAG: usize = 1024;

// The largest tap's hex — two digits a byte — and its JSON fit one response.
const _: () = assert!(
    LARGEST_TAP_SAMPLE_BAG_COUNT as usize
        * (2 * TAPPED_BAG_HEX_BYTE_LIMIT as usize + TAP_RESULT_JSON_BYTES_PER_BAG)
        <= LARGEST_LOCAL_API_RESPONSE_BYTES
);

/// The smallest long edge, in pixels, an exchanged surface image is bounded to.
pub const SMALLEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP: u32 = 64;

/// The largest long edge, in pixels, an exchanged surface image is bounded to.
pub const LARGEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP: u32 = 1920;

/// A PNG's bytes beyond its pixels — row filter bytes, deflate blocks, chunk headers — at the
/// largest long edge, with room to spare.
const PNG_BYTES_BEYOND_ITS_PIXELS_AT_THE_LARGEST_LONG_EDGE: usize = 64 * 1024;

// The largest exchanged image — a square frame as RGBA8, the runtime's PNG format, that does not
// compress at all — fits one response.
const _: () = assert!(
    LARGEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP as usize
        * LARGEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP as usize
        * 4
        + PNG_BYTES_BEYOND_ITS_PIXELS_AT_THE_LARGEST_LONG_EDGE
        <= LARGEST_LOCAL_API_RESPONSE_BYTES
);

/// Every byte outside RFC 3986's unreserved set, which a query value or a path segment carries
/// percent-encoded.
const BYTES_OUTSIDE_THE_RFC_3986_UNRESERVED_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// The status the surface exchange answers for a frame whose pool slot was recycled after its bag
/// was published, as StreamLib's `local_api_wire_contract.rs` names it: a newer bag's id answers.
const RECYCLED_FRAME_HTTP_STATUS_CODE: u16 = 410;

/// The header carrying the exchanged surface's own width, which a downscaled PNG does not state.
const SURFACE_PIXEL_WIDTH_HEADER_NAME: &str = "x-streamlib-surface-pixel-width";

/// The header carrying the exchanged surface's own height.
const SURFACE_PIXEL_HEIGHT_HEADER_NAME: &str = "x-streamlib-surface-pixel-height";

/// Why a local API request came back without an answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalApiRequestFailure {
    pub failure_description: String,
}

impl std::fmt::Display for LocalApiRequestFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.failure_description)
    }
}

impl LocalApiRequestFailure {
    fn new(failure_description: impl Into<String>) -> Self {
        Self {
            failure_description: failure_description.into(),
        }
    }
}

/// One HTTP response as the client read it.
#[derive(Debug, Clone, PartialEq, Eq)]
struct LocalApiHttpResponse {
    status_code: u16,
    /// Each header's name and value, in the order the response gave them.
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl LocalApiHttpResponse {
    /// The pixel count the header `header_name` states; `None` when it is absent or malformed.
    fn pixel_count_header(&self, header_name: &str) -> Option<u32> {
        header_value_in(&self.headers, header_name)?.parse().ok()
    }
}

/// The value of the header `header_name` among `headers`, matched case-insensitively.
fn header_value_in<'headers>(
    headers: &'headers [(String, String)],
    header_name: &str,
) -> Option<&'headers str> {
    headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(header_name))
        .map(|(_, value)| value.as_str())
}

/// What the runtime answered a surface exchange with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SurfaceImageExchange {
    /// The frame's pixels.
    Exchanged(ExchangedSurfaceImage),
    /// The id named a frame whose pool slot was recycled since, refused in the runtime's words.
    FrameRecycled { refusal: String },
}

/// A frame's pixels as a PNG, and the extent of the surface they came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExchangedSurfaceImage {
    pub png_image_bytes: Vec<u8>,
    /// The surface's own width; `None` when the runtime did not state it.
    pub source_surface_pixel_width: Option<u32>,
    /// The surface's own height; `None` when the runtime did not state it.
    pub source_surface_pixel_height: Option<u32>,
}

/// A client of the local API served at one socket path.
#[derive(Debug, Clone)]
pub struct LocalApiClient {
    local_api_socket_path: PathBuf,
    request_timeout: Duration,
}

/// The `list_streams` tool's result.
#[derive(Deserialize)]
struct ListStreamsToolResultOnTheWire {
    streams: Vec<ListedStream>,
}

/// The machine-wide `GET /api/graph`, read only as far as the machine's name.
#[derive(Deserialize)]
struct MachineWideGraphOnTheWire {
    machine: String,
}

/// The body the runtime's REST routes refuse a request with.
#[derive(Deserialize)]
struct LocalApiErrorResponseOnTheWire {
    error: String,
}

/// Every stream a `list_streams` tool result lists.
pub fn listed_streams_from_the_list_streams_tool_result(
    tool_result_text: &str,
) -> Result<Vec<ListedStream>, String> {
    serde_json::from_str::<ListStreamsToolResultOnTheWire>(tool_result_text)
        .map(|tool_result| tool_result.streams)
        .map_err(|failure| {
            format!("the runtime's list_streams result could not be read: {failure}")
        })
}

impl LocalApiClient {
    /// A client of the local API at `local_api_socket_path`, bounding every read and write by
    /// `request_timeout`.
    pub fn new(local_api_socket_path: &Path, request_timeout: Duration) -> Self {
        Self {
            local_api_socket_path: local_api_socket_path.to_path_buf(),
            request_timeout,
        }
    }

    /// Whether the runtime answers `GET /health` with `ok`.
    pub fn check_health(&self) -> Result<(), LocalApiRequestFailure> {
        let response = self.exchange("GET", "/health", &[], None)?;
        let body = String::from_utf8_lossy(&response.body);
        if response.status_code == 200 && body.trim() == "ok" {
            Ok(())
        } else {
            Err(LocalApiRequestFailure::new(format!(
                "the runtime at {} answered /health with {}: {}",
                self.local_api_socket_path.display(),
                response.status_code,
                body.trim()
            )))
        }
    }

    /// Every stream the runtime holds, from its `list_streams` tool.
    pub fn list_streams(&self) -> Result<Vec<ListedStream>, LocalApiRequestFailure> {
        let tool_result_text = self.call_mcp_tool("list_streams", json!({}))?;
        listed_streams_from_the_list_streams_tool_result(&tool_result_text)
            .map_err(LocalApiRequestFailure::new)
    }

    /// This machine's name, as `GET /api/graph` states it beside every loaded stream's graph.
    pub fn machine_name(&self) -> Result<String, LocalApiRequestFailure> {
        let graph_body = self.get_body_of_an_ok_answer("/api/graph")?;
        serde_json::from_slice::<MachineWideGraphOnTheWire>(&graph_body)
            .map(|graph| graph.machine)
            .map_err(|failure| {
                LocalApiRequestFailure::new(format!(
                    "the runtime's /api/graph names no machine: {failure}"
                ))
            })
    }

    /// Up to `count` of `stream`'s log records numbered after `after`, from the runtime's `logs`
    /// tool.
    pub fn read_stream_log_records(
        &self,
        stream: &str,
        after: u64,
        count: u32,
    ) -> Result<StreamLogRecordsPage, LocalApiRequestFailure> {
        let tool_result_text = self.call_mcp_tool(
            "logs",
            json!({ "stream": stream, "after": after, "count": count }),
        )?;
        stream_log_records_page_from_the_logs_tool_result(&tool_result_text)
            .map_err(LocalApiRequestFailure::new)
    }

    /// Up to `count` bags the output port at `channel` carries — at least 1, at most
    /// [`LARGEST_TAP_SAMPLE_BAG_COUNT`] — from the runtime's `tap` tool.
    pub fn tap_output_port(
        &self,
        channel: &str,
        count: u32,
    ) -> Result<TapSample, LocalApiRequestFailure> {
        let tool_result_text = self.call_mcp_tool(
            "tap",
            json!({
                "channel": channel,
                "count": count.clamp(1, LARGEST_TAP_SAMPLE_BAG_COUNT),
                "max_bag_bytes": TAPPED_BAG_HEX_BYTE_LIMIT,
            }),
        )?;
        tap_sample_from_the_tap_tool_result(&tool_result_text).map_err(LocalApiRequestFailure::new)
    }

    /// The graph of the loaded stream `stream`, from `GET /api/graph?stream=`.
    pub fn describe_stream_graph(
        &self,
        stream: &str,
    ) -> Result<StreamGraphSummary, LocalApiRequestFailure> {
        let request_target = format!(
            "/api/graph?stream={}",
            utf8_percent_encode(stream, BYTES_OUTSIDE_THE_RFC_3986_UNRESERVED_SET)
        );
        let graph_body = self.get_body_of_an_ok_answer(&request_target)?;
        stream_graph_summary_from_the_graph_json(stream, &graph_body)
            .map_err(LocalApiRequestFailure::new)
    }

    /// The frame `surface_id` names as a PNG whose long edge is at most `long_edge_pixel_cap` —
    /// itself between [`SMALLEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP`] and
    /// [`LARGEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP`] — from `GET /api/surfaces/{surface_id}/image`;
    /// a recycled frame is its own answer, and any other refusal is in the runtime's own words.
    pub fn exchange_surface_for_png_image(
        &self,
        surface_id: &str,
        long_edge_pixel_cap: u32,
    ) -> Result<SurfaceImageExchange, LocalApiRequestFailure> {
        let request_target = surface_image_exchange_request_target(
            surface_id,
            long_edge_pixel_cap.clamp(
                SMALLEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP,
                LARGEST_SURFACE_IMAGE_LONG_EDGE_PIXEL_CAP,
            ),
        );
        let response = self.exchange("GET", &request_target, &[], None)?;
        match response.status_code {
            200 => Ok(SurfaceImageExchange::Exchanged(ExchangedSurfaceImage {
                source_surface_pixel_width: response
                    .pixel_count_header(SURFACE_PIXEL_WIDTH_HEADER_NAME),
                source_surface_pixel_height: response
                    .pixel_count_header(SURFACE_PIXEL_HEIGHT_HEADER_NAME),
                png_image_bytes: response.body,
            })),
            RECYCLED_FRAME_HTTP_STATUS_CODE => Ok(SurfaceImageExchange::FrameRecycled {
                refusal: refusal_of_a_rest_answer(&request_target, &response),
            }),
            _ => Err(LocalApiRequestFailure::new(refusal_of_a_rest_answer(
                &request_target,
                &response,
            ))),
        }
    }

    /// `GET request_target`, answering the body of a `200`; any other answer is refused in the
    /// runtime's own words when its body carries them.
    fn get_body_of_an_ok_answer(
        &self,
        request_target: &str,
    ) -> Result<Vec<u8>, LocalApiRequestFailure> {
        let response = self.exchange("GET", request_target, &[], None)?;
        if response.status_code == 200 {
            return Ok(response.body);
        }
        Err(LocalApiRequestFailure::new(refusal_of_a_rest_answer(
            request_target,
            &response,
        )))
    }

    /// Call the MCP tool `tool_name` with `tool_arguments` in one stateless request, answering
    /// the text of its first content block; a tool that ran and failed is refused in its own words.
    fn call_mcp_tool(
        &self,
        tool_name: &str,
        tool_arguments: Value,
    ) -> Result<String, LocalApiRequestFailure> {
        let request_body = mcp_tool_call_request_body(tool_name, tool_arguments);
        let response = self.exchange(
            "POST",
            "/mcp",
            &[
                ("Accept", "application/json, text/event-stream"),
                ("Content-Type", "application/json"),
                ("MCP-Protocol-Version", LOCAL_API_MCP_PROTOCOL_VERSION),
                ("Mcp-Method", "tools/call"),
                ("Mcp-Name", tool_name),
            ],
            Some(request_body.as_bytes()),
        )?;
        first_text_block_of_tool_call_response(tool_name, &response)
    }

    fn exchange(
        &self,
        method: &str,
        request_target: &str,
        extra_headers: &[(&str, &str)],
        request_body: Option<&[u8]>,
    ) -> Result<LocalApiHttpResponse, LocalApiRequestFailure> {
        let socket_text = self.local_api_socket_path.display();
        let mut stream = UnixStream::connect(&self.local_api_socket_path).map_err(|failure| {
            LocalApiRequestFailure::new(format!("no runtime answers at {socket_text}: {failure}"))
        })?;
        stream
            .set_read_timeout(Some(self.request_timeout))
            .and_then(|()| stream.set_write_timeout(Some(self.request_timeout)))
            .map_err(|failure| {
                LocalApiRequestFailure::new(format!(
                    "the socket {socket_text} refused a timeout: {failure}"
                ))
            })?;
        let request_bytes = http_request_bytes(method, request_target, extra_headers, request_body)
            .map_err(|failure| {
                LocalApiRequestFailure::new(format!(
                    "the request {method} {request_target} could not be written: {failure}"
                ))
            })?;
        stream.write_all(&request_bytes).map_err(|failure| {
            LocalApiRequestFailure::new(format!(
                "the request {method} {request_target} to {socket_text} could not be sent: {failure}"
            ))
        })?;

        let mut response_bytes = Vec::new();
        stream
            .take(LARGEST_LOCAL_API_RESPONSE_BYTES as u64 + 1)
            .read_to_end(&mut response_bytes)
            .map_err(|failure| {
                LocalApiRequestFailure::new(format!(
                    "{method} {request_target} to {socket_text} did not answer within {:?}: {failure}",
                    self.request_timeout
                ))
            })?;
        if response_bytes.len() > LARGEST_LOCAL_API_RESPONSE_BYTES {
            return Err(LocalApiRequestFailure::new(format!(
                "{method} {request_target} to {socket_text} answered more than \
                 {LARGEST_LOCAL_API_RESPONSE_BYTES} bytes"
            )));
        }
        parse_http_response(&response_bytes).map_err(|what_is_wrong| {
            LocalApiRequestFailure::new(format!(
                "{method} {request_target} to {socket_text} answered malformed HTTP: {what_is_wrong}"
            ))
        })
    }
}

/// `/api/surfaces/{surface_id}/image?downscale_long_edge_pixel_cap=<cap>`, the id percent-encoded
/// down to RFC 3986's unreserved set as StreamLib's `surface_image_exchange_route_path_for_surface_id`
/// encodes it: a pooled frame's id is `<slot>#<generation>`, and a bare `#` would end the path.
fn surface_image_exchange_request_target(surface_id: &str, long_edge_pixel_cap: u32) -> String {
    format!(
        "/api/surfaces/{}/image?downscale_long_edge_pixel_cap={long_edge_pixel_cap}",
        utf8_percent_encode(surface_id, BYTES_OUTSIDE_THE_RFC_3986_UNRESERVED_SET)
    )
}

/// Why the runtime refused `request_target`: the `error` its REST routes answer with, or else the
/// status and the body's text.
fn refusal_of_a_rest_answer(request_target: &str, response: &LocalApiHttpResponse) -> String {
    match serde_json::from_slice::<LocalApiErrorResponseOnTheWire>(&response.body) {
        Ok(error_response) => error_response.error,
        Err(_) => format!(
            "the runtime answered {request_target} with {}: {}",
            response.status_code,
            String::from_utf8_lossy(&response.body).trim()
        ),
    }
}

/// One HTTP/1.1 request on a connection the server closes after answering; it carries a
/// `Content-Length` exactly when it carries a body.
fn http_request_bytes(
    method: &str,
    request_target: &str,
    extra_headers: &[(&str, &str)],
    request_body: Option<&[u8]>,
) -> Result<Vec<u8>, std::fmt::Error> {
    let mut request_head = String::new();
    write!(
        request_head,
        "{method} {request_target} HTTP/1.1\r\nHost: localhost\r\n"
    )?;
    for (header_name, header_value) in extra_headers {
        write!(request_head, "{header_name}: {header_value}\r\n")?;
    }
    if let Some(request_body) = request_body {
        write!(request_head, "Content-Length: {}\r\n", request_body.len())?;
    }
    request_head.push_str("Connection: close\r\n\r\n");
    let mut request_bytes = request_head.into_bytes();
    request_bytes.extend_from_slice(request_body.unwrap_or_default());
    Ok(request_bytes)
}

/// The JSON-RPC `tools/call` request for `tool_name`, carrying the per-request `_meta` the
/// runtime's stateless MCP transport requires.
fn mcp_tool_call_request_body(tool_name: &str, tool_arguments: Value) -> String {
    json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": tool_arguments,
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": LOCAL_API_MCP_PROTOCOL_VERSION,
                "io.modelcontextprotocol/clientInfo": {
                    "name": LOCAL_API_MCP_CLIENT_NAME,
                    "version": env!("CARGO_PKG_VERSION"),
                },
                "io.modelcontextprotocol/clientCapabilities": {},
            },
        },
    })
    .to_string()
}

fn first_text_block_of_tool_call_response(
    tool_name: &str,
    response: &LocalApiHttpResponse,
) -> Result<String, LocalApiRequestFailure> {
    let json_rpc_response: Value = serde_json::from_slice(&response.body).map_err(|failure| {
        LocalApiRequestFailure::new(format!(
            "`{tool_name}` answered {} with a body that is not JSON-RPC: {failure}",
            response.status_code
        ))
    })?;
    if let Some(json_rpc_error) = json_rpc_response.get("error") {
        let message = json_rpc_error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("no message");
        return Err(LocalApiRequestFailure::new(format!(
            "the runtime refused `{tool_name}` ({}): {message}",
            response.status_code
        )));
    }
    let tool_result = json_rpc_response.get("result").ok_or_else(|| {
        LocalApiRequestFailure::new(format!(
            "`{tool_name}` answered with neither a result nor an error"
        ))
    })?;
    let first_text = tool_result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|content| {
            content.iter().find_map(|block| {
                (block.get("type").and_then(Value::as_str) == Some("text"))
                    .then(|| block.get("text").and_then(Value::as_str))
                    .flatten()
            })
        });
    let tool_failed = tool_result.get("isError").and_then(Value::as_bool) == Some(true);
    match (tool_failed, first_text) {
        (true, Some(refusal)) => Err(LocalApiRequestFailure::new(refusal)),
        (true, None) => Err(LocalApiRequestFailure::new(format!(
            "`{tool_name}` failed and gave no reason"
        ))),
        (false, Some(text)) => Ok(text.to_string()),
        (false, None) => Err(LocalApiRequestFailure::new(format!(
            "`{tool_name}` answered with no text"
        ))),
    }
}

/// A complete HTTP/1.1 response read to end of stream: its status, its headers and its body,
/// de-chunked when it was sent chunked.
fn parse_http_response(response_bytes: &[u8]) -> Result<LocalApiHttpResponse, String> {
    let head_end = response_bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or("the response head never ended")?;
    let head = std::str::from_utf8(&response_bytes[..head_end])
        .map_err(|_| "the response head is not UTF-8")?;
    let body = &response_bytes[head_end + 4..];
    let mut head_lines = head.split("\r\n");
    let status_line = head_lines.next().ok_or("the response has no status line")?;
    let status_code = status_line
        .split(' ')
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| format!("the status line {status_line:?} names no status"))?;
    let headers: Vec<(String, String)> = head_lines
        .filter_map(|header_line| header_line.split_once(':'))
        .map(|(header_name, header_value)| {
            (
                header_name.trim().to_string(),
                header_value.trim().to_string(),
            )
        })
        .collect();
    let content_length =
        header_value_in(&headers, "content-length").and_then(|value| value.parse::<usize>().ok());
    let chunked = header_value_in(&headers, "transfer-encoding")
        .is_some_and(|value| value.to_ascii_lowercase().contains("chunked"));
    let body = if chunked {
        dechunked_body(body)?
    } else if let Some(content_length) = content_length {
        body.get(..content_length)
            .ok_or_else(|| {
                format!(
                    "the body ended after {} of its {content_length} bytes",
                    body.len()
                )
            })?
            .to_vec()
    } else {
        body.to_vec()
    };
    Ok(LocalApiHttpResponse {
        status_code,
        headers,
        body,
    })
}

fn dechunked_body(mut chunked_body: &[u8]) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    loop {
        let size_line_end = chunked_body
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or("a chunk size line never ended")?;
        let size_line = std::str::from_utf8(&chunked_body[..size_line_end])
            .map_err(|_| "a chunk size line is not UTF-8")?;
        let size_text = size_line.split(';').next().unwrap_or_default().trim();
        let chunk_size = usize::from_str_radix(size_text, 16)
            .map_err(|_| format!("the chunk size {size_text:?} is not hexadecimal"))?;
        chunked_body = &chunked_body[size_line_end + 2..];
        if chunk_size == 0 {
            return Ok(body);
        }
        let chunk = chunked_body
            .get(..chunk_size)
            .ok_or("the body ended inside a chunk")?;
        body.extend_from_slice(chunk);
        chunked_body = chunked_body
            .get(chunk_size + 2..)
            .ok_or("the body ended after a chunk")?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake_local_api_server::{
        http_response, http_response_with_headers, tool_result_response, FakeLocalApiServer,
    };
    use std::os::unix::net::UnixListener;

    #[test]
    fn a_runtime_answering_ok_is_healthy() {
        let server = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "text/plain; charset=utf-8",
            "ok",
        )]);

        server.client().check_health().unwrap();

        let request = &server.received_requests()[0];
        assert!(
            request.starts_with("GET /health HTTP/1.1\r\nHost: localhost\r\n"),
            "{request}"
        );
        assert!(request.contains("Connection: close\r\n"), "{request}");
        assert!(!request.contains("Content-Length"), "{request}");
    }

    #[test]
    fn nothing_listening_names_the_socket() {
        let socket_directory = tempfile::tempdir().unwrap();
        let socket_path = socket_directory.path().join("local-api.sock");

        let failure = LocalApiClient::new(&socket_path, Duration::from_secs(1))
            .check_health()
            .unwrap_err();

        assert!(
            failure
                .failure_description
                .contains(&socket_path.display().to_string()),
            "{failure}"
        );
    }

    #[test]
    fn a_runtime_that_never_answers_times_out() {
        let socket_directory = tempfile::Builder::new()
            .prefix("tl-app-")
            .tempdir_in("/tmp")
            .unwrap();
        let socket_path = socket_directory.path().join("local-api.sock");
        let _listener_that_never_answers = UnixListener::bind(&socket_path).unwrap();

        let failure = LocalApiClient::new(&socket_path, Duration::from_millis(200))
            .check_health()
            .unwrap_err();

        assert!(
            failure
                .failure_description
                .contains("did not answer within"),
            "{failure}"
        );
    }

    #[test]
    fn listing_streams_sends_the_headers_and_meta_the_runtime_requires() {
        let server =
            FakeLocalApiServer::answering(vec![tool_result_response(json!({ "streams": [] }))]);

        assert_eq!(server.client().list_streams().unwrap(), Vec::new());

        let request = &server.received_requests()[0];
        let (head, body) = request.split_once("\r\n\r\n").unwrap();
        assert!(head.starts_with("POST /mcp HTTP/1.1\r\n"), "{head}");
        for required_header in [
            "Accept: application/json, text/event-stream",
            "Content-Type: application/json",
            "MCP-Protocol-Version: 2026-07-28",
            "Mcp-Method: tools/call",
            "Mcp-Name: list_streams",
        ] {
            assert!(
                head.contains(required_header),
                "{required_header} missing from {head}"
            );
        }
        assert!(
            head.contains(&format!("Content-Length: {}\r\n", body.len())),
            "{head}"
        );
        let body: Value = serde_json::from_str(body).unwrap();
        assert_eq!(body["method"], "tools/call");
        assert_eq!(body["params"]["name"], "list_streams");
        assert_eq!(body["params"]["arguments"], json!({}));
        let meta = &body["params"]["_meta"];
        assert_eq!(
            meta["io.modelcontextprotocol/protocolVersion"],
            "2026-07-28"
        );
        assert_eq!(
            meta["io.modelcontextprotocol/clientInfo"]["name"],
            "tatolab-app"
        );
        assert!(meta["io.modelcontextprotocol/clientInfo"]["version"].is_string());
        assert_eq!(
            meta["io.modelcontextprotocol/clientCapabilities"],
            json!({})
        );
    }

    fn listed_stream(
        name: &str,
        state: &str,
        project_directory: &str,
        node_count: Option<u64>,
        failed_because: Option<&str>,
    ) -> ListedStream {
        ListedStream {
            name: name.to_string(),
            state: state.to_string(),
            project_directory: project_directory.to_string(),
            node_count,
            failed_because: failed_because.map(str::to_string),
        }
    }

    /// The text block a real runtime answered `list_streams` with, holding one kept stream.
    const A_REAL_LIST_STREAMS_TOOL_RESULT: &str = "{\n  \"streams\": [\n    {\n      \"name\": \"main\",\n      \"state\": \"kept\",\n      \"project_directory\": \"/private/tmp/tatolab-proof-projects/pattern\",\n      \"node_count\": 4,\n      \"failed_because\": null\n    }\n  ]\n}";

    #[test]
    fn a_real_list_streams_result_lists_its_streams() {
        assert_eq!(
            listed_streams_from_the_list_streams_tool_result(A_REAL_LIST_STREAMS_TOOL_RESULT)
                .unwrap(),
            vec![listed_stream(
                "main",
                "kept",
                "/private/tmp/tatolab-proof-projects/pattern",
                Some(4),
                None
            )]
        );
    }

    #[test]
    fn a_stream_in_a_state_or_with_fields_this_app_does_not_know_is_still_listed() {
        let tool_result = json!({
            "streams": [
                { "name": "from-a-newer-runtime", "state": "migrating", "project_directory": "/Users/me/newer", "node_count": 1, "failed_because": null, "a_field_from_later": true },
                { "name": "without-a-project", "state": "attached" }
            ],
            "a_top_level_field_from_later": [1, 2]
        });

        assert_eq!(
            listed_streams_from_the_list_streams_tool_result(&tool_result.to_string()).unwrap(),
            vec![
                listed_stream(
                    "from-a-newer-runtime",
                    "migrating",
                    "/Users/me/newer",
                    Some(1),
                    None
                ),
                listed_stream("without-a-project", "attached", "", None, None),
            ]
        );
    }

    #[test]
    fn a_list_streams_result_naming_no_stream_name_is_refused() {
        let failure = listed_streams_from_the_list_streams_tool_result(
            &json!({ "streams": [{ "state": "kept" }] }).to_string(),
        )
        .unwrap_err();

        assert!(failure.contains("list_streams"), "{failure}");
    }

    #[test]
    fn listing_streams_lists_every_stream_whatever_its_state() {
        let server = FakeLocalApiServer::answering(vec![tool_result_response(json!({
            "streams": [
                { "name": "camera-preview", "state": "attached", "project_directory": "/Users/me/camera", "node_count": 3, "failed_because": null },
                { "name": "encoder", "state": "kept", "project_directory": "/Users/me/encoder", "node_count": null, "failed_because": null },
                { "name": "paused", "state": "stopped", "project_directory": "/Users/me/paused", "node_count": null, "failed_because": null },
                { "name": "crashy", "state": "failed", "project_directory": "/Users/me/crashy", "node_count": null, "failed_because": "implicated in the runtime's last two crashes in a row" }
            ]
        }))]);

        assert_eq!(
            server.client().list_streams().unwrap(),
            vec![
                listed_stream(
                    "camera-preview",
                    "attached",
                    "/Users/me/camera",
                    Some(3),
                    None
                ),
                listed_stream("encoder", "kept", "/Users/me/encoder", None, None),
                listed_stream("paused", "stopped", "/Users/me/paused", None, None),
                listed_stream(
                    "crashy",
                    "failed",
                    "/Users/me/crashy",
                    None,
                    Some("implicated in the runtime's last two crashes in a row")
                ),
            ]
        );
    }

    #[test]
    fn the_machine_name_comes_from_the_machine_wide_graph() {
        let graph = json!({ "machine": "jonathanf-macbook", "streams": [{ "stream": "main", "nodes": [], "links": [], "exposed": [], "machine": "jonathanf-macbook" }] });
        let server = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "application/json",
            &graph.to_string(),
        )]);

        assert_eq!(server.client().machine_name().unwrap(), "jonathanf-macbook");
        assert!(server.received_requests()[0].starts_with("GET /api/graph HTTP/1.1\r\n"));
    }

    #[test]
    fn a_refused_rest_request_carries_the_runtimes_own_words() {
        let server = FakeLocalApiServer::answering(vec![http_response(
            "500 Internal Server Error",
            "application/json",
            r#"{"error":"graph export failed: the engine is shutting down"}"#,
        )]);

        let failure = server.client().machine_name().unwrap_err();

        assert_eq!(
            failure.failure_description,
            "graph export failed: the engine is shutting down"
        );
    }

    #[test]
    fn a_json_rpc_refusal_is_reported_with_its_message() {
        let refusal = json!({
            "jsonrpc": "2.0", "id": 1,
            "error": { "code": -32020, "message": "Missing MCP-Protocol-Version header" }
        });
        let server = FakeLocalApiServer::answering(vec![http_response(
            "400 Bad Request",
            "application/json",
            &refusal.to_string(),
        )]);

        let failure = server.client().list_streams().unwrap_err();

        assert!(failure.failure_description.contains("400"), "{failure}");
        assert!(
            failure
                .failure_description
                .contains("Missing MCP-Protocol-Version header"),
            "{failure}"
        );
    }

    #[test]
    fn a_tool_that_ran_and_failed_is_reported_with_its_text() {
        let body = json!({
            "jsonrpc": "2.0", "id": 1,
            "result": { "content": [{ "type": "text", "text": "the stream action did not finish" }], "isError": true }
        });
        let server = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "application/json",
            &body.to_string(),
        )]);

        let failure = server.client().list_streams().unwrap_err();

        assert_eq!(
            failure.failure_description,
            "the stream action did not finish"
        );
    }

    #[test]
    fn reading_log_records_asks_the_logs_tool_for_the_page_after_a_sequence_number() {
        let server = FakeLocalApiServer::answering(vec![tool_result_response(json!({
            "stream": "main",
            "stream_instance": "4",
            "records": [{ "sequence": 8, "record": { "level": "info", "message": "hello" } }],
            "next_after": 8,
            "records_no_longer_held": 0
        }))]);

        let page = server
            .client()
            .read_stream_log_records("main", 7, 500)
            .unwrap();

        assert_eq!(page.stream_instance, "4");
        assert_eq!(page.next_after, 8);
        assert_eq!(page.records[0].message, "hello");
        let request = &server.received_requests()[0];
        let (head, body) = request.split_once("\r\n\r\n").unwrap();
        assert!(head.contains("Mcp-Name: logs"), "{head}");
        let body: Value = serde_json::from_str(body).unwrap();
        assert_eq!(body["params"]["name"], "logs");
        assert_eq!(
            body["params"]["arguments"],
            json!({ "stream": "main", "after": 7, "count": 500 })
        );
    }

    #[test]
    fn a_log_read_the_runtime_refuses_carries_its_own_words() {
        let refusal = "logs failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
        let body = json!({
            "jsonrpc": "2.0", "id": 1,
            "result": { "resultType": "complete", "content": [{ "type": "text", "text": refusal }], "isError": true }
        });
        let server = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "application/json",
            &body.to_string(),
        )]);

        let failure = server
            .client()
            .read_stream_log_records("nope", 0, 500)
            .unwrap_err();

        assert_eq!(failure.failure_description, refusal);
    }

    #[test]
    fn tapping_an_output_port_asks_the_tap_tool_for_its_channel_count_and_bag_cap() {
        let tap_tool_result: Value = serde_json::from_str(include_str!(
            "../test-fixtures/local-api-tap-tool-result-of-main-invertingeffect-video_to_downstream-3-bags.json"
        ))
        .unwrap();
        let server = FakeLocalApiServer::answering(vec![tool_result_response(tap_tool_result)]);

        let tap_sample = server
            .client()
            .tap_output_port("main/invertingeffect/video_to_downstream", 3)
            .unwrap();

        assert_eq!(tap_sample.received, 3);
        assert_eq!(
            tap_sample.bags[1].surface_id.as_deref(),
            Some("e17a285e-5861-495a-91fe-30dd9d97c5e5#72517")
        );
        let request = &server.received_requests()[0];
        let (head, body) = request.split_once("\r\n\r\n").unwrap();
        assert!(head.contains("Mcp-Name: tap"), "{head}");
        let body: Value = serde_json::from_str(body).unwrap();
        assert_eq!(body["params"]["name"], "tap");
        assert_eq!(
            body["params"]["arguments"],
            json!({ "channel": "main/invertingeffect/video_to_downstream", "count": 3, "max_bag_bytes": 65536 })
        );
    }

    #[test]
    fn a_tap_asks_for_at_least_one_bag_and_at_most_the_largest_sample() {
        let empty_tap_tool_result = json!({
            "channel": "main/quiet/out", "requested": 1, "received": 0, "window_ms": 500,
            "dropped_bags": 0, "max_bag_bytes": 65536, "bags_withheld_at_byte_budget": 0, "bags": []
        });
        let server = FakeLocalApiServer::answering(vec![
            tool_result_response(empty_tap_tool_result.clone()),
            tool_result_response(empty_tap_tool_result),
        ]);

        for count in [0, 1000] {
            server
                .client()
                .tap_output_port("main/quiet/out", count)
                .unwrap();
        }

        let asked_counts: Vec<Value> = server
            .received_requests()
            .iter()
            .map(|request| {
                let (_, body) = request.split_once("\r\n\r\n").unwrap();
                serde_json::from_str::<Value>(body).unwrap()["params"]["arguments"]["count"].clone()
            })
            .collect();
        assert_eq!(
            asked_counts,
            vec![json!(1), json!(LARGEST_TAP_SAMPLE_BAG_COUNT)]
        );
    }

    #[test]
    fn a_tap_the_runtime_refuses_carries_its_own_words() {
        let refusal = "tap attach failed: Resource not found: no output port `nope` on node `invertingeffect`";
        let body = json!({
            "jsonrpc": "2.0", "id": 1,
            "result": { "content": [{ "type": "text", "text": refusal }], "isError": true }
        });
        let server = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "application/json",
            &body.to_string(),
        )]);

        let failure = server
            .client()
            .tap_output_port("main/invertingeffect/nope", 1)
            .unwrap_err();

        assert_eq!(failure.failure_description, refusal);
    }

    #[test]
    fn exchanging_a_surface_percent_encodes_its_id_and_reads_the_extent_the_runtime_states() {
        let server = FakeLocalApiServer::answering(vec![
            http_response_with_headers(
                "200 OK",
                &[
                    ("content-type", "image/png"),
                    ("X-Streamlib-Surface-Pixel-Width", " 1280 "),
                    ("x-streamlib-surface-pixel-height", "seven hundred"),
                ],
                b"png bytes",
            ),
            http_response(
                "410 Gone",
                "application/json",
                r#"{"error":"surface 's#1' names a recycled frame"}"#,
            ),
            http_response(
                "501 Not Implemented",
                "application/json",
                r#"{"error":"surface 's#2' has no conversion arm"}"#,
            ),
        ]);
        let client = server.client();

        assert_eq!(
            client.exchange_surface_for_png_image("two words/é#7", 640),
            Ok(SurfaceImageExchange::Exchanged(ExchangedSurfaceImage {
                png_image_bytes: b"png bytes".to_vec(),
                source_surface_pixel_width: Some(1280),
                source_surface_pixel_height: None,
            }))
        );
        assert_eq!(
            client.exchange_surface_for_png_image("s#1", 640),
            Ok(SurfaceImageExchange::FrameRecycled {
                refusal: "surface 's#1' names a recycled frame".to_string()
            })
        );
        assert_eq!(
            client
                .exchange_surface_for_png_image("s#2", 640)
                .unwrap_err()
                .failure_description,
            "surface 's#2' has no conversion arm"
        );
        assert!(
            server.received_requests()[0].starts_with(
                "GET /api/surfaces/two%20words%2F%C3%A9%237/image?downscale_long_edge_pixel_cap=640 HTTP/1.1\r\n"
            ),
            "{}",
            server.received_requests()[0]
        );
    }

    #[test]
    fn describing_a_stream_graph_names_the_stream_percent_encoded() {
        let graph = json!({
            "stream": "two words&more",
            "nodes": [{ "id": "P1", "type": "tatolab.stream:TestPatternSource", "name": "testpatternsource", "components": { "state": "Running" } }],
            "links": [],
            "exposed": [],
            "machine": "jonathanf-macbook"
        });
        let server = FakeLocalApiServer::answering(vec![http_response(
            "200 OK",
            "application/json",
            &graph.to_string(),
        )]);

        let summary = server
            .client()
            .describe_stream_graph("two words&more")
            .unwrap();

        assert_eq!(summary.stream, "two words&more");
        assert_eq!(summary.nodes[0].state.as_deref(), Some("Running"));
        assert!(
            server.received_requests()[0]
                .starts_with("GET /api/graph?stream=two%20words%26more HTTP/1.1\r\n"),
            "{}",
            server.received_requests()[0]
        );
    }

    #[test]
    fn a_graph_of_a_stream_that_is_not_loaded_is_refused_in_the_runtimes_words() {
        let server = FakeLocalApiServer::answering(vec![http_response(
            "404 Not Found",
            "application/json",
            r#"{"error":"Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main"}"#,
        )]);

        let failure = server.client().describe_stream_graph("nope").unwrap_err();

        assert_eq!(
            failure.failure_description,
            "Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main"
        );
    }

    #[test]
    fn a_chunked_response_is_dechunked() {
        let server = FakeLocalApiServer::answering(vec![
            b"HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n1\r\no\r\n1;ext=1\r\nk\r\n0\r\n\r\n".to_vec(),
        ]);

        server.client().check_health().unwrap();
    }

    /// Against a real runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> cargo test -- --ignored`.
    #[test]
    #[ignore = "needs a running tatolabd; name its socket in TATOLAB_APP_LIVE_LOCAL_API_SOCKET"]
    fn a_real_runtime_answers_health_its_streams_their_graphs_and_logs_and_its_machine_name() {
        let socket_path = std::env::var_os("TATOLAB_APP_LIVE_LOCAL_API_SOCKET")
            .expect("TATOLAB_APP_LIVE_LOCAL_API_SOCKET names a running runtime's local API socket");
        let client = LocalApiClient::new(Path::new(&socket_path), Duration::from_secs(5));

        client.check_health().unwrap();
        let streams = client.list_streams().unwrap();
        assert!(!client.machine_name().unwrap().is_empty());
        for listed_stream in streams
            .iter()
            .filter(|listed_stream| listed_stream.node_count.is_some())
        {
            let graph = client.describe_stream_graph(&listed_stream.name).unwrap();
            assert_eq!(graph.stream, listed_stream.name);
            let page = client
                .read_stream_log_records(&listed_stream.name, 0, 500)
                .unwrap();
            assert_eq!(page.stream, listed_stream.name);
        }

        if let Some(expected_stream_count) =
            std::env::var_os("TATOLAB_APP_LIVE_EXPECTED_STREAM_COUNT")
        {
            assert_eq!(
                streams.len(),
                expected_stream_count
                    .to_string_lossy()
                    .parse::<usize>()
                    .unwrap()
            );
        }
    }

    #[test]
    fn a_request_carries_a_content_length_exactly_when_it_carries_a_body() {
        let without_body = http_request_bytes("POST", "/mcp", &[], None).unwrap();
        assert_eq!(
            String::from_utf8(without_body).unwrap(),
            "POST /mcp HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        );

        let with_empty_body = http_request_bytes("GET", "/health", &[], Some(b"")).unwrap();
        assert_eq!(
            String::from_utf8(with_empty_body).unwrap(),
            "GET /health HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
    }

    #[test]
    fn a_truncated_body_is_malformed() {
        assert!(
            parse_http_response(b"HTTP/1.1 200 OK\r\ncontent-length: 10\r\n\r\nok")
                .unwrap_err()
                .contains("2 of its 10 bytes")
        );
        assert!(parse_http_response(b"HTTP/1.1 200 OK\r\n").is_err());
    }
}
