// The one sender of one input's values. It holds one write in flight; a live value replaces a live
// value still waiting, and a commit drops a live value still waiting and goes out after the write in
// flight, so no live value overtaken by a commit lands after it.

import type { JsonValue } from "../studio_readings.js";

/** One write of an input's value: kept as one commit under its gesture's key, or set live on the running node alone. */
export type InputValueWrite = { readonly mode: "live"; readonly value: JsonValue | null } | { readonly mode: "commit"; readonly value: JsonValue | null; readonly idempotency_key: string };

/** What became of a write: applied, or refused in the words of what refused it. */
export type InputValueWriteAnswer = { readonly kind: "applied" } | { readonly kind: "refused"; readonly because: string };

/** Sends one write and answers once it is applied or refused; it never rejects. */
export type SendAnInputValueWrite = (write: InputValueWrite) => Promise<InputValueWriteAnswer>;

/** One input's sender. */
export interface InputValueSender {
  /** Send `value` live now, or once the write in flight is answered, in place of a live value still waiting. */
  sendLive(value: JsonValue | null): void;
  /** Commit `value` under `idempotencyKey` after the write in flight, dropping a live value still waiting. */
  sendCommit(value: JsonValue | null, idempotencyKey: string): void;
  /** Whether no write is in flight and none waits. */
  isSettled(): boolean;
}

/** What a sender tells its owner: each write answered, then that it settled once nothing is in flight or waiting. */
export interface InputValueSenderListener {
  onWriteAnswered(write: InputValueWrite, answer: InputValueWriteAnswer): void;
  onSettled(): void;
}

/** A sender that sends each write with `send`, telling `listener` how each ended. */
export function createInputValueSender(send: SendAnInputValueWrite, listener: InputValueSenderListener): InputValueSender {
  let writeInFlight: InputValueWrite | null = null;
  // Commits wait in the order they were made; a live value waits only last, behind every commit.
  const writesWaiting: InputValueWrite[] = [];
  const sendTheNextWrite = (): void => {
    const next = writesWaiting.shift();
    if (next === undefined) {
      listener.onSettled();
      return;
    }
    writeInFlight = next;
    void send(next).then((answer) => {
      writeInFlight = null;
      listener.onWriteAnswered(next, answer);
      sendTheNextWrite();
    });
  };
  const waitThenSend = (write: InputValueWrite): void => {
    if (writesWaiting.at(-1)?.mode === "live") writesWaiting.pop();
    writesWaiting.push(write);
    if (writeInFlight === null) sendTheNextWrite();
  };
  return {
    sendLive: (value) => waitThenSend({ mode: "live", value }),
    sendCommit: (value, idempotencyKey) => waitThenSend({ mode: "commit", value, idempotency_key: idempotencyKey }),
    isSettled: () => writeInFlight === null && writesWaiting.length === 0,
  };
}
