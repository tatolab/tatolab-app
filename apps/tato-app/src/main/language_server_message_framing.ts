// The Language Server Protocol's base framing over a byte stream: each message is a header block
// ending in a blank line (`Content-Length: <bytes>\r\n\r\n`) followed by that many bytes of
// UTF-8 JSON. Bytes arrive in arbitrary chunks, so a message may be split across chunks and a chunk
// may hold several messages.

import { parseJsonOnTheWire } from "./json_on_the_wire.js";

const HEADER_BLOCK_END = Buffer.from("\r\n\r\n", "ascii");
const CONTENT_LENGTH_HEADER = /^content-length:\s*(\d+)\s*$/im;

/** `message` framed as one Language Server Protocol message. */
export function frameLanguageServerMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

/** What one chunk read gives: the whole messages it completed, and a framing failure that ends the stream, if any. */
export interface LanguageServerMessagesRead {
  messages: unknown[];
  framing_failure: string | null;
}

/** Collects the bytes a language server writes and hands back each whole message as it completes. */
export class LanguageServerMessageReader {
  private bytesHeld: Buffer = Buffer.alloc(0);
  private hasFailed = false;

  /** The messages `chunk` completes; once framing fails, every later chunk reads nothing. */
  readChunk(chunk: Buffer): LanguageServerMessagesRead {
    if (this.hasFailed) return { messages: [], framing_failure: null };
    this.bytesHeld = Buffer.concat([this.bytesHeld, chunk]);
    const messages: unknown[] = [];
    for (;;) {
      const headerEnd = this.bytesHeld.indexOf(HEADER_BLOCK_END);
      if (headerEnd === -1) return { messages, framing_failure: null };
      const headerBlock = this.bytesHeld.subarray(0, headerEnd).toString("ascii");
      const contentLength = CONTENT_LENGTH_HEADER.exec(headerBlock)?.[1];
      if (contentLength === undefined) return this.failWith(messages, `a message's headers name no Content-Length: ${JSON.stringify(headerBlock)}`);
      const bodyStart = headerEnd + HEADER_BLOCK_END.length;
      const bodyEnd = bodyStart + Number(contentLength);
      if (this.bytesHeld.length < bodyEnd) return { messages, framing_failure: null };
      const body = parseJsonOnTheWire(this.bytesHeld.subarray(bodyStart, bodyEnd).toString("utf8"));
      this.bytesHeld = this.bytesHeld.subarray(bodyEnd);
      if (!body.ok) return this.failWith(messages, `a message's body is not JSON: ${body.failure}`);
      messages.push(body.value);
    }
  }

  private failWith(messages: unknown[], framingFailure: string): LanguageServerMessagesRead {
    this.hasFailed = true;
    this.bytesHeld = Buffer.alloc(0);
    return { messages, framing_failure: framingFailure };
  }
}
