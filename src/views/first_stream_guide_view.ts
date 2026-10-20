// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createElement } from "../dom";
import { createStandaloneCommand } from "./copy_button";
import { createSpinner } from "./window_controls";

const FIRST_STREAM_STEPS: readonly { title: string; command: string; note: string }[] = [
  { title: "Make a project", command: "tatolab new my-stream --test-pattern", note: "Writes stream.py and two example nodes into my-stream/." },
  { title: "Install it", command: "cd my-stream && uv sync", note: "Creates the project's .venv with tatolab-stream in it." },
  { title: "Hand it to the runtime", command: "tatolab run -d", note: "Tatolab keeps it running, across restarts too." },
];

/** What the window shows while the runtime runs no streams: three steps to a first one, and what it will look like. */
export function createFirstStreamGuide(): HTMLElement {
  return createElement("div", { class: "first-stream-guide" }, [
    createElement("div", { class: "first-stream-guide-grid" }, [
      createElement("div", { class: "first-stream-guide-steps-column" }, [
        createElement("h1", { class: "screen-heading" }, ["Run your first stream"]),
        createElement("p", { class: "screen-lede" }, [
          "A stream is a small graph of nodes, like a source, an effect and a window. Tatolab runs it in the background, each Python node in its own process. Start with a test pattern; it needs no camera.",
        ]),
        createElement(
          "ol",
          { class: "first-stream-guide-steps", "aria-label": "Commands to run in a terminal" },
          FIRST_STREAM_STEPS.map((step, stepIndex) =>
            createElement("li", { class: "first-stream-guide-step" }, [
              createElement("span", { class: "first-stream-guide-step-number", "aria-hidden": "true" }, [String(stepIndex + 1)]),
              createElement("div", { class: "first-stream-guide-step-copy" }, [
                createElement("p", { class: "first-stream-guide-step-title" }, [step.title]),
                createStandaloneCommand(step.command),
                createElement("p", { class: "first-stream-guide-step-note" }, [step.note]),
              ]),
            ]),
          ),
        ),
        createElement("p", { class: "first-stream-guide-waiting", role: "status" }, [
          createSpinner(),
          "This window shows your stream as soon as the runtime loads it.",
        ]),
      ]),
      createElement("aside", { class: "first-stream-guide-preview-column" }, [
        createElement("h2", { class: "first-stream-guide-preview-title" }, ["What you'll see"]),
        createElement("img", {
          class: "first-stream-guide-picture",
          src: "/first-stream-preview-1280x720.png",
          alt: "Inverted color bars, the picture the test-pattern stream shows",
          width: "1280",
          height: "720",
        }),
        createElement("p", { class: "first-stream-guide-preview-text" }, [
          "A window with these inverted color bars, and a brightness reading in the logs every second.",
        ]),
        createElement("p", { class: "first-stream-guide-preview-text" }, [
          "Then make it yours: edit ",
          createElement("code", {}, ["nodes/inverting_effect.py"]),
          " and run ",
          createElement("code", {}, ["tatolab run -d"]),
          " again, or keep ",
          createElement("code", {}, ["tatolab dev"]),
          " open to reload on every save.",
        ]),
        createElement("p", { class: "first-stream-guide-agent-tip" }, [
          "Using an AI agent? Point its MCP settings at ",
          createElement("code", {}, ["tatolab mcp"]),
          ".",
        ]),
      ]),
    ]),
  ]);
}
