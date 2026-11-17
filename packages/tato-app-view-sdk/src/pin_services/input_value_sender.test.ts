import { expect, test } from "vitest";
import type { JsonValue } from "../studio_readings.js";
import { createInputValueSender, type InputValueWrite, type InputValueWriteAnswer } from "./input_value_sender.js";

/** A clock the test moves by hand: each timer runs once the clock reaches its time, and the promises it settles are followed through before the next. */
class ManualClock {
  private nowMs = 0;
  private timers: { atMs: number; run: () => void }[] = [];

  get now(): number {
    return this.nowMs;
  }

  after(delayMs: number, run: () => void): void {
    this.timers.push({ atMs: this.nowMs + delayMs, run });
    this.timers.sort((a, b) => a.atMs - b.atMs);
  }

  async advanceTo(atMs: number): Promise<void> {
    await settlePromises();
    for (let next = this.timers[0]; next !== undefined && next.atMs <= atMs; next = this.timers[0]) {
      this.timers.shift();
      this.nowMs = next.atMs;
      next.run();
      await settlePromises();
    }
    this.nowMs = atMs;
  }
}

async function settlePromises(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

/** A runtime answering each write `latencyMs` after it is sent, on `clock`, recording what was in flight when. */
function runtimeAnsweringAfter(clock: ManualClock, latencyMs: number, answerOf: (write: InputValueWrite) => InputValueWriteAnswer = () => ({ kind: "applied" })) {
  const sent: { atMs: number; write: InputValueWrite }[] = [];
  let inFlight = 0;
  let mostInFlight = 0;
  const send = (write: InputValueWrite) =>
    new Promise<InputValueWriteAnswer>((answer) => {
      sent.push({ atMs: clock.now, write });
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      clock.after(latencyMs, () => {
        inFlight -= 1;
        answer(answerOf(write));
      });
    });
  return { send, sent, mostInFlight: () => mostInFlight };
}

const NO_ONE_LISTENING = { onWriteAnswered: () => undefined, onSettled: () => undefined };

test("a_drag_keeps_one_live_write_in_flight_and_drops_the_values_it_overtakes", async () => {
  const clock = new ManualClock();
  const runtime = runtimeAnsweringAfter(clock, 50);
  const sender = createInputValueSender(runtime.send, NO_ONE_LISTENING);
  // A pointer moving each 16 ms for 20 moves, against a runtime answering in 50 ms.
  for (let move = 0; move < 20; move += 1) {
    await clock.advanceTo(move * 16);
    sender.sendLive(move);
  }
  await clock.advanceTo(1_000);
  expect(runtime.mostInFlight()).toBe(1);
  const liveValuesSent = runtime.sent.map(({ write }) => write.value);
  expect(liveValuesSent).toEqual([0, 3, 6, 9, 12, 15, 18, 19]);
  expect(runtime.sent.map(({ atMs }) => atMs)).toEqual([0, 50, 100, 150, 200, 250, 300, 350]);
  expect(sender.isSettled()).toBe(true);
});

test("a_commit_drops_the_live_value_waiting_and_follows_the_write_in_flight", async () => {
  const clock = new ManualClock();
  const runtime = runtimeAnsweringAfter(clock, 50);
  const sender = createInputValueSender(runtime.send, NO_ONE_LISTENING);
  sender.sendLive(1);
  await clock.advanceTo(10);
  sender.sendLive(2);
  sender.sendCommit(3, "gesture-key");
  await clock.advanceTo(30);
  expect(runtime.sent).toHaveLength(1);
  await clock.advanceTo(200);
  expect(runtime.sent.map(({ atMs, write }) => [atMs, write])).toEqual([
    [0, { mode: "live", value: 1 }],
    [50, { mode: "commit", value: 3, idempotency_key: "gesture-key" }],
  ]);
});

test("a_live_value_after_a_commit_waits_behind_it_and_commits_keep_their_order", async () => {
  const clock = new ManualClock();
  const runtime = runtimeAnsweringAfter(clock, 50);
  const sender = createInputValueSender(runtime.send, NO_ONE_LISTENING);
  sender.sendLive(1);
  sender.sendCommit(2, "first");
  sender.sendCommit(3, "second");
  sender.sendLive(4);
  sender.sendLive(5);
  await clock.advanceTo(1_000);
  expect(runtime.sent.map(({ write }) => [write.mode, write.value])).toEqual([
    ["live", 1],
    ["commit", 2],
    ["commit", 3],
    ["live", 5],
  ]);
});

test("each_write_is_answered_to_the_listener_and_it_settles_once_nothing_waits", async () => {
  const clock = new ManualClock();
  const runtime = runtimeAnsweringAfter(clock, 50, (write) => (write.mode === "commit" ? { kind: "refused", because: "input_value_not_valid" } : { kind: "applied" }));
  const heard: (string | [JsonValue | null, string])[] = [];
  const sender = createInputValueSender(runtime.send, {
    onWriteAnswered: (write, answer) => heard.push([write.value, answer.kind === "applied" ? "applied" : answer.because]),
    onSettled: () => heard.push("settled"),
  });
  sender.sendLive(1);
  sender.sendCommit(2, "key");
  expect(sender.isSettled()).toBe(false);
  await clock.advanceTo(1_000);
  expect(heard).toEqual([[1, "applied"], [2, "input_value_not_valid"], "settled"]);
});
