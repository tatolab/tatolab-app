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
});
