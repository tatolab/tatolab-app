// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../backend/mock_tatolab_backend";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus, TatolabStreamActionName } from "../backend/tatolab_backend_contract";
import { mountTatolabWindow } from "./tatolab_window_view";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

/** The real window over the mock backend opened with `pageQuery`, mounted the way `main.ts` mounts it. */
async function mountedWindowOverTheMock(pageQuery: string, backendChanges: Partial<TatolabBackend> = {}) {
  const backend: TatolabBackend = { ...createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery))), ...backendChanges };
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await backend.getTatolabStatus();
  await act(async () => {
    showTatolabStatus = mountTatolabWindow(rootElement, backend, firstStatus.platform, { watchExposedOutput: false });
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

  it("focuses the log filter with ⌘F, from Overview by way of Graph, and on Logs where it is", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-step]")).not.toBeNull());
    const pressCommandF = () => fireEvent.keyDown(document, { key: "f", metaKey: true });
    const focusedLogFilter = () => document.activeElement?.closest("[data-hosted-dom-page]") !== null && document.activeElement?.tagName === "INPUT";

    pressCommandF();

    await waitFor(() => expect(document.querySelector("[data-stream-page-header] [data-stream-tab='graph']")?.getAttribute("aria-current")).toBe("page"));
    await waitFor(() => expect(focusedLogFilter()).toBe(true));

    fireEvent.click(screen.getByRole("link", { name: "Logs" }));
    await waitFor(() => expect(document.querySelector("[data-stream-page-header] [data-stream-tab='logs']")?.getAttribute("aria-current")).toBe("page"));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    pressCommandF();

    await waitFor(() => expect(focusedLogFilter()).toBe(true));
    expect(document.querySelector("[data-stream-page-header] [data-stream-tab='logs']")?.getAttribute("aria-current")).toBe("page");
  });
});
