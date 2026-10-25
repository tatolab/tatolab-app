// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import { presentStreamGraphCanvas } from "./stream_graph_canvas_presentation";
import { readTheGraphDocument } from "./stream_graph_document_presentation";
import { configRowsOfStep, presentStreamGraphInspection } from "./stream_graph_inspector_presentation";

const GRAPH_DOCUMENT_TEXT = `{
  "stream": "front-door",
  "nodes": [
    { "name": "persondetector", "type": "nodes.person_detector:PersonDetector", "config": { "model": "yolo11n.onnx", "threshold": 0.45, "seed": 9007199254740993, "classes": ["person", "dog"] } },
    { "name": "camera", "type": "tatolab.stream:CameraSource", "config": {} }
  ]
}`;

const GRAPH: StreamGraphSummary = {
  stream: "front-door",
  nodes: [
    {
      id: "",
      name: "camera",
      type: "tatolab.stream:CameraSource",
      state: "Running",
      input_ports: [],
      output_ports: [{ name: "video", catalog_section: "binary" }],
      dropped_bags_by_link: {},
      refused_bags_by_output_port: { video: 212 },
    },
    {
      id: "",
      name: "persondetector",
      type: "nodes.person_detector:PersonDetector",
      state: "Running",
      input_ports: [{ name: "video_from_upstream", catalog_section: null }],
      output_ports: [
        { name: "detections", catalog_section: null },
        { name: "video_to_downstream", catalog_section: null },
      ],
      dropped_bags_by_link: { L1: 12 },
      refused_bags_by_output_port: { detections: 0 },
    },
  ],
  links: [{ id: "L1", source_node: "camera", source_port: "video", target_node: "persondetector", target_port: "video_from_upstream", state: "wired" }],
  exposed: [
    { node: "persondetector", port: "detections", level: "private", watch_page_url: "http://127.0.0.1:4446/watch/desk/front-door/persondetector/detections" },
    { node: "camera", port: "video", level: "internal", watch_page_url: null },
  ],
  graph_document_text: GRAPH_DOCUMENT_TEXT,
};

describe("presentStreamGraphInspection", () => {
  const canvas = presentStreamGraphCanvas(GRAPH);
  const graphDocument = readTheGraphDocument(GRAPH_DOCUMENT_TEXT);

  it("with nothing selected sums up the stream: its steps, those in their own process, its links, their drops and its exposed outputs", () => {
    const inspection = presentStreamGraphInspection(canvas, graphDocument, null);

    expect(inspection.kind === "stream" && { ...inspection, exposedOutputs: inspection.exposedOutputs.map((port) => `${port.stepName}/${port.name}`) }).toEqual({
      kind: "stream",
      stepCount: 2,
      ownProcessStepCount: 1,
      stepCountWords: "2 · 1 in their own process",
      linkCount: 1,
      droppedCount: 12,
      exposedOutputs: ["persondetector/detections"],
    });
  });

  it("a selected step shows its links, process, previewable outputs, config and counters", () => {
    const inspection = presentStreamGraphInspection(canvas, graphDocument, "persondetector");

    expect(inspection.kind).toBe("step");
    if (inspection.kind !== "step") return;
    expect([inspection.linksInCount, inspection.linksOutCount, inspection.processWords]).toEqual([1, 0, "Own process"]);
    expect(inspection.previewableOutputs.map((previewable) => previewable.output.name)).toEqual(["detections"]);
    expect([inspection.linkCountWords, inspection.previewAbsenceWords]).toEqual(["1 link in · 0 out", null]);
    expect(inspection.configRows).toEqual([
      { key: "model", valueText: "yolo11n.onnx" },
      { key: "threshold", valueText: "0.45" },
      { key: "seed", valueText: "9007199254740993" },
      { key: "classes", valueText: '["person", "dog"]' },
    ]);
    expect(inspection.counterRows).toEqual([
      { counted: "camera/video", word: "dropped", count: 12 },
      { counted: "detections", word: "refused", count: 0 },
      { counted: "video_to_downstream", word: "refused", count: 0 },
    ]);
  });

  it("a built-in runs in the runtime, and a step the document gives no config has none", () => {
    const inspection = presentStreamGraphInspection(canvas, null, "camera");

    expect(inspection.kind === "step" && [inspection.processWords, inspection.configRows, inspection.previewAbsenceWords]).toEqual([
      "In the runtime",
      null,
      "No output of this step is exposed. An internal output has no preview until it is exposed to this machine or publicly.",
    ]);
    expect(configRowsOfStep(graphDocument, "camera")).toEqual([]);
  });

  it("a name no step of the stream's own has inspects the whole stream", () => {
    expect(presentStreamGraphInspection(canvas, graphDocument, "gone").kind).toBe("stream");
  });
});
