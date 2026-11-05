// The Agent Client Protocol's stdio framing: each JSON-RPC message is one line of UTF-8 JSON ending
// in `\n`, with no newline inside it. Bytes arrive in arbitrary chunks, so a line may be split
// across chunks and a chunk may hold several lines.

import { parseJsonOnTheWire } from "./json_on_the_wire.js";

const LINE_END = 0x0a;

/** The most bytes one line may hold before the stream is given up on. */
export const LARGEST_NEWLINE_DELIMITED_JSON_LINE_BYTES = 16 * 1024 * 1024;

/** `message` framed as one line. */
export function frameNewlineDelimitedJsonMessage(message: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
}

/** What one chunk read gives: the whole messages it completed, and a framing failure that ends the stream, if any. */
export interface NewlineDelimitedJsonMessagesRead {
  messages: unknown[];
  framing_failure: string | null;
}

/** Collects the bytes a program writes and hands back each whole line's message as it completes. */
export class NewlineDelimitedJsonMessageReader {
  private bytesHeld: Buffer = Buffer.alloc(0);
  private hasFailed = false;

  /** The messages `chunk` completes; blank lines are skipped, and once framing fails every later chunk reads nothing. */
  readChunk(chunk: Buffer): NewlineDelimitedJsonMessagesRead {
    if (this.hasFailed) return { messages: [], framing_failure: null };
    this.bytesHeld = Buffer.concat([this.bytesHeld, chunk]);
    const messages: unknown[] = [];
    for (;;) {
      const lineEnd = this.bytesHeld.indexOf(LINE_END);
      if (lineEnd === -1) {
        if (this.bytesHeld.length > LARGEST_NEWLINE_DELIMITED_JSON_LINE_BYTES) return this.failWith(messages, `a line ran past ${LARGEST_NEWLINE_DELIMITED_JSON_LINE_BYTES} bytes`);
        return { messages, framing_failure: null };
      }
      const lineText = this.bytesHeld.subarray(0, lineEnd).toString("utf8").trim();
      this.bytesHeld = this.bytesHeld.subarray(lineEnd + 1);
      if (lineText === "") continue;
      const parsed = parseJsonOnTheWire(lineText);
      if (!parsed.ok) return this.failWith(messages, `a line is not JSON (${parsed.failure}): ${JSON.stringify(lineText.slice(0, 200))}`);
      messages.push(parsed.value);
    }
  }

  private failWith(messages: unknown[], framingFailure: string): NewlineDelimitedJsonMessagesRead {
    this.hasFailed = true;
    this.bytesHeld = Buffer.alloc(0);
    return { messages, framing_failure: framingFailure };
  }
}
