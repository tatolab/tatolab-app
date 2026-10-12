// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! Tests' stand-in for the runtime's local API: a Unix socket answering each connection with the
//! next scripted raw HTTP response, and the responses the runtime writes.

use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};

use crate::local_api_client::LocalApiClient;

/// A local API that answers each connection with the next scripted raw response, recording every
/// request it read.
pub struct FakeLocalApiServer {
    local_api_socket_path: PathBuf,
    received_requests: Arc<Mutex<Vec<String>>>,
    _socket_directory: tempfile::TempDir,
}

impl FakeLocalApiServer {
    /// A server answering its connections with `scripted_responses`, in order.
    pub fn answering(scripted_responses: Vec<Vec<u8>>) -> Self {
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

    /// A client of this server.
    pub fn client(&self) -> LocalApiClient {
        LocalApiClient::new(&self.local_api_socket_path, Duration::from_secs(2))
    }

    /// Every request the server read, in order.
    pub fn received_requests(&self) -> Vec<String> {
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

/// An HTTP/1.1 response with `headers` and a `content-length` for `body`.
pub fn http_response_with_headers(
    status_line: &str,
    headers: &[(&str, &str)],
    body: &[u8],
) -> Vec<u8> {
    let mut response = format!("HTTP/1.1 {status_line}\r\n");
    for (header_name, header_value) in headers {
        response.push_str(&format!("{header_name}: {header_value}\r\n"));
    }
    response.push_str(&format!("content-length: {}\r\n\r\n", body.len()));
    let mut response = response.into_bytes();
    response.extend_from_slice(body);
    response
}

/// An HTTP/1.1 response carrying `body` as `content_type`.
pub fn http_response(status_line: &str, content_type: &str, body: &str) -> Vec<u8> {
    http_response_with_headers(
        status_line,
        &[("content-type", content_type)],
        body.as_bytes(),
    )
}

/// The JSON-RPC response the runtime's rmcp server writes for a tool result: the tool's JSON as
/// one pretty-printed text block.
pub fn tool_result_response(tool_result: Value) -> Vec<u8> {
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
