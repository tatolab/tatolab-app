// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeDescription } from "./backend/tatolab_backend_contract";
import { RuntimeDescriptionReadings } from "./runtime_description_reading";

afterEach(() => {
  vi.useRealTimers();
});

const DESCRIBED: RuntimeDescription = { version: "0.55.2", build_id: "0.55.2+ec6adf5.eecd", up_for_ms: 60_000, runtime_log_directory: null };

describe("the runtime's description", () => {
  it("is read only while a page shows it and the window lets it poll, every interval", async () => {
    vi.useFakeTimers();
    const describeRuntime = vi.fn(async () => DESCRIBED);
    const readings = new RuntimeDescriptionReadings({ describeRuntime }, 15_000);

    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(describeRuntime).not.toHaveBeenCalled();

    const stopShowing = readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: DESCRIBED });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(describeRuntime).toHaveBeenCalledTimes(2);

    readings.setPollingAllowed(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(describeRuntime).toHaveBeenCalledTimes(2);

    readings.setPollingAllowed(true);
    stopShowing();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(describeRuntime).toHaveBeenCalledTimes(3);
  });

  it("keeps a refusal in the runtime's words, and replaces it with the next answer", async () => {
    vi.useFakeTimers();
    const describeRuntime = vi.fn<() => Promise<RuntimeDescription>>().mockRejectedValueOnce("no runtime answers at /tmp/x.sock").mockResolvedValue(DESCRIBED);
    const readings = new RuntimeDescriptionReadings({ describeRuntime }, 15_000);
    readings.setPollingAllowed(true);
    readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "refused", refusal: "no runtime answers at /tmp/x.sock" });

    readings.pollNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: DESCRIBED });
  });

  it("drops an answer about the runtime before the state changed that lands after it", async () => {
    vi.useFakeTimers();
    const answers: ((description: RuntimeDescription) => void)[] = [];
    const describeRuntime = vi.fn(() => new Promise<RuntimeDescription>((answer) => answers.push(answer)));
    const readings = new RuntimeDescriptionReadings({ describeRuntime }, 15_000);
    readings.setPollingAllowed(true);
    readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(0);

    readings.forgetAndReadAgainAsTheRuntimesStateChanged();
    answers[0]?.({ ...DESCRIBED, up_for_ms: 999_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "not_read" });

    answers[1]?.({ ...DESCRIBED, up_for_ms: 300 });
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: { ...DESCRIBED, up_for_ms: 300 } });
  });

  it("forgets what the last runtime said as the runtime's state changes, until the new one answers", async () => {
    vi.useFakeTimers();
    let answerTheRead: (description: RuntimeDescription) => void = () => {};
    const describeRuntime = vi
      .fn<() => Promise<RuntimeDescription>>()
      .mockRejectedValueOnce("no runtime answers at /tmp/x.sock")
      .mockImplementation(() => new Promise((answer) => (answerTheRead = answer)));
    const readings = new RuntimeDescriptionReadings({ describeRuntime }, 15_000);
    readings.setPollingAllowed(true);
    readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading().kind).toBe("refused");

    readings.forgetAndReadAgainAsTheRuntimesStateChanged();
    expect(readings.readLatestReading()).toEqual({ kind: "not_read" });
    answerTheRead({ ...DESCRIBED, up_for_ms: 900 });
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: { ...DESCRIBED, up_for_ms: 900 } });
  });
});
