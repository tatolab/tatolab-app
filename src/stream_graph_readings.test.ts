// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamGraphSummary } from "./backend/tatolab_backend_contract";
import { StreamGraphReadings } from "./stream_graph_readings";

function graphNamed(streamName: string, nodeName: string): StreamGraphSummary {
  return {
    stream: streamName,
    nodes: [{ id: "", name: nodeName, type: "tatolab.stream:TestPatternSource", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} }],
    links: [],
    exposed: [],
    graph_document_text: `{"stream":"${streamName}"}`,
  };
}

/** A backend answering each read with the graph its stream's queue holds next, or the refusal set for it. */
function backendAnswering() {
  const answers = new Map<string, (StreamGraphSummary | string)[]>();
  const reads: string[] = [];
  const backend = {
    describeStreamGraph: async (streamName: string): Promise<StreamGraphSummary> => {
      reads.push(streamName);
      const answer = answers.get(streamName)?.shift() ?? `no stream named \`${streamName}\` is loaded`;
      if (typeof answer === "string") throw answer;
      return answer;
    },
  };
  return { backend, answers, reads };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("StreamGraphReadings", () => {
  it("reads the shown loaded stream's graph while polling is allowed, then again each interval", async () => {
    const { backend, answers, reads } = backendAnswering();
    answers.set("main", [graphNamed("main", "a"), graphNamed("main", "b")]);
    const readings = new StreamGraphReadings(backend, 1000);
    const heardChanges = vi.fn();
    readings.subscribeToReadings(heardChanges);

    readings.showStream("main", true);
    expect(reads).toEqual([]);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readingOf("main").graph?.nodes[0]?.name).toBe("a");
    expect(readings.readingOf("main").graphSource).toBe("loaded");
    await vi.advanceTimersByTimeAsync(1000);

    expect(reads).toEqual(["main", "main"]);
    expect(readings.readingOf("main").graph?.nodes[0]?.name).toBe("b");
    expect(heardChanges).toHaveBeenCalledTimes(2);
  });

  it("keeps a stream's last graph once it stops, as of its last load, and reads none while it is not loaded", async () => {
    const { backend, answers, reads } = backendAnswering();
    answers.set("main", [graphNamed("main", "a")]);
    const readings = new StreamGraphReadings(backend, 1000);
    readings.setPollingAllowed(true);
    readings.showStream("main", true);
    await vi.advanceTimersByTimeAsync(0);
    readings.rememberStreamInstance("main", "4");

    readings.showStream("main", false);
    await vi.advanceTimersByTimeAsync(5000);

    expect(reads).toEqual(["main"]);
    expect(readings.readingOf("main")).toEqual({ graph: graphNamed("main", "a"), graphSource: "as_of_the_last_load", readRefusal: null, streamInstance: null });
  });

  it("keeps the runtime's refusal of a read beside the last graph, and drops a read that answers after the stream moved on", async () => {
    const { backend, answers } = backendAnswering();
    answers.set("main", [graphNamed("main", "a"), "graph failed: the engine is shutting down"]);
    answers.set("camera", [graphNamed("camera", "c")]);
    const readings = new StreamGraphReadings(backend, 1000);
    readings.setPollingAllowed(true);
    readings.showStream("main", true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(readings.readingOf("main").graph?.nodes[0]?.name).toBe("a");
    expect(readings.readingOf("main").readRefusal).toBe("graph failed: the engine is shutting down");

    readings.showStream("camera", true);
    readings.showStream("main", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readingOf("camera").graph).toBeNull();
  });

  it("stops reading while polling is not allowed, and reads at once when asked", async () => {
    const { backend, answers, reads } = backendAnswering();
    answers.set("main", [graphNamed("main", "a"), graphNamed("main", "b"), graphNamed("main", "c")]);
    const readings = new StreamGraphReadings(backend, 1000);
    readings.showStream("main", true);
    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    readings.setPollingAllowed(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reads).toEqual(["main"]);

    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(0);
    readings.pollNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual(["main", "main", "main"]);
  });
});
