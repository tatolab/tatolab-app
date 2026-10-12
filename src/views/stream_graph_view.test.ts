// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { StreamGraphSummary } from "../backend/tatolab_backend_contract";
import { StreamGraphView, type StreamGraphViewActions } from "./stream_graph_view";

const TEST_PATTERN_GRAPH: StreamGraphSummary = {
  stream: "main",
  nodes: [
    { name: "testpatternsource", type: "tatolab.stream:TestPatternSource", state: "Running" },
    { name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: "Running" },
    { name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: "Error" },
    { name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", state: "Running" },
  ],
  links: [
    { source_node: "testpatternsource", source_port: "video", target_node: "invertingeffect", target_port: "video_from_upstream", state: "wired" },
    { source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "displaywindow", target_port: "video", state: "error" },
    { source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "brightnessmeter", target_port: "video_from_upstream", state: "wired" },
  ],
  exposed: [{ node: "invertingeffect", port: "video_to_downstream", level: "private" }],
};

function graphViewWith(watchExposedOutput: boolean): { view: StreamGraphView; actions: StreamGraphViewActions } {
  const actions: StreamGraphViewActions = { onWatchOutputPort: vi.fn(), onShowErrorLines: vi.fn(), onShowExposedOutputs: vi.fn() };
  const view = new StreamGraphView("main", "macos", { watchExposedOutput }, actions);
  document.body.replaceChildren(view.element);
  view.showGraph(TEST_PATTERN_GRAPH, "jonathanf-macbook");
  return { view, actions };
}

beforeAll(() => {
  // happy-dom lays nothing out, so the canvas reports the size the default window gives it.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 811 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 350 });
});

describe("StreamGraphView", () => {
  it("draws a box per node, words the graph's health and names what is exposed", () => {
    const { view } = graphViewWith(false);
    expect(view.element.querySelectorAll(".graph-node")).toHaveLength(4);
    expect(view.element.querySelector(".graph-canvas-health")?.textContent).toBe(
      "3 of 4 nodes running, 2 of 3 links wired, 1 node in error",
    );
    expect(view.element.querySelector(".graph-canvas-exposed")?.textContent).toContain(
      "jonathanf-macbook/main/invertingeffect/video_to_downstream",
    );
    expect(view.element.querySelector('[data-node="invertingeffect"] .graph-node-port-exposure')?.textContent).toBe("private");
  });

  it("leaves Watch out of the page entirely while its flag is off", () => {
    const { view } = graphViewWith(false);
    expect(view.element.querySelectorAll("[data-watch]")).toHaveLength(0);
    for (const outputPort of view.element.querySelectorAll(".graph-node-port-output")) {
      expect(outputPort.tagName).toBe("LI");
      expect(outputPort.hasAttribute("tabindex")).toBe(false);
    }
  });

  it("turns readable output ports and the exposed address into Watch buttons while its flag is on", () => {
    const { view, actions } = graphViewWith(true);
    const portButton = view.element.querySelector<HTMLButtonElement>('[data-node="invertingeffect"] [data-watch="port"]');
    expect(portButton?.tagName).toBe("BUTTON");
    portButton?.click();
    expect(actions.onWatchOutputPort).toHaveBeenCalledWith({ node: "invertingeffect", port: "video_to_downstream" }, "private");
    expect(view.element.querySelector('[data-watch="exposed-strip"]')?.tagName).toBe("BUTTON");
  });

  it("lights the watched port's node and links, and puts them back", () => {
    const { view } = graphViewWith(true);
    view.setWatchedOutputPort({ node: "invertingeffect", port: "video_to_downstream" });
    expect(view.element.querySelector('[data-node="invertingeffect"]')?.getAttribute("data-holds-watched-port")).toBe("true");
    expect(view.element.querySelectorAll('.graph-link[data-watched="true"]')).toHaveLength(2);
    view.setWatchedOutputPort(null);
    expect(view.element.querySelectorAll('.graph-link[data-watched="true"]')).toHaveLength(0);
  });

  it("words an errored node's state in red, and its foot asks for the log's errors", () => {
    const { view, actions } = graphViewWith(false);
    const erroredNode = view.element.querySelector('[data-node="displaywindow"]');
    expect(erroredNode?.getAttribute("data-look")).toBe("error");
    erroredNode?.querySelector<HTMLButtonElement>(".graph-node-foot-failure")?.click();
    expect(actions.onShowErrorLines).toHaveBeenCalled();
  });

  it("replaces the drawing with why the graph couldn't be read", () => {
    const { view } = graphViewWith(false);
    view.showReadFailure("no stream named `main` is loaded in this runtime");
    expect(view.element.querySelectorAll(".graph-node")).toHaveLength(0);
    expect(view.element.querySelector(".graph-canvas-message")?.textContent).toContain("Couldn't read this stream's graph.");
  });
});
