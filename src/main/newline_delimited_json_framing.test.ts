import { expect, test } from "vitest";
import { frameNewlineDelimitedJsonMessage, LARGEST_NEWLINE_DELIMITED_JSON_LINE_BYTES, NewlineDelimitedJsonMessageReader } from "./newline_delimited_json_framing.js";

test("a message is framed as one line of JSON", () => {
  expect(frameNewlineDelimitedJsonMessage({ jsonrpc: "2.0", method: "session/cancel", params: { text: "two\nlines" } }).toString("utf8")).toBe(
    '{"jsonrpc":"2.0","method":"session/cancel","params":{"text":"two\\nlines"}}\n',
  );
});

test("lines split across chunks and several lines in one chunk each read as a message, blank lines skipped", () => {
  const reader = new NewlineDelimitedJsonMessageReader();
  expect(reader.readChunk(Buffer.from('{"id":1,"res'))).toEqual({ messages: [], framing_failure: null });
  expect(reader.readChunk(Buffer.from('ult":{}}\n\n{"id":2}\r\n{"id"'))).toEqual({ messages: [{ id: 1, result: {} }, { id: 2 }], framing_failure: null });
  expect(reader.readChunk(Buffer.from(":3}\n"))).toEqual({ messages: [{ id: 3 }], framing_failure: null });
});

test("a line that is not JSON ends the stream, keeping the messages before it", () => {
  const reader = new NewlineDelimitedJsonMessageReader();
  const read = reader.readChunk(Buffer.from('{"id":1}\nWelcome to the agent\n{"id":2}\n'));
  expect(read.messages).toEqual([{ id: 1 }]);
  expect(read.framing_failure).toContain('"Welcome to the agent"');
  expect(reader.readChunk(Buffer.from('{"id":3}\n'))).toEqual({ messages: [], framing_failure: null });
});

test("a line that never ends past the largest size ends the stream", () => {
  const reader = new NewlineDelimitedJsonMessageReader();
  const read = reader.readChunk(Buffer.alloc(LARGEST_NEWLINE_DELIMITED_JSON_LINE_BYTES + 1, 0x20));
  expect(read.framing_failure).toContain("ran past");
});
