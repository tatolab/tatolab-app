import { expect, test } from "vitest";
import { frameLanguageServerMessage, LanguageServerMessageReader } from "./language_server_message_framing.js";

test("a framed message reads back whole, its length counted in UTF-8 bytes", () => {
  const message = { jsonrpc: "2.0", method: "window/logMessage", params: { message: "naïve → ✓" } };
  const framed = frameLanguageServerMessage(message);

  expect(framed.toString("utf8").startsWith(`Content-Length: ${Buffer.byteLength(JSON.stringify(message))}\r\n\r\n`)).toBe(true);
  expect(new LanguageServerMessageReader().readChunk(framed)).toEqual({ messages: [message], framing_failure: null });
});

test("a message split across chunks, even inside a multi-byte character, reads once its last byte arrives", () => {
  const message = { id: 1, result: { label: "café" } };
  const framed = frameLanguageServerMessage(message);
  const reader = new LanguageServerMessageReader();
  const splitInsideTheE = framed.length - 4;

  expect(reader.readChunk(framed.subarray(0, 10)).messages).toEqual([]);
  expect(reader.readChunk(framed.subarray(10, splitInsideTheE)).messages).toEqual([]);
  expect(reader.readChunk(framed.subarray(splitInsideTheE)).messages).toEqual([message]);
});

test("one chunk holding several messages reads each, keeping a partial one for the next chunk", () => {
  const first = frameLanguageServerMessage({ id: 1 });
  const second = frameLanguageServerMessage({ id: 2 });
  const third = frameLanguageServerMessage({ id: 3 });
  const reader = new LanguageServerMessageReader();

  expect(reader.readChunk(Buffer.concat([first, second, third.subarray(0, 5)])).messages).toEqual([{ id: 1 }, { id: 2 }]);
  expect(reader.readChunk(third.subarray(5)).messages).toEqual([{ id: 3 }]);
});

test("other headers are allowed beside Content-Length, in any case", () => {
  const body = JSON.stringify({ id: 7 });
  const reader = new LanguageServerMessageReader();

  expect(reader.readChunk(Buffer.from(`content-type: application/vscode-jsonrpc; charset=utf-8\r\ncontent-length: ${body.length}\r\n\r\n${body}`)).messages).toEqual([{ id: 7 }]);
});

test("headers without a Content-Length fail the stream, and nothing reads after", () => {
  const reader = new LanguageServerMessageReader();

  const read = reader.readChunk(Buffer.from("X-Other: 1\r\n\r\n{}"));

  expect(read.messages).toEqual([]);
  expect(read.framing_failure).toContain("no Content-Length");
  expect(reader.readChunk(frameLanguageServerMessage({ id: 1 }))).toEqual({ messages: [], framing_failure: null });
});

test("a body that is not JSON fails the stream, keeping the messages read before it", () => {
  const reader = new LanguageServerMessageReader();

  const read = reader.readChunk(Buffer.concat([frameLanguageServerMessage({ id: 1 }), Buffer.from("Content-Length: 3\r\n\r\n{x}")]));

  expect(read.messages).toEqual([{ id: 1 }]);
  expect(read.framing_failure).toContain("not JSON");
});
