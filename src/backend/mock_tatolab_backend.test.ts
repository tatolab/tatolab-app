// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "./mock_tatolab_backend";
import type { ListedStream } from "./tatolab_backend_contract";

afterEach(() => {
  vi.useRealTimers();
});

function listingNamed(streams: ListedStream[] | null, streamName: string): ListedStream | undefined {
  return streams?.find((stream) => stream.name === streamName);
}

async function runningMockBackend() {
  vi.useFakeTimers();
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams()));
  const streamsAfterEachChange = async (act: () => Promise<string | null>) => {
    const settledAnswer = act().then(
      (notice) => ({ notice }),
      (refusal: unknown) => ({ refusal }),
    );
    await vi.advanceTimersByTimeAsync(100);
    const status = backend.getTatolabStatus();
    await vi.advanceTimersByTimeAsync(100);
    return { answer: await settledAnswer, streams: (await status).streams };
  };
  return { backend, streamsAfterEachChange };
}

describe("the mock backend's stream actions", () => {
  it("stops a kept stream as the runtime records it, and starts it again", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopped = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", "camera"));
    expect(stopped.answer).toEqual({ notice: null });
    expect(listingNamed(stopped.streams, "camera")).toMatchObject({ state: "stopped", node_count: null });

    const started = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", "camera"));
    expect(started.answer).toEqual({ notice: null });
    expect(listingNamed(started.streams, "camera")).toMatchObject({ state: "kept", node_count: 4 });
  });

  it("ends an attached stream's session when it is stopped", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stopped = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", "attached-demo"));

    expect(stopped.answer).toEqual({ notice: null });
    expect(listingNamed(stopped.streams, "attached-demo")).toBeUndefined();
  });

  it("refuses what the runtime refuses, in words shaped as the runtime's", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const stoppedTwice = await streamsAfterEachChange(() => backend.runStreamAction("stop_stream", "pattern-two"));
    expect(stoppedTwice.answer).toEqual({ refusal: "Runtime error: the kept stream `pattern-two` is already stopped; `start` loads it again" });
    const startedWhileLoaded = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", "main"));
    expect(startedWhileLoaded.answer).toEqual({ refusal: expect.stringMatching(/^Runtime error: the stream `main` is already loaded in this runtime, kept;/) });
    const removedUnknown = await streamsAfterEachChange(() => backend.runStreamAction("remove_stream", "nope"));
    expect(removedUnknown.answer).toEqual({ refusal: expect.stringMatching(/^Resource not found: no stream named `nope` is loaded or kept in this runtime\./) });
  });

  it("keeps a failed stream failed when its retry does not load, with the retry's reason", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const retried = await streamsAfterEachChange(() => backend.runStreamAction("start_stream", "lobby-recorder"));

    expect(retried.answer).toEqual({ refusal: expect.any(String) });
    expect(listingNamed(retried.streams, "lobby-recorder")?.failed_because).toMatch(/^`start` retried it, and it did not load: /);
  });

  it("forgets a removed stream", async () => {
    const { backend, streamsAfterEachChange } = await runningMockBackend();

    const removed = await streamsAfterEachChange(() => backend.runStreamAction("remove_stream", "pattern-two"));

    expect(removed.answer).toEqual({ notice: null });
    expect(listingNamed(removed.streams, "pattern-two")).toBeUndefined();
  });
});
