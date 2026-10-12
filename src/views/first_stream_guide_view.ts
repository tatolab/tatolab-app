import type { StreamGraphSummary, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import { createTerminalCommand } from "./copy_button";
import { StreamGraphView } from "./stream_graph_view";

const FIRST_STREAM_COMMANDS = ["tatolab new my-stream --test-pattern", "cd my-stream && uv sync", "tatolab run -d"];

/** The graph `tatolab new --test-pattern` scaffolds, drawn as a preview of what the first stream shows. */
const TEST_PATTERN_SCAFFOLD_GRAPH: StreamGraphSummary = {
  stream: "my-stream",
  nodes: [
    { name: "testpatternsource", type: "tatolab.stream:TestPatternSource", state: null },
    { name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", state: null },
    { name: "displaywindow", type: "tatolab.stream:DisplayWindow", state: null },
    { name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", state: null },
  ],
  links: [
    { source_node: "testpatternsource", source_port: "video", target_node: "invertingeffect", target_port: "video_from_upstream", state: "pending" },
    { source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "displaywindow", target_port: "video", state: "pending" },
    { source_node: "invertingeffect", source_port: "video_to_downstream", target_node: "brightnessmeter", target_port: "video_from_upstream", state: "pending" },
  ],
  exposed: [],
};

/** What the Streams page shows while the runtime runs no streams: the three commands to a first one. */
export function createFirstStreamGuide(platform: TatolabPlatform): { element: HTMLElement; dispose(): void } {
  const scaffoldPreview = new StreamGraphView("my-stream", platform, true);
  scaffoldPreview.showGraph(TEST_PATTERN_SCAFFOLD_GRAPH);
  const element = createElement("div", { class: "first-stream-guide" }, [
    createElement("div", { class: "first-stream-guide-column" }, [
      createElement("div", { class: "first-stream-guide-preview", "aria-hidden": "true" }, [scaffoldPreview.element]),
      createElement("h2", { class: "first-stream-guide-headline" }, ["Run your first stream"]),
      createElement("p", { class: "first-stream-guide-explanation" }, [
        "Make a project with a test pattern, install it, and run it in the background. It shows up here, graph and logs, as soon as it starts.",
      ]),
      createElement(
        "ol",
        { class: "first-stream-guide-steps", "aria-label": "Commands to run in Terminal" },
        FIRST_STREAM_COMMANDS.map((commandText, stepIndex) =>
          createElement("li", { class: "first-stream-guide-step" }, [
            createElement("span", { class: "first-stream-guide-step-number", "aria-hidden": "true" }, [String(stepIndex + 1)]),
            createTerminalCommand(commandText),
          ]),
        ),
      ),
    ]),
  ]);
  return { element, dispose: () => scaffoldPreview.dispose() };
}
