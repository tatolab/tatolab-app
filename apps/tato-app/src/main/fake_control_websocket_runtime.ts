// Tests' stand-in for the runtime's `/control/ws`: a Unix socket that upgrades each connection, answers
// `discover` as a runtime of the asked-for age does, and every later call as the test says. Never
// imported by shipped code.

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { CONTROL_CONTRACT_REVISION, CONTROL_CONTRACT_VERSION, CONTROL_OPERATION_METHOD_NAMES } from "@tatolab/runtime-client";

/** How the fake runtime answers one call on `/control/ws` after `discover`: the messages to send back, or `null` to leave it unanswered. */
export type FakeControlWebSocketAnswer = (call: Record<string, unknown>) => string[] | null;

/** What `discover` answers from a runtime serving the contract this Studio was built against, in the shape `DiscoverResult` serializes to. */
export const DISCOVERED_AT_THIS_STUDIOS_CONTRACT = {
  contract_version: CONTROL_CONTRACT_VERSION,
  contract_revision: CONTROL_CONTRACT_REVISION,
  runtime_version: "0.69.84",
  build_id: "test-build",
  operations: [...CONTROL_OPERATION_METHOD_NAMES],
};

/** The GUID RFC 6455 appends to a client's `Sec-WebSocket-Key` before hashing it into `Sec-WebSocket-Accept`. */
const WEBSOCKET_ACCEPT_KEY_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const WEBSOCKET_TEXT_OPCODE = 0x1;
const WEBSOCKET_CLOSE_OPCODE = 0x8;

/** One unmasked, final server frame carrying `payload` with `opcode`, as RFC 6455 frames it. */
function serverWebSocketFrame(opcode: number, payload: Buffer): Buffer {
  const lengthBytes = payload.length < 126 ? Buffer.from([payload.length]) : Buffer.alloc(9);
  if (payload.length >= 126) {
    lengthBytes[0] = 127;
    lengthBytes.writeBigUInt64BE(BigInt(payload.length), 1);
  }
  return Buffer.concat([Buffer.from([0x80 | opcode]), lengthBytes, payload]);
}

/** The first whole masked client frame in `bytes`, unmasked, with the bytes after it; or `null` while it has not all arrived. */
function firstClientWebSocketFrame(bytes: Buffer): { opcode: number; payload: Buffer; bytesAfter: Buffer } | null {
  if (bytes.length < 2) return null;
  const opcode = (bytes[0] ?? 0) & 0x0f;
  const shortLength = (bytes[1] ?? 0) & 0x7f;
  const lengthFieldBytes = shortLength === 126 ? 2 : shortLength === 127 ? 8 : 0;
  const maskStart = 2 + lengthFieldBytes;
  if (bytes.length < maskStart + 4) return null;
  const payloadLength = shortLength === 126 ? bytes.readUInt16BE(2) : shortLength === 127 ? Number(bytes.readBigUInt64BE(2)) : shortLength;
  const payloadStart = maskStart + 4;
  if (bytes.length < payloadStart + payloadLength) return null;
  const mask = bytes.subarray(maskStart, payloadStart);
  const payload = Buffer.from(bytes.subarray(payloadStart, payloadStart + payloadLength).map((byte, index) => byte ^ (mask[index % 4] ?? 0)));
  return { opcode, payload, bytesAfter: bytes.subarray(payloadStart + payloadLength) };
}

/** A JSON-RPC answer line to the call `id` carrying `result`. */
export function resultLine(id: unknown, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

/** A runtime on `/control/ws` that the test drives, and every upgrade and call after `discover` it read. */
export interface FakeControlWebSocketRuntime {
  readonly localApiSocketPath: string;
  readonly upgradeRequestsRead: readonly string[];
  readonly callsRead: readonly Record<string, unknown>[];
  closeEveryConnection(): void;
  close(): Promise<void>;
}

/**
 * A local API that upgrades `/control/ws`, answers `discover` with `answerDiscover` (by default as a runtime serving this Studio's
 * contract), and then each call with `answerCall`, recording every upgrade and every call after `discover` it read.
 */
export async function fakeControlWebSocketRuntime(
  answerCall: FakeControlWebSocketAnswer,
  answerDiscover: FakeControlWebSocketAnswer = (call) => [resultLine(call["id"], DISCOVERED_AT_THIS_STUDIOS_CONTRACT)],
): Promise<FakeControlWebSocketRuntime> {
  const socketDirectory = await mkdtemp("/tmp/tl-app-");
  const localApiSocketPath = path.join(socketDirectory, "local-api.sock");
  const upgradeRequestsRead: string[] = [];
  const callsRead: Record<string, unknown>[] = [];
  const connectionsOpen: net.Socket[] = [];
  const server = net.createServer((connection) => {
    connectionsOpen.push(connection);
    const sendText = (messageText: string) => connection.write(serverWebSocketFrame(WEBSOCKET_TEXT_OPCODE, Buffer.from(messageText, "utf8")));
    let bytesRead: Buffer = Buffer.alloc(0);
    let upgraded = false;
    connection.on("data", (chunk: Buffer) => {
      bytesRead = Buffer.concat([bytesRead, chunk]);
      if (!upgraded) {
        const headEnd = bytesRead.indexOf("\r\n\r\n");
        if (headEnd === -1) return;
        const upgradeHead = bytesRead.subarray(0, headEnd).toString("utf8");
        upgradeRequestsRead.push(upgradeHead);
        bytesRead = bytesRead.subarray(headEnd + 4);
        upgraded = true;
        const websocketKey = /^sec-websocket-key:\s*(\S+)\s*$/im.exec(upgradeHead)?.[1] ?? "";
        const acceptKey = createHash("sha1").update(websocketKey + WEBSOCKET_ACCEPT_KEY_GUID).digest("base64");
        connection.write(`HTTP/1.1 101 Switching Protocols\r\nconnection: upgrade\r\nupgrade: websocket\r\nsec-websocket-accept: ${acceptKey}\r\n\r\n`);
      }
      for (let frame = firstClientWebSocketFrame(bytesRead); frame !== null; frame = firstClientWebSocketFrame(bytesRead)) {
        bytesRead = frame.bytesAfter;
        if (frame.opcode === WEBSOCKET_CLOSE_OPCODE) {
          connection.end(serverWebSocketFrame(WEBSOCKET_CLOSE_OPCODE, frame.payload.subarray(0, 2)));
          return;
        }
        if (frame.opcode !== WEBSOCKET_TEXT_OPCODE) continue;
        const call: unknown = JSON.parse(frame.payload.toString("utf8"));
        if (typeof call !== "object" || call === null) continue;
        const callFields = Object.fromEntries(Object.entries(call));
        if (callFields["method"] === "discover") {
          for (const answerText of answerDiscover(callFields) ?? []) sendText(answerText);
          continue;
        }
        callsRead.push(callFields);
        for (const answerText of answerCall(callFields) ?? []) sendText(answerText);
      }
    });
    connection.on("error", () => connection.destroy());
    connection.once("end", () => connection.end());
  });
  await new Promise<void>((listening) => server.listen(localApiSocketPath, listening));
  return {
    localApiSocketPath,
    upgradeRequestsRead,
    callsRead,
    closeEveryConnection: () => connectionsOpen.forEach((connection) => connection.destroy()),
    close: async () => {
      for (const connection of connectionsOpen) connection.destroy();
      await new Promise<void>((closed) => server.close(() => closed()));
      await rm(socketDirectory, { recursive: true, force: true });
    },
  };
}
