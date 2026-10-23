// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../backend/mock_tatolab_backend";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus, TatolabStreamActionName } from "../backend/tatolab_backend_contract";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import { mountTatolabWindow } from "./tatolab_window_view";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

/** The real window over the mock backend opened with `pageQuery`, mounted the way `main.ts` mounts it. */
async function mountedWindowOverTheMock(
  pageQuery: string,
  backendChanges: Partial<TatolabBackend> = {},
  featureFlags: TatolabFrontendFeatureFlags = { watchExposedOutput: false },
) {
  const backend: TatolabBackend = { ...createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery))), ...backendChanges };
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await backend.getTatolabStatus();
  await act(async () => {
    showTatolabStatus = mountTatolabWindow(rootElement, backend, firstStatus.platform, featureFlags);
    showTatolabStatus(firstStatus);
  });
  const showStatusAsTheBackendWould = (status: TatolabStatus) => act(() => showTatolabStatus?.(status));
  return { backend, windowContent: within(rootElement), showStatusAsTheBackendWould };
}

function rowOf(streamName: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-stream-row="${streamName}"]`);
  if (row === null) return expect.unreachable(`no row for ${streamName}`);
  return row;
}

describe("the Streams list", () => {
  it("words each stream's state, run mode and steps as the runtime lists it", async () => {
    await mountedWindowOverTheMock("state=running");

    const mainRow = within(rowOf("main"));
    expect(mainRow.getByText("Running")).toBeTruthy();
    expect(mainRow.getByText("Always on")).toBeTruthy();
    expect(mainRow.getByText("4")).toBeTruthy();
    expect(within(rowOf("attached-demo")).getByText("Dev session")).toBeTruthy();
    expect(within(rowOf("pattern-two")).getByText("Stopped")).toBeTruthy();
    expect(within(rowOf("pattern-two")).getByText("—")).toBeTruthy();
    expect(within(rowOf("lobby-recorder")).getByText("Failed")).toBeTruthy();
    expect(screen.getByText("3 of 5 loaded on jonathanf-macbook")).toBeTruthy();
  });

  it("stops a stream through the backend, shows it pending, then shows the runtime's new listing", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    expect(within(rowOf("camera")).getByRole("status").textContent).toBe("Stopping…");
    await waitFor(() => expect(within(rowOf("camera")).getByText("Stopped")).toBeTruthy());
    expect(within(rowOf("camera")).queryByRole("status")).toBeNull();
    expect(within(rowOf("camera")).getByRole("button", { name: "Start: loads it again from its record" })).toBeTruthy();
  });

  it("shows a refusal under its row in the runtime's own words", async () => {
    const refusal = "Runtime error: the kept stream `camera` is already stopped; `start` loads it again";
    await mountedWindowOverTheMock("state=running", {
      runStreamAction: async (_streamAction: TatolabStreamActionName) => {
        throw refusal;
      },
    });

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() => expect(within(rowOf("camera")).getByRole("alert").textContent).toBe(`Stop was refused: ${refusal}`));
  });

  it("retries a failed stream, and a retry the runtime refuses keeps it failed with the retry's reason", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("lobby-recorder")).getByRole("button", { name: "Retry: loads it again from its record" }));

    await waitFor(() => expect(within(rowOf("lobby-recorder")).getByRole("alert").textContent).toMatch(/^Retry was refused: /));
    expect(within(rowOf("lobby-recorder")).getByText(/^`start` retried it, and it did not load: /)).toBeTruthy();
  });

  it("says in the runtime's words when it stopped a stream but could not record it stopped", async () => {
    await mountedWindowOverTheMock("state=running&stop_not_recorded=camera");

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() =>
      expect(within(rowOf("camera")).getByRole("status").textContent).toBe(
        "Stopped, but not recorded, so it loads again when the runtime restarts: Runtime error: the kept record of `camera` could not be written: Permission denied (os error 13)",
      ),
    );
    expect(within(rowOf("camera")).getByText("Stopped")).toBeTruthy();
    expect(within(rowOf("camera")).queryByText("Starting")).toBeNull();
  });

  it("asks before removing a stream, and removes it only when told to", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("pattern-two")).getByRole("button", { name: "More for pattern-two" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove pattern-two?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(document.querySelector('[data-stream-row="pattern-two"]')).toBeNull());
  });

  it("guides a person with no streams to their first one", async () => {
    await mountedWindowOverTheMock("state=empty");

    expect(screen.getByText("No streams on jonathanf-macbook yet")).toBeTruthy();
    expect(screen.getByText("tatolab dev")).toBeTruthy();
  });

  it("shows the page that says why while the runtime is not running", async () => {
    await mountedWindowOverTheMock("state=stopped");

    expect(document.querySelector("[data-streams-list-page]")).toBeNull();
    expect(document.querySelector("[data-hosted-dom-page] .streams-page")).not.toBeNull();
    expect(screen.getByText("Runtime stopped")).toBeTruthy();
  });
});

describe("the window's shell", () => {
  it("opens a stream's page from its row and hosts the stream's view there", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(rowOf("main"));

    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("main"));
    expect(document.querySelector("[data-stream-page] [data-hosted-dom-page] .streams-page")).not.toBeNull();
  });

  it("shows a stream the runtime lists while the first-stream guide is open", async () => {
    const { backend, showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=running");
    fireEvent.click(screen.getAllByRole("button", { name: "Add stream" })[0]);
    await waitFor(() => expect(document.querySelector("[data-hosted-dom-page] .first-stream-guide")).not.toBeNull());
    const statusBefore = await backend.getTatolabStatus();

    showStatusAsTheBackendWould({
      ...statusBefore,
      streams: [
        ...(statusBefore.streams ?? []),
        { name: "my-stream", state: "kept", project_directory: "/Users/ada/my-stream", node_count: 4, failed_because: null },
      ],
    });

    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("my-stream"));
  });

  it("keeps the person's theme choice", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(screen.getByRole("button", { name: "Use the dark theme" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("tatolab-window-theme")).toBe("dark");
  });

  it("names the runtime's state and the app's version in the status bar", async () => {
    await mountedWindowOverTheMock("state=running");

    expect(screen.getByText("Runtime running")).toBeTruthy();
    expect(screen.getByText("Tatolab 0.45.0")).toBeTruthy();
  });
});

/** The stream page of `streamName`, opened from its row, once its Overview shows. */
async function openTheStreamPageOf(streamName: string): Promise<HTMLElement> {
  fireEvent.click(rowOf(streamName));
  return waitFor(() => {
    const streamPage = document.querySelector<HTMLElement>(`[data-stream-page="${streamName}"]`);
    if (streamPage === null) throw new Error(`no page for ${streamName}`);
    return streamPage;
  });
}

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

describe("a stream's page", () => {
  it("opens on Overview, playing the first exposed output and listing its steps in pipeline order with their state", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");

    const preview = await waitFor(() => {
      const previewFrame = document.querySelector<HTMLIFrameElement>("[data-stream-output-preview] iframe");
      if (previewFrame === null) throw new Error("no preview yet");
      return previewFrame;
    });
    expect(preview.getAttribute("src")?.startsWith("data:text/html")).toBe(true);
    expect(textOf("[data-stream-output-preview]")).toContain("jonathanf-macbook/main/invertingeffect/video_to_downstream");
    expect(textOf("[data-stream-output-preview]")).toContain("This machine");
    const stepRows = [...document.querySelectorAll<HTMLElement>("[data-stream-step]")];
    expect(stepRows.map((stepRow) => stepRow.dataset.streamStep)).toEqual(["testpatternsource", "invertingeffect", "displaywindow", "brightnessmeter"]);
    expect(within(stepRows[1]).getByText("Python")).toBeTruthy();
    expect(within(stepRows[1]).getByText("own process")).toBeTruthy();
    expect(within(stepRows[0]).getByText("in runtime")).toBeTruthy();
    expect(within(stepRows[0]).getByText("Running")).toBeTruthy();
    expect(textOf("[data-stream-steps]")).toContain("in pipeline order");
    expect(document.querySelector("[data-dropping-links]")).toBeNull();
    const details = within(document.querySelector<HTMLElement>("[data-stream-details]") ?? document.body);
    expect(details.getByText("4 · 2 Python")).toBeTruthy();
    await waitFor(() => expect(details.getByText("4")).toBeTruthy());
    expect(details.getByText("tatolab graph --stream main")).toBeTruthy();
  });

  it("names each link that dropped messages, with the counts the graph reports beside its steps", async () => {
    await mountedWindowOverTheMock("state=dropping");
    await openTheStreamPageOf("main");

    const droppingLine = await waitFor(() => {
      const droppingLinks = document.querySelector("[data-dropping-links]");
      if (droppingLinks === null) throw new Error("no dropping link yet");
      return droppingLinks.textContent ?? "";
    });
    expect(droppingLine).toMatch(/^invertingeffect → brightnessmeter has dropped [\d,]+ messages since it was wired/);
    expect(document.querySelector("[data-stream-step='brightnessmeter']")?.textContent).toMatch(/[\d,]+ dropped/);
    expect(document.querySelector("[data-stream-step='invertingeffect']")?.textContent).toMatch(/[\d,]+ refused/);
    expect(document.querySelector("[data-stream-step='testpatternsource']")?.textContent).not.toMatch(/dropped|refused/);
  });

  it("keeps the steps of a stream it stopped as of the last load, muted, with Start in place of the preview", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-step]")).not.toBeNull());

    fireEvent.click(within(document.querySelector<HTMLElement>("[data-stream-page-header]") ?? document.body).getByRole("button", { name: /Stop/ }));

    await waitFor(() => expect(textOf("[data-nothing-to-preview]")).toContain("Stopped, so nothing to preview"));
    expect(screen.getByRole("button", { name: "Start stream" })).toBeTruthy();
    expect(textOf("[data-stream-steps]")).toContain("as of the last load");
    expect([...document.querySelectorAll("[data-stream-step]")].every((stepRow) => stepRow.textContent?.includes("Not loaded"))).toBe(true);
    expect(within(document.querySelector<HTMLElement>("[data-stream-details]") ?? document.body).getByText("Not loaded")).toBeTruthy();
  });

  it("shows a failed stream's reason in the runtime's words and retries it from the banner", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("lobby-recorder");

    const banner = document.querySelector<HTMLElement>("[data-failed-stream-banner]");
    expect(banner?.textContent).toContain("Failed — the stream's CameraSource could not open camera 0x1420000");
    expect(textOf("[data-nothing-to-preview]")).toContain("Not loaded, so nothing to preview");
    expect(textOf("[data-stream-steps]")).toContain("Its steps show here once it is loaded.");

    fireEvent.click(within(banner ?? document.body).getByRole("button", { name: /Retry/ }));

    await waitFor(() => expect(textOf("[data-stream-page-header] [role=alert]")).toMatch(/^Retry was refused: the stream's CameraSource could not open camera/));
  });

  it("shows the graph document as the runtime wrote it in Inspect, outlined by its top-level keys", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Inspect" })));

    await waitFor(() => expect(document.querySelector("[data-graph-document-view='raw']")).not.toBeNull());
    expect(textOf("[data-stream-inspect]")).toContain("tatolab graph --stream main");
    expect(textOf("[data-graph-document-view='raw']")).toContain('"stream": "main"');
    const outline = within(screen.getByRole("complementary", { name: "Graph document outline" }));
    expect(outline.getByText("nodes")).toBeTruthy();
    expect(outline.getByText("jonathanf-macbook")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    expect(document.querySelector("[data-graph-document-view='tree']")?.textContent).toContain("machine:");
  });

  it("opens the stream's project and a terminal in it, showing what refused either in its own words", async () => {
    const openedProjects: string[] = [];
    await mountedWindowOverTheMock("state=running&platform=linux&terminal=missing", {
      openStreamProjectFolder: async (streamName) => {
        openedProjects.push(streamName);
      },
    });
    await openTheStreamPageOf("camera");

    fireEvent.click(screen.getByRole("button", { name: /Open project/ }));
    fireEvent.click(screen.getByRole("button", { name: /Terminal/ }));

    await waitFor(() =>
      expect(textOf("[data-stream-page-header] [role=alert]")).toBe(
        "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.",
      ),
    );
    expect(openedProjects).toEqual(["camera"]);
  });

  it("focuses the log filter with ⌘F, from Overview by way of Logs, and on Logs where it is", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-step]")).not.toBeNull());
    const pressCommandF = () => fireEvent.keyDown(document, { key: "f", metaKey: true });
    const focusedLogFilter = () => document.activeElement?.closest("[data-hosted-dom-page]") !== null && document.activeElement?.tagName === "INPUT";

    pressCommandF();

    await waitFor(() => expect(document.querySelector("[data-stream-page-header] [data-stream-tab='logs']")?.getAttribute("aria-current")).toBe("page"));
    await waitFor(() => expect(focusedLogFilter()).toBe(true));

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    pressCommandF();

    await waitFor(() => expect(focusedLogFilter()).toBe(true));
    expect(document.querySelector("[data-stream-page-header] [data-stream-tab='logs']")?.getAttribute("aria-current")).toBe("page");
  });
});

/** `streamName`'s Graph tab, opened from its page's header, once its step cards show. */
async function openTheGraphOf(streamName: string): Promise<void> {
  await openTheStreamPageOf(streamName);
  fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Graph" })));
  await waitFor(() => expect(document.querySelectorAll("[data-stream-graph-step]").length).toBeGreaterThan(0));
}

function stepCardOf(stepName: string): HTMLElement {
  const stepCard = document.querySelector<HTMLElement>(`[data-stream-graph-step="${stepName}"]`);
  if (stepCard === null) return expect.unreachable(`no card for ${stepName}`);
  return stepCard;
}

function outputPortOf(stepName: string, portName: string): HTMLElement {
  const outputPort = stepCardOf(stepName).querySelector<HTMLElement>(`[data-step-output-port="${portName}"]`);
  if (outputPort === null) return expect.unreachable(`no output ${portName} on ${stepName}`);
  return outputPort;
}

describe("a stream's Graph tab", () => {
  it("draws every step the graph reports with its ports and state, and no counters while nothing dropped", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("main");

    await waitFor(() => expect(stepCardOf("testpatternsource").textContent).toContain("Running"));
    const stepNames = [...document.querySelectorAll<HTMLElement>("[data-stream-graph-step]")].map((stepCard) => stepCard.dataset.streamGraphStep);
    expect(stepNames).toEqual(["testpatternsource", "invertingeffect", "displaywindow", "brightnessmeter"]);
    expect(stepCardOf("invertingeffect").querySelector("[data-step-input-port='video_from_upstream']")).not.toBeNull();
    expect(outputPortOf("invertingeffect", "video_to_downstream")).toBeTruthy();
    expect(within(stepCardOf("invertingeffect")).getByText("Python")).toBeTruthy();
    expect(within(stepCardOf("testpatternsource")).getByText("Built-in")).toBeTruthy();
    expect(document.querySelector("[data-stream-graph-page]")?.textContent).not.toMatch(/dropped|refused/);
  });

  it("shows what a step dropped in and refused in amber, and hides it with the counters toggle", async () => {
    await mountedWindowOverTheMock("state=dropping");
    await openTheGraphOf("main");

    await waitFor(() => expect(stepCardOf("brightnessmeter").textContent).toMatch(/[\d,]+ dropped in/));
    expect(stepCardOf("invertingeffect").textContent).toMatch(/[\d,]+ refused/);
    expect(stepCardOf("testpatternsource").textContent).not.toMatch(/dropped|refused/);

    fireEvent.click(screen.getByRole("button", { name: "Counters" }));

    expect(stepCardOf("brightnessmeter").textContent).not.toMatch(/dropped/);
  });

  it("previews an exposed output in its card, on hover and pinned, and says an internal one must be exposed", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("main");

    await waitFor(() => expect(stepCardOf("invertingeffect").querySelector("iframe")).not.toBeNull());
    expect(stepCardOf("testpatternsource").querySelector("iframe")).toBeNull();

    fireEvent.mouseEnter(outputPortOf("invertingeffect", "video_to_downstream"));
    const hoverPreview = await waitFor(() => {
      const preview = document.querySelector<HTMLElement>("[data-stream-graph-hover-preview]");
      if (preview === null) throw new Error("no hover preview yet");
      return preview;
    });
    expect(hoverPreview.querySelector("iframe")).not.toBeNull();
    expect(hoverPreview.textContent).toContain("jonathanf-macbook/main/invertingeffect/video_to_downstream");
    const describedHoveredPort = () => document.getElementById(outputPortOf("invertingeffect", "video_to_downstream").getAttribute("aria-describedby") ?? "");
    expect(describedHoveredPort()?.textContent).toBe("jonathanf-macbook/main/invertingeffect/video_to_downstreamThis machine");

    fireEvent.click(outputPortOf("invertingeffect", "video_to_downstream"));

    await waitFor(() => expect(document.querySelector("[data-pinned-output-preview='jonathanf-macbook/main/invertingeffect/video_to_downstream'] iframe")).not.toBeNull());
    expect(outputPortOf("invertingeffect", "video_to_downstream").getAttribute("aria-pressed")).toBe("true");

    fireEvent.mouseEnter(outputPortOf("testpatternsource", "video"));

    await waitFor(() => expect(textOf("[data-stream-graph-hover-preview]")).toContain("Internal. Expose it to this machine or publicly to preview it."));
    expect(document.getElementById(outputPortOf("testpatternsource", "video").getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Internal. Expose it to this machine or publicly to preview it.",
    );
    expect(document.querySelector("[data-stream-graph-hover-preview] iframe")).toBeNull();
    fireEvent.click(outputPortOf("testpatternsource", "video"));
    expect(document.querySelectorAll("[data-pinned-output-preview]")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Previews" }));

    expect(stepCardOf("invertingeffect").querySelector("iframe")).toBeNull();
  });

  it("shows the selected step's type, origin, process, config and outputs, and the whole stream with nothing selected", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='stream']")).not.toBeNull());
    expect(textOf("[data-stream-graph-inspector]")).toContain("Nothing selected");

    fireEvent.click(stepCardOf("testpatternsource"));

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='step']")).not.toBeNull());
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    expect(inspector.getByText("tatolab.stream:TestPatternSource")).toBeTruthy();
    expect(inspector.getByText("Built-in")).toBeTruthy();
    expect(inspector.getByText("In the runtime")).toBeTruthy();
    expect(textOf("[data-stream-graph-step-config]")).toBe("width1280height720fps30");
    expect(textOf("[data-stream-graph-output-exposure='video']")).toContain("Internal");
    expect(stepCardOf("testpatternsource").dataset.selected).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='stream']")).not.toBeNull());
  });

  it("opens with the output Search's Watch asked for pinned, with the Watch flag on", async () => {
    await mountedWindowOverTheMock("state=running", {}, { watchExposedOutput: true });
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-step]")).not.toBeNull());

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const searchInput = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(".search-overlay[open] .search-input");
      if (input === null) throw new Error("no search yet");
      return input;
    });
    fireEvent.input(searchInput, { target: { value: "watch jonathanf-macbook/main/invertingeffect" } });
    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-pinned-output-preview='jonathanf-macbook/main/invertingeffect/video_to_downstream']")).not.toBeNull());
  });

  it("waits for a restarted stream's new graph instead of drawing the last load's", async () => {
    let areGraphReadsHeld = false;
    const answeringBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running")));
    await mountedWindowOverTheMock("state=running", {
      describeStreamGraph: (streamName) => (areGraphReadsHeld ? new Promise(() => {}) : answeringBackend.describeStreamGraph(streamName)),
    });
    await openTheGraphOf("main");
    // Stopping redirects Graph to Overview, which draws the page, its header included, anew.
    const streamPageHeader = () => within(document.querySelector<HTMLElement>("[data-stream-page-header]") ?? document.body);
    areGraphReadsHeld = true;

    fireEvent.click(streamPageHeader().getByRole("button", { name: /Stop/ }));
    fireEvent.click(await waitFor(() => streamPageHeader().getByRole("button", { name: /Start/ })));
    fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Graph" })));

    await waitFor(() => expect(textOf("[data-stream-graph-message]")).toBe("Reading its graph…"));
    expect(document.querySelector("[data-stream-graph-step]")).toBeNull();
  });

  it("selects a step whose card has keyboard focus with Enter", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("main");
    const cardsNode = await waitFor(() => {
      const flowNode = document.querySelector<HTMLElement>(".react-flow__node[data-id='testpatternsource']");
      if (flowNode === null) throw new Error("no flow node yet");
      return flowNode;
    });
    expect(cardsNode.getAttribute("aria-label")).toBe("testpatternsource, Running, Built-in");
    const cardsDescription = document.getElementById(cardsNode.getAttribute("aria-describedby") ?? "");
    expect(cardsDescription?.textContent).toBe("Press Enter or Space to inspect this step. Escape selects nothing.");

    cardsNode.focus();
    fireEvent.keyDown(cardsNode, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='step']")).not.toBeNull());
    expect(stepCardOf("testpatternsource").dataset.selected).toBe("true");
  });

  it("draws a link's source in another stream as a dimmed card that does not select", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("attached-demo");

    const sourceInMain = await waitFor(() => stepCardOf("main/invertingeffect"));
    expect(sourceInMain.dataset.inAnotherStream).toBe("true");
    expect(sourceInMain.textContent).toContain("Another stream");
    expect(stepCardOf("mp4writer").querySelector("[data-step-input-port='video']")).not.toBeNull();

    fireEvent.click(sourceInMain);

    expect(document.querySelector("[data-stream-graph-inspector='stream']")).not.toBeNull();
  });
});

