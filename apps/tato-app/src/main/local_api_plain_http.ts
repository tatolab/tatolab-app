// The local API's plain HTTP requests, the ones that are not a control operation: `GET /health`,
// `GET /api/graph` and `GET /api/registry`. Each is one short HTTP/1.1 request over the local API's
// Unix socket, read to the end of the stream the runtime closes, and fails as a call to the
// runtime's control API fails.

import { isUtf8 } from "node:buffer";
import net from "node:net";
import { Effect } from "effect";
import { isAJsonObject, parseJsonOnTheWire, requiredText } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { durationAsTheTimeoutFailureSpellsIt, type LocalApiHttpResponse } from "./tatolab_runtime_control_operation_call.js";
import { ContractMismatch, RuntimeRefused, RuntimeTimedOut, RuntimeUnreachable, type RuntimeControlFailure } from "./runtime_control_failures.js";

/** The most bytes one plain HTTP answer of the local API may carry before the request gives up on it. */
const LARGEST_LOCAL_API_RESPONSE_BYTES = 8 * 1024 * 1024;

/** One HTTP response as it was read off the socket. */
interface HttpResponseRead {
  statusCode: number;
  body: Buffer;
}

/**
 * `GET requestTarget` on the local API at `localApiSocketPath`, given up once the connection sits idle for `timeLimitMs`: its whole
 * response, whatever its status. Interrupting it closes the connection.
 */
export function getOverTheLocalApi(localApiSocketPath: string, requestTarget: string, timeLimitMs: number): Effect.Effect<LocalApiHttpResponse, RuntimeControlFailure> {
  const operation = `GET ${requestTarget}`;
  return Effect.callback<LocalApiHttpResponse, RuntimeControlFailure>((resume) => {
    const responseChunks: Buffer[] = [];
    let responseByteCount = 0;
    let connected = false;
    let settled = false;
    const connection = net.createConnection(localApiSocketPath);
    const settleOnce = (outcome: Effect.Effect<LocalApiHttpResponse, RuntimeControlFailure>) => {
      if (settled) return;
      settled = true;
      connection.destroy();
      resume(outcome);
    };
    const malformedAnswer = (words: string) => new ContractMismatch({ operation, contractType: "an HTTP/1.1 response", direction: "answer", words });
    connection.setTimeout(timeLimitMs);
    connection.on("connect", () => {
      connected = true;
      connection.write(httpRequestBytes("GET", requestTarget));
    });
    connection.on("data", (responseChunk: Buffer) => {
      responseChunks.push(responseChunk);
      responseByteCount += responseChunk.length;
      if (responseByteCount > LARGEST_LOCAL_API_RESPONSE_BYTES) {
        settleOnce(Effect.fail(malformedAnswer(`${operation} to ${localApiSocketPath} answered more than ${LARGEST_LOCAL_API_RESPONSE_BYTES} bytes`)));
      }
    });
    connection.on("timeout", () =>
      settleOnce(Effect.fail(new RuntimeTimedOut({ operation, words: `${operation} to ${localApiSocketPath} did not answer within ${durationAsTheTimeoutFailureSpellsIt(timeLimitMs)}` }))),
    );
    connection.on("error", (connectionFailure) => {
      const failureText = describeCaughtFailure(connectionFailure);
      settleOnce(
        Effect.fail(
          new RuntimeUnreachable({
            operation,
            words: connected ? `${operation} to ${localApiSocketPath} got no answer: ${failureText}` : `no runtime answers at ${localApiSocketPath}: ${failureText}`,
          }),
        ),
      );
    });
    connection.on("end", () => {
      const response = parseHttpResponse(Buffer.concat(responseChunks));
      settleOnce(
        response.ok
          ? Effect.succeed({ statusCode: response.value.statusCode, body: response.value.body.toString("utf8") })
          : Effect.fail(malformedAnswer(`${operation} to ${localApiSocketPath} answered malformed HTTP: ${response.failure}`)),
      );
    });
    return Effect.sync(() => {
      settled = true;
      connection.destroy();
    });
  });
}

/** The body of `response` to `GET requestTarget` when it is a `200`; any other status refused in the runtime's own words when its body carries them. */
export function bodyOfAnOkAnswer(requestTarget: string, response: LocalApiHttpResponse): Effect.Effect<string, RuntimeRefused> {
  if (response.statusCode === 200) return Effect.succeed(response.body);
  const bodyText = response.body;
  const errorResponse = parseJsonOnTheWire(bodyText);
  const runtimesOwnWords = errorResponse.ok && isAJsonObject(errorResponse.value) ? requiredText(errorResponse.value, "error") : null;
  return Effect.fail(
    new RuntimeRefused({
      operation: `GET ${requestTarget}`,
      words: runtimesOwnWords?.ok ? runtimesOwnWords.value : `the runtime answered ${requestTarget} with ${response.statusCode}: ${bodyText.trim()}`,
      byTheOperation: false,
      refusal: undefined,
    }),
  );
}

/** One HTTP/1.1 `method` request for `requestTarget`, with no body, on a connection the server closes after answering. */
export function httpRequestBytes(method: string, requestTarget: string): Buffer {
  return Buffer.from(`${method} ${requestTarget} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`, "utf8");
}

/** A complete HTTP/1.1 response read to end of stream: its status and its body, de-chunked when it was sent chunked. */
export function parseHttpResponse(responseBytes: Buffer): Result<HttpResponseRead, string> {
  const headEnd = responseBytes.indexOf("\r\n\r\n");
  if (headEnd === -1) return failedWith("the response head never ended");
  const headBytes = responseBytes.subarray(0, headEnd);
  if (!isUtf8(headBytes)) return failedWith("the response head is not UTF-8");
  const body = responseBytes.subarray(headEnd + 4);
  const [statusLine, ...headerLines] = headBytes.toString("utf8").split("\r\n");
  if (statusLine === undefined) return failedWith("the response has no status line");
  const statusCodeText = statusLine.split(" ")[1];
  const statusCode = statusCodeText !== undefined && /^\d{1,5}$/.test(statusCodeText) ? Number(statusCodeText) : null;
  if (statusCode === null || statusCode > 65535) return failedWith(`the status line ${JSON.stringify(statusLine)} names no status`);
  let contentLength: number | null = null;
  let chunked = false;
  for (const headerLine of headerLines) {
    const colon = headerLine.indexOf(":");
    if (colon === -1) continue;
    const headerName = headerLine.slice(0, colon).toLowerCase();
    const headerValue = headerLine.slice(colon + 1).trim();
    if (headerName === "content-length") {
      contentLength = /^\d+$/.test(headerValue) ? Number(headerValue) : null;
    } else if (headerName === "transfer-encoding" && headerValue.toLowerCase().includes("chunked")) {
      chunked = true;
    }
  }
  if (chunked) {
    const dechunked = dechunkedBody(body);
    return dechunked.ok ? succeeded({ statusCode, body: dechunked.value }) : dechunked;
  }
  if (contentLength === null) return succeeded({ statusCode, body });
  if (body.length < contentLength) return failedWith(`the body ended after ${body.length} of its ${contentLength} bytes`);
  return succeeded({ statusCode, body: body.subarray(0, contentLength) });
}

function dechunkedBody(chunkedBody: Buffer): Result<Buffer, string> {
  const bodyChunks: Buffer[] = [];
  let remaining = chunkedBody;
  for (;;) {
    const sizeLineEnd = remaining.indexOf("\r\n");
    if (sizeLineEnd === -1) return failedWith("a chunk size line never ended");
    const sizeLineBytes = remaining.subarray(0, sizeLineEnd);
    if (!isUtf8(sizeLineBytes)) return failedWith("a chunk size line is not UTF-8");
    const sizeText = (sizeLineBytes.toString("utf8").split(";")[0] ?? "").trim();
    if (!/^[0-9a-fA-F]+$/.test(sizeText)) return failedWith(`the chunk size ${JSON.stringify(sizeText)} is not hexadecimal`);
    const chunkSize = parseInt(sizeText, 16);
    remaining = remaining.subarray(sizeLineEnd + 2);
    if (chunkSize === 0) return succeeded(Buffer.concat(bodyChunks));
    if (remaining.length < chunkSize) return failedWith("the body ended inside a chunk");
    bodyChunks.push(remaining.subarray(0, chunkSize));
    if (remaining.length < chunkSize + 2) return failedWith("the body ended after a chunk");
    remaining = remaining.subarray(chunkSize + 2);
  }
}
