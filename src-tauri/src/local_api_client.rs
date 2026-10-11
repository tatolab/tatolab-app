// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's client of the runtime's local API: one short HTTP/1.1 request per call over the
//! local API's Unix socket. `GET /health` says the runtime is up, and the MCP tool `list_streams`
//! over `POST /mcp` lists its streams.
//!
//! The MCP request is spelled as StreamLib's runtime requires one (`streamlib-api-server`'s
//! `mcp.rs` serves rmcp's stateless Streamable HTTP with per-request protocol metadata
//! required): the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, an `Accept` of
//! both JSON and SSE, and `_meta` carrying the protocol version, client info and capabilities.

use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::tatolab_status::ListedStream;

/// The MCP protocol revision the runtime serves, and the only one.
pub const LOCAL_API_MCP_PROTOCOL_VERSION: &str = "2026-07-28";

/// The client name the app gives the runtime in every MCP request's `_meta`.
const LOCAL_API_MCP_CLIENT_NAME: &str = "tatolab-app";

/// The most bytes one local API response may carry before the client gives up on it.
const LARGEST_LOCAL_API_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

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
    body: Vec<u8>,
}

/// A client of the local API served at one socket path.
#[derive(Debug, Clone)]
pub struct LocalApiClient {
    local_api_socket_path: PathBuf,
    request_timeout: Duration,
}

#[derive(Deserialize)]
struct ListStreamsToolResultOnTheWire {
    streams: Vec<ListedStream>,
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
        serde_json::from_str::<ListStreamsToolResultOnTheWire>(&tool_result_text)
            .map(|tool_result| tool_result.streams)
            .map_err(|failure| {
                LocalApiRequestFailure::new(format!(
                    "the runtime's list_streams result could not be read: {failure}"
                ))
            })
    }

    /// Call the MCP tool `tool_name` with `tool_arguments` in one stateless request, answering
    /// the text of its first content block.
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
        let mut request = format!("{method} {request_target} HTTP/1.1\r\nHost: localhost\r\n");
        for (header_name, header_value) in extra_headers {
            request.push_str(&format!("{header_name}: {header_value}\r\n"));
        }
        let request_body = request_body.unwrap_or_default();
        if method == "POST" {
            request.push_str(&format!("Content-Length: {}\r\n", request_body.len()));
        }
        request.push_str("Connection: close\r\n\r\n");
        let mut request_bytes = request.into_bytes();
        request_bytes.extend_from_slice(request_body);
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
        (true, failure_text) => Err(LocalApiRequestFailure::new(format!(
            "`{tool_name}` failed: {}",
            failure_text.unwrap_or("no reason given")
        ))),
        (false, Some(text)) => Ok(text.to_string()),
        (false, None) => Err(LocalApiRequestFailure::new(format!(
            "`{tool_name}` answered with no text"
        ))),
    }
}

/// A complete HTTP/1.1 response read to end of stream: its status and its body, de-chunked when
/// it was sent chunked.
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
    let mut content_length = None;
    let mut chunked = false;
    for header_line in head_lines {
        let Some((header_name, header_value)) = header_line.split_once(':') else {
            continue;
        };
        let header_value = header_value.trim();
        if header_name.eq_ignore_ascii_case("content-length") {
            content_length = header_value.parse::<usize>().ok();
        } else if header_name.eq_ignore_ascii_case("transfer-encoding")
            && header_value.to_ascii_lowercase().contains("chunked")
        {
            chunked = true;
        }
    }
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
    Ok(LocalApiHttpResponse { status_code, body })
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
    use crate::tatolab_status::ListedStreamState;
    use std::os::unix::net::UnixListener;
    use std::sync::{Arc, Mutex};

    /// A local API stood in by a Unix socket that answers each connection with the next scripted
    /// raw response, recording every request it read.
    struct FakeLocalApiServer {
        local_api_socket_path: PathBuf,
        received_requests: Arc<Mutex<Vec<String>>>,
        _socket_directory: tempfile::TempDir,
    }

    impl FakeLocalApiServer {
        fn answering(scripted_responses: Vec<Vec<u8>>) -> Self {
            let socket_directory = tempfile::Builder::new()
                .prefix("tl-app-")
                .tempdir_in("/tmp")
                .unwrap();
            let local_api_socket_path = socket_directory.path().join("local-api.sock");
            let listener = UnixListener::bind(&local_api_socket_path).unwrap();
            let received_requests = Arc::new(Mutex::new(Vec::new()));
            let received_requests_for_the_server = Arc::clone(&received_requests);
            std::thread::spawn(move || {
                for scripted_response in scripted_responses {
                    let Ok((mut connection, _)) = listener.accept() else {
                        return;
                    };
                    let request = read_one_request(&mut connection);
                    received_requests_for_the_server
                        .lock()
                        .unwrap()
                        .push(request);
                    let _ = connection.write_all(&scripted_response);
                }
            });
            Self {
                local_api_socket_path,
                received_requests,
                _socket_directory: socket_directory,
            }
        }

        fn client(&self) -> LocalApiClient {
            LocalApiClient::new(&self.local_api_socket_path, Duration::from_secs(2))
        }

        fn received_requests(&self) -> Vec<String> {
            self.received_requests.lock().unwrap().clone()
        }
    }

    fn read_one_request(connection: &mut UnixStream) -> String {
        let mut request = Vec::new();
        let mut buffer = [0u8; 4096];
        loop {
            let read = connection.read(&mut buffer).unwrap();
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            let text = String::from_utf8_lossy(&request).to_string();
            if let Some(head_end) = text.find("\r\n\r\n") {
                let content_length = text[..head_end]
                    .lines()
                    .find_map(|line| line.strip_prefix("Content-Length: "))
                    .map(|length| length.trim().parse::<usize>().unwrap())
                    .unwrap_or(0);
                if request.len() >= head_end + 4 + content_length {
                    break;
                }
            }
        }
        String::from_utf8(request).unwrap()
    }

    fn http_response(status_line: &str, content_type: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status_line}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    /// The JSON-RPC response the runtime's rmcp server writes for a tool result: the tool's JSON
    /// as one pretty-printed text block.
    fn tool_result_response(tool_result: Value) -> Vec<u8> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&tool_result).unwrap() }],
                "isError": false
            }
        });
        http_response("200 OK", "application/json", &body.to_string())
    }

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
    fn list_streams_sends_the_headers_and_meta_the_runtime_requires() {
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

    #[test]
    fn list_streams_reads_every_state_the_runtime_lists() {
        let server = FakeLocalApiServer::answering(vec![tool_result_response(json!({
            "streams": [
                { "name": "camera-preview", "state": "attached", "project_directory": "/Users/me/camera", "node_count": 3, "failed_because": null },
                { "name": "encoder", "state": "kept", "project_directory": "/Users/me/encoder", "node_count": null, "failed_because": null },
                { "name": "paused", "state": "stopped", "project_directory": "/Users/me/paused", "node_count": null, "failed_because": null },
                { "name": "crashy", "state": "failed", "project_directory": "/Users/me/crashy", "node_count": null, "failed_because": "implicated in the runtime's last two crashes in a row" }
            ]
        }))]);

        let streams = server.client().list_streams().unwrap();

        assert_eq!(
            streams
                .iter()
                .map(|stream| stream.state)
                .collect::<Vec<_>>(),
            vec![
                ListedStreamState::Attached,
                ListedStreamState::Kept,
                ListedStreamState::Stopped,
                ListedStreamState::Failed
            ]
        );
        assert_eq!(streams[0].node_count, Some(3));
        assert_eq!(streams[0].project_directory, "/Users/me/camera");
        assert_eq!(
            streams[3].failed_because.as_deref(),
            Some("implicated in the runtime's last two crashes in a row")
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

        assert!(
            failure
                .failure_description
                .contains("the stream action did not finish"),
            "{failure}"
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
    fn a_real_runtime_answers_health_and_list_streams() {
        let socket_path = std::env::var_os("TATOLAB_APP_LIVE_LOCAL_API_SOCKET")
            .expect("TATOLAB_APP_LIVE_LOCAL_API_SOCKET names a running runtime's local API socket");
        let client = LocalApiClient::new(Path::new(&socket_path), Duration::from_secs(5));

        client.check_health().unwrap();
        let streams = client.list_streams().unwrap();

        if let Some(expected_listing) = std::env::var_os("TATOLAB_APP_LIVE_EXPECTED_STREAMS_JSON") {
            let expected_streams: Vec<ListedStream> =
                serde_json::from_str(&expected_listing.to_string_lossy()).unwrap();
            assert_eq!(streams, expected_streams);
        }
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
