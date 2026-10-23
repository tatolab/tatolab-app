// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { ListedStream, StreamGraphSummary } from "../backend/tatolab_backend_contract";
import { StreamOverviewView } from "./stream_overview_view";

const MAIN_STREAM: ListedStream = {
  name: "main",
  state: "kept",
  project_directory: "/Users/ada/streams/pattern",
  node_count: 2,
  failed_because: null,
};

const GRAPH: StreamGraphSummary = {
  stream: "main",
  nodes: [
    { name: "testpatternsource", type: "tatolab.stream:TestPatternSource", state: "Running", dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
    { name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: "Running", dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
  ],
  links: [{ id: "L1", source_node: "testpatternsource", source_port: "video", target_node: "displaywindow", target_port: "video", state: "wired" }],
  exposed: [{ node: "testpatternsource", port: "video", level: "private", watch_page_url: null }],
  graph_document_text: "",
};

function overviewOf(stream: ListedStream, graph: StreamGraphSummary | null, watchExposedOutput: boolean) {
  const actions = { onOpenGraph: vi.fn(), onWatchOutputPort: vi.fn() };
  const view = new StreamOverviewView("macos", { watchExposedOutput }, actions);
  view.showStream(stream, "ada-macbook-pro");
  if (graph) view.showGraph(graph);
  return { view, actions };
}

describe("StreamOverviewView", () => {
  it("lists each exposed output by its address and who reads it, with no Watch button while the flag is off", () => {
    const { view } = overviewOf(MAIN_STREAM, GRAPH, false);
    const row = view.element.querySelector(".exposed-output-row");
    expect(row?.textContent).toContain("ada-macbook-pro/main/testpatternsource/video");
    expect(row?.textContent).toContain("Private. Readable by other streams and tools on this Mac.");
    expect(view.element.querySelectorAll("[data-watch]")).toHaveLength(0);
  });

  it("adds a Watch button to a readable output while the flag is on", () => {
    const { view, actions } = overviewOf(MAIN_STREAM, GRAPH, true);
    view.element.querySelector<HTMLButtonElement>('[data-watch="overview"]')?.click();
    expect(actions.onWatchOutputPort).toHaveBeenCalledWith({ node: "testpatternsource", port: "video" }, "private");
  });

  it("says nothing is exposed and offers the command that exposes one", () => {
    const { view } = overviewOf(MAIN_STREAM, { ...GRAPH, exposed: [] }, false);
    expect(view.element.querySelector(".exposed-output-none")?.textContent).toBe(
      "None. Every output of main is internal: only its own nodes read them.",
    );
    expect(view.element.textContent).toContain("tatolab expose main testpatternsource video");
  });

  it("shows a failed stream's reason verbatim with its retry command, and no graph sections", () => {
    const failedStream = { ...MAIN_STREAM, state: "failed", node_count: null, failed_because: "camera access is denied" };
    const { view } = overviewOf(failedStream, null, false);
    expect(view.element.querySelector(".failure-block-reason")?.textContent).toBe("camera access is denied");
    expect(view.element.querySelector(".failure-block")?.textContent).toContain("tatolab start main");
    expect(view.element.querySelector(".exposed-output-row")).toBeNull();
    expect(view.element.querySelector(".overview-node-row")).toBeNull();
  });

  it("lists the nodes in flow order and opens the graph from the section head", () => {
    const { view, actions } = overviewOf(MAIN_STREAM, GRAPH, false);
    const nodeNames = [...view.element.querySelectorAll(".overview-node-name")].map((nameElement) => nameElement.textContent);
    expect(nodeNames).toEqual(["testpatternsource", "displaywindow"]);
    view.element.querySelector<HTMLButtonElement>(".section-head-link")?.click();
    expect(actions.onOpenGraph).toHaveBeenCalled();
  });

  it("starts a loading stream's story with its spinner, so the spinner never splits the sentences", () => {
    const { view } = overviewOf({ ...MAIN_STREAM, node_count: null }, null, false);
    const story = view.element.querySelector(".overview-story")!;
    expect(story.firstElementChild?.classList.contains("progress-spinner")).toBe(true);
    expect(story.textContent).toMatch(/^Loading\. Its graph and logs show up as soon as it runs\. Its project is/);
  });
});
