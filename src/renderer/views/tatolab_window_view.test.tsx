// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../backend/mock_tatolab_backend";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus, TatolabStreamActionName } from "../../shared/tatolab_backend_contract";
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

/** The Logs toolbar's level segment named `levelName`. */
function levelSegmentNamed(levelName: RegExp): HTMLElement {
  return within(screen.getByRole("group", { name: "Levels shown" })).getByRole("button", { name: levelName });
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
    expect(screen.getByRole("heading", { level: 1, name: "Streams" })).toBeTruthy();
  });
});

describe("the window's shell", () => {
  it("opens a stream's page from its row on its Overview, hosting no DOM page in it", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(rowOf("main"));

    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("main"));
    expect(document.querySelector("[data-stream-page] [data-stream-details]")).not.toBeNull();
    expect(document.querySelector("[data-stream-page] [data-hosted-dom-page]")).toBeNull();
  });

  it("opens the stream a failure notification names when the app asks", async () => {
    let requestStreamPage: (streamName: string) => void = () => {};
    await mountedWindowOverTheMock("state=running", {
      onStreamPageRequested: (listener) => {
        requestStreamPage = listener;
        return () => {};
      },
    });

    await act(async () => requestStreamPage("lobby-recorder"));

    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("lobby-recorder"));
  });

  it("shows no sidebar header, title bar controls or status bar, leaving one way to add a stream", async () => {
    await mountedWindowOverTheMock("state=running");

    const sidebar = within(screen.getByRole("navigation", { name: "Tatolab" }));
    expect(sidebar.queryByText("jonathanf-macbook")).toBeNull();
    expect(sidebar.queryByText("Tatolab")).toBeNull();
    for (const removedControl of ["Back", "Forward", "Use the dark theme", "Search streams, outputs and views"]) {
      expect(screen.queryByRole("button", { name: removedControl }), removedControl).toBeNull();
    }
    expect(screen.queryByText("Runtime running")).toBeNull();
    expect(screen.queryByText("Tatolab 0.45.0")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Add stream/ }).map((addStreamButton) => addStreamButton.getAttribute("data-window-navigation"))).toEqual(["add-stream"]);
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

  it("shows a failed stream's reason in the runtime's words and retries it from the bar, the banner offering no second Retry", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("lobby-recorder");

    const banner = document.querySelector<HTMLElement>("[data-failed-stream-banner]");
    expect(banner?.textContent).toContain("Failed — the stream's CameraSource could not open camera 0x1420000");
    expect(textOf("[data-nothing-to-preview]")).toContain("Not loaded, so nothing to preview");
    expect(textOf("[data-stream-steps]")).toContain("Its steps show here once it is loaded.");

    expect(within(banner ?? document.body).queryByRole("button")).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-page-header] [data-stream-action="start_stream"]') ?? expect.unreachable("no Retry in the bar"));

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

  it("asks before removing the stream from its bar's menu, and goes back to the list once it is gone", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamPage = await openTheStreamPageOf("pattern-two");

    fireEvent.click(within(streamPage).getByRole("button", { name: "More for pattern-two" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove pattern-two?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(document.querySelector("[data-streams-list-page]")).not.toBeNull());
    expect(document.querySelector('[data-stream-row="pattern-two"]')).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Open a terminal in the project" }));

    await waitFor(() =>
      expect(textOf("[data-stream-page-header] [role=alert]")).toBe(
        "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.",
      ),
    );
    expect(openedProjects).toEqual(["camera"]);
  });

  it("focuses the log search with ⌘F, from Overview by way of Logs, and on Logs where it is", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-step]")).not.toBeNull());
    const pressCommandF = () => fireEvent.keyDown(document, { key: "f", metaKey: true });
    const focusedLogFilter = () => document.activeElement?.hasAttribute("data-stream-log-search") === true;

    pressCommandF();

    await waitFor(() => expect(document.querySelector("[data-stream-page-header] [data-stream-tab='logs']")?.getAttribute("aria-current")).toBe("page"));
    await waitFor(() => expect(focusedLogFilter()).toBe(true));

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    pressCommandF();

    await waitFor(() => expect(focusedLogFilter()).toBe(true));
    expect(document.querySelector("[data-stream-page-header] [data-stream-tab='logs']")?.getAttribute("aria-current")).toBe("page");
  });
});

/** `streamName`'s Logs tab, opened from its page's header. */
async function openTheLogsOf(streamName: string): Promise<void> {
  await openTheStreamPageOf(streamName);
  fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Logs" })));
  await waitFor(() => expect(document.querySelector(`[data-stream-logs-page="${streamName}"], [data-stream-logs-not-loaded="${streamName}"]`)).not.toBeNull());
}

function logRowOf(message: string): HTMLElement {
  const logRow = [...document.querySelectorAll<HTMLElement>("[data-stream-log-record]")].find((row) => row.textContent?.includes(message));
  if (logRow === undefined) return expect.unreachable(`no row reading ${message}`);
  return logRow;
}

const shownLogMessages = () => [...document.querySelectorAll<HTMLElement>("[data-stream-log-record]")].map((row) => row.textContent ?? "");

describe("a stream's Logs tab", () => {
  it("shows the records the backend serves, oldest first, each with its time, level, step, message and fields, and follows new ones", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");

    await waitFor(() => expect(shownLogMessages().length).toBeGreaterThan(3));
    const servedPage = await backend.readStreamLogRecords("main", 0);
    expect(document.querySelector("[data-stream-log-records]")?.querySelector("[data-stream-log-record]")?.getAttribute("data-stream-log-record")).toBe(String(servedPage.records[0]?.sequence));
    const loadingRow = logRowOf("Loading the stream `main`");
    expect(loadingRow.textContent).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}INFOruntimeLoading the stream `main`/);
    expect(logRowOf("mean=127.5").textContent).toMatch(/INFObrightnessmeterbrightness {2}height=720 {2}mean=127.5 {2}width=1280$/);
    expect(textOf("[data-stream-log-load]")).toMatch(/^Load #\d+$/);
    const rowCountBefore = shownLogMessages().length;

    await waitFor(() => expect(shownLogMessages().length).toBeGreaterThan(rowCountBefore), { timeout: 4000 });
  });

  it("shows a selected record in full, with its JSON record as the runtime wrote it, and goes to its step on Graph", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");
    await waitFor(() => expect(textOf("[data-stream-log-record-details]")).toContain("No line selected"));
    const brightnessRow = await waitFor(() => logRowOf("mean=127.5"));

    fireEvent.mouseDown(brightnessRow);

    const details = within(screen.getByRole("complementary", { name: "Selected record" }));
    expect(details.getByText("own process")).toBeTruthy();
    expect(textOf("[data-stream-log-details-record]")).toContain('"processor_id": "P');
    expect(textOf("[data-stream-log-details-record]")).toContain('"message": "brightness"');
    expect(brightnessRow.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(details.getByRole("button", { name: "Show in graph" }));

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='step']")).not.toBeNull());
    expect(stepCardOf("brightnessmeter").dataset.selected).toBe("true");
  });

  it("counts each level and shows one, narrows to one step, and searches messages and fields", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");
    await waitFor(() => expect(Number(document.querySelector("[data-stream-log-level-filter='warn'] .tabular")?.textContent)).toBeGreaterThan(0), { timeout: 4000 });

    fireEvent.click(levelSegmentNamed(/Warnings/));
    expect(shownLogMessages().every((row) => row.includes("WARN"))).toBe(true);
    fireEvent.click(levelSegmentNamed(/All/));

    fireEvent.mouseDown(await waitFor(() => logRowOf("mean=127.5")));
    fireEvent.click(screen.getByRole("button", { name: "Only lines from brightnessmeter" }));
    expect(shownLogMessages().every((row) => row.includes("brightnessmeter"))).toBe(true);
    expect(screen.getByRole("button", { name: "Steps shown: brightnessmeter" })).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Search main logs" }), { target: { value: "MEAN=127" } });
    expect(shownLogMessages().length).toBeGreaterThan(0);
    const firstRowFound = document.querySelector<HTMLElement>("[data-stream-log-record]");
    expect([...(firstRowFound?.querySelectorAll("mark") ?? [])].map((mark) => mark.textContent).join("")).toBe("mean=127");
    fireEvent.change(screen.getByRole("textbox", { name: "Search main logs" }), { target: { value: "nothing logs this" } });
    expect(textOf("[data-stream-log-empty]")).toBe("No lines match.");
  });

  it("opens on its errors from a step in error on Graph", async () => {
    await mountedWindowOverTheMock("state=node-error");
    await openTheGraphOf("main");
    fireEvent.click(stepCardOf("displaywindow"));

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Show errors" })));

    await waitFor(() => expect(levelSegmentNamed(/Errors/).getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(shownLogMessages().some((row) => row.includes("DisplayWindow: no window"))).toBe(true));
    expect(shownLogMessages().every((row) => row.includes("ERROR"))).toBe(true);
  });

  it("points to the stream's log folder for the earlier records the runtime no longer holds, and opens it", async () => {
    const openedLogFolders: string[] = [];
    await mountedWindowOverTheMock("state=running&held_records=5", {
      openStreamLogFolder: async (streamName) => {
        openedLogFolders.push(streamName);
      },
    });
    await openTheLogsOf("main");

    await waitFor(() => expect(textOf("[data-stream-log-earlier-records]")).toMatch(/^[\d,]+ earlier records? (is|are) in ~\/streams\/pattern\/\.streamlib\/logs\/Open$/));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(openedLogFolders).toEqual(["main"]);
  });

  it("shows a refused open of the log folder in its own words", async () => {
    await mountedWindowOverTheMock("state=running&held_records=5&log_folder=missing");
    await openTheLogsOf("main");

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Open" })));

    await waitFor(() =>
      expect(textOf("[data-stream-log-earlier-records] [role=alert]")).toBe("main has no log folder yet: /Users/jonathanf/streams/pattern/.streamlib/logs is not on this machine."),
    );
  });

  it("moves between levels with the arrow keys, the levels one Tab stop", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");
    const allLevels = levelSegmentNamed(/All/);

    expect([...document.querySelectorAll("[data-stream-log-level-filter]")].map((segment) => segment.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    act(() => allLevels.focus());
    await act(async () => {
      fireEvent.keyDown(allLevels, { key: "ArrowRight" });
    });

    expect(levelSegmentNamed(/Info/).getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement?.getAttribute("data-stream-log-level-filter")).toBe("info");
    await act(async () => {
      fireEvent.keyDown(levelSegmentNamed(/Info/), { key: "End" });
    });
    expect(levelSegmentNamed(/Errors/).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows every step again from a choice of the step menu, which the keyboard reaches like the steps", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");
    fireEvent.mouseDown(await waitFor(() => logRowOf("mean=127.5")));
    fireEvent.click(screen.getByRole("button", { name: "Only lines from brightnessmeter" }));

    fireEvent.click(screen.getByRole("button", { name: "Steps shown: brightnessmeter" }));
    const showAllSteps = await waitFor(() => screen.getByRole("menuitem", { name: "Show all steps" }));
    expect(showAllSteps.hasAttribute("data-disabled")).toBe(false);
    fireEvent.click(showAllSteps);

    await waitFor(() => expect(screen.getByRole("button", { name: "Steps shown: All steps" })).toBeTruthy());
    expect(shownLogMessages().some((row) => row.includes("runtime"))).toBe(true);
  });

  it("says why it cannot read new records in the runtime's words, keeping the rows it has", async () => {
    const refusal = "no stream named `main` is loaded in this runtime. Loaded: none";
    const answeringBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running")));
    let isRefusingReads = false;
    await mountedWindowOverTheMock("state=running", {
      readStreamLogRecords: async (streamName, afterSequence) => {
        if (isRefusingReads) throw refusal;
        return answeringBackend.readStreamLogRecords(streamName, afterSequence);
      },
    });
    await openTheLogsOf("main");
    await waitFor(() => expect(shownLogMessages().length).toBeGreaterThan(0));
    isRefusingReads = true;

    await waitFor(() => expect(textOf("[data-stream-log-read-refusal]")).toBe(`Couldn't read new records, trying again: ${refusal}`), { timeout: 3000 });
    expect(logRowOf("Loading the stream `main`")).toBeTruthy();
  });

  it("gives a failed stream its reason and log folder with Retry, and a stopped one its log folder", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("lobby-recorder");

    const failedLogs = within(document.querySelector<HTMLElement>("[data-stream-logs-not-loaded]") ?? document.body);
    expect(failedLogs.getByText("Failed to load")).toBeTruthy();
    expect(failedLogs.getByText(/the stream's CameraSource could not open camera/)).toBeTruthy();
    expect(failedLogs.getByText("~/streams/lobby-recorder/.streamlib/logs/")).toBeTruthy();
    expect(failedLogs.getByRole("button", { name: "Open log folder" })).toBeTruthy();
    fireEvent.click(failedLogs.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(textOf("[data-stream-page-header] [role=alert]")).toMatch(/^Retry was refused: /));

    fireEvent.keyDown(document, { key: "ArrowUp", metaKey: true });
    await waitFor(() => expect(document.querySelector("[data-stream-logs-not-loaded='pattern-two']")).not.toBeNull());
    expect(textOf("[data-stream-logs-not-loaded='pattern-two']")).toContain("Not loaded");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
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


/** The Add stream page's control `action`, once it shows. */
async function addStreamControl(action: string): Promise<HTMLElement> {
  return waitFor(() => {
    const control = document.querySelector<HTMLElement>(`[data-add-stream-action="${action}"]`);
    if (control === null) return expect.unreachable(`no ${action} control yet`);
    return control;
  });
}

/** The sidebar's Add stream. */
function openAddStream(): void {
  fireEvent.click(document.querySelector<HTMLElement>('[data-window-navigation="add-stream"]') ?? expect.unreachable("no Add stream in the sidebar"));
}

/** Long enough for the mock runtime to compile, load and start a project. */
const MOCK_RUN_WAIT = { timeout: 5000 };
/** Long enough for the mock's uv to set up a project's Python, then for its runtime to compile and load it. */
const MOCK_RUN_AFTER_MAKING_THE_VENV_WAIT = { timeout: 9000 };

describe("Add stream", () => {
  it("runs a chosen project folder kept, listing its compile warning, and opens the stream it loaded", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running&add_run=warning");
    openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));

    await waitFor(() => expect(document.querySelector('[data-add-stream-check="stream.py"]')?.textContent).toContain("Stream function heat_map()"));
    expect(document.querySelector('[data-add-stream-check=".venv"]')).toBeNull();
    expect(screen.getByRole("textbox", { name: "Stream name" })).toHaveProperty("value", "heat_map");
    expect(screen.getByText("cd /Users/jonathanf/code/heat-map && tatolab run -d")).toBeTruthy();

    fireEvent.click(await addStreamControl("add"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="compiling"]')).not.toBeNull());
    expect(document.querySelector("[data-add-stream-compile-output]")?.textContent).toContain("run_stream  /Users/jonathanf/code/heat-map  name=heat_map  keep=true");

    await waitFor(() => expect(document.querySelector('[data-add-stream-step="running"]')).not.toBeNull(), MOCK_RUN_WAIT);
    expect(screen.getByText("2 compile warnings")).toBeTruthy();
    expect(document.querySelector("[data-add-stream-compile-warnings]")?.textContent).toContain("tatolab: the cross-floor check found 1 thing binding this app to one floor.");

    fireEvent.click(await addStreamControl("open_stream"));
    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("heat_map"));
  });

  it("shows the runtime's refusal of a taken name in its own words, and Run as <name>-2 runs it under that name", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running&add_folder=taken");
    openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Stream name" })).toHaveProperty("value", "main"));
    fireEvent.click(await addStreamControl("add"));

    await waitFor(() => expect(document.querySelector("[data-add-stream-name-taken]")).not.toBeNull(), MOCK_RUN_WAIT);
    expect(document.querySelector("[data-add-stream-name-taken]")?.textContent).toContain(
      "Stream graph error: the stream name `main` is held by a kept stream from /Users/jonathanf/streams/pattern; load this one under another name with `--name`",
    );
    expect((await addStreamControl("add")).hasAttribute("disabled")).toBe(true);

    fireEvent.click(await addStreamControl("use_free_name"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="running"] h2')?.textContent).toBe("main-2 is running"), MOCK_RUN_WAIT);
  });

  it("creates the sample project with Create alone, which writes it, sets up its Python and runs it, with no command to run", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=empty");
    fireEvent.click(screen.getByRole("link", { name: /Create the sample stream/ }));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/streams/hello"));
    expect(screen.getByText("tatolab new /Users/jonathanf/streams/hello")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Stream name" })).toHaveProperty("value", "hello");
    expect(document.querySelector('[data-add-stream-step="new_project"]')?.textContent).not.toMatch(/\.venv|uv sync|Compile and run/);
    expect(document.querySelector('[data-add-stream-action="add"]')).toBeNull();

    fireEvent.click(await addStreamControl("create"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="compiling"]')?.getAttribute("data-add-stream-makes-the-python-environment")).toBe("true"));
    expect(document.querySelector('[data-add-stream-step="compiling"] h2')?.textContent).toBe("Setting up Python, then compiling hello");
    expect(document.querySelector("[data-add-stream-compile-output]")?.textContent).toContain("uv sync  python=Tatolab's Python 3.12.12");
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="running"] h2')?.textContent).toBe("hello is running"), MOCK_RUN_AFTER_MAKING_THE_VENV_WAIT);
  });

  it("shows uv's refusal to set up the project's Python in its own words, under its own lead", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running&add_folder=no-venv&add_venv=refused");
    openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-checks]")).not.toBeNull());
    fireEvent.click(await addStreamControl("add"));

    await waitFor(
      () => expect(document.querySelector("[data-add-stream-refusal]")?.textContent).toMatch(/^Tatolab couldn't set up the project's Python: error: Failed to fetch/),
      MOCK_RUN_WAIT,
    );
  });

  it("shows tatolab new's refusal in its own words when this build has no tatolab command", async () => {
    await mountedWindowOverTheMock("state=running&add_cli=missing");
    openAddStream();
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-add-stream-source="new_project"]') ?? expect.unreachable("no source list yet")));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/streams/hello"));

    fireEvent.click(await addStreamControl("create"));

    await waitFor(() =>
      expect(document.querySelector("[data-add-stream-refusal]")?.textContent).toBe(
        "Create was refused: This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead.",
      ),
    );
  });

  it("says in the footer why Compile and run can't be pressed while the runtime is down", async () => {
    const { backend, showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=running");
    openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-checks]")).not.toBeNull());
    const statusBefore = await backend.getTatolabStatus();

    await showStatusAsTheBackendWould({ ...statusBefore, runtime_state: "stopped", streams: null });

    await waitFor(() => expect(document.querySelector("[data-add-stream-footer-words]")?.textContent).toBe("The runtime isn't running, so it can't add a stream."));
    expect((await addStreamControl("add")).hasAttribute("disabled")).toBe(true);
  });

  it("catches the page up to the source the path names once a run that was compiling answers", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    openAddStream();
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-add-stream-source="new_project"]') ?? expect.unreachable("no source list yet")));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/streams/hello"));
    fireEvent.click(await addStreamControl("create"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="compiling"]')).not.toBeNull());

    openAddStream();

    await waitFor(() => expect(document.querySelector("[data-add-stream-page]")?.getAttribute("data-add-stream-page")).toBe("project_folder"), MOCK_RUN_AFTER_MAKING_THE_VENV_WAIT);
    expect(document.querySelector('[data-add-stream-source="project_folder"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps a run that answers after you left the page, says so in a notice, and View shows what it came to", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running&add_run=warning");
    openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-checks]")).not.toBeNull());
    fireEvent.click(await addStreamControl("add"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="compiling"]')).not.toBeNull());

    fireEvent.click(document.querySelector<HTMLElement>('[data-window-navigation="streams"]') ?? expect.unreachable("no Streams in the sidebar"));

    const notice = await waitFor(() => document.querySelector<HTMLElement>('[data-add-stream-run-notice="running"]') ?? expect.unreachable("no notice yet"), MOCK_RUN_WAIT);
    expect(notice.textContent).toContain("heat_map is running");
    expect(notice.textContent).toContain("It compiled with 2 warnings. Read them before you rely on this stream.");
    expect(document.querySelector("[data-streams-list-page]")).not.toBeNull();

    fireEvent.click(notice.querySelector<HTMLElement>('[data-window-notice-action="view"]') ?? expect.unreachable("no View"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="running"]')).not.toBeNull());
    expect(document.querySelector("[data-add-stream-compile-warnings]")?.textContent).toContain("2 compile warnings");
    expect(document.querySelector("[data-add-stream-run-notice]")).toBeNull();

    fireEvent.click(document.querySelector<HTMLElement>('[data-window-navigation="streams"]') ?? expect.unreachable("no Streams in the sidebar"));
    openAddStream();
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="project_folder"]')).not.toBeNull());
    expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("");
  });
});

/** Settings opened from the sidebar, on `section`. */
async function openSettingsOn(section: string): Promise<void> {
  fireEvent.click(document.querySelector<HTMLElement>(`[data-window-navigation="settings"]`) ?? expect.unreachable("no Settings in the sidebar"));
  const sectionLink = await waitFor(() => document.querySelector<HTMLElement>(`[data-settings-section="${section}"]`) ?? expect.unreachable(`no ${section} section`));
  fireEvent.click(sectionLink);
  await waitFor(() => expect(document.querySelector(`[data-settings-page="${section}"]`)).not.toBeNull());
}

function settingsRow(rowName: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-settings-row="${rowName}"]`) ?? expect.unreachable(`no ${rowName} row`);
}

describe("Settings", () => {
  it("opens on General, listing every section under its group beside it and leaving the sidebar as it was", async () => {
    await mountedWindowOverTheMock("state=running");
    fireEvent.click(document.querySelector<HTMLElement>(`[data-window-navigation="settings"]`) ?? expect.unreachable("no Settings"));

    await waitFor(() => expect(document.querySelector(`[data-settings-page="general"]`)).not.toBeNull());
    const sectionList = within(screen.getByRole("navigation", { name: "Settings" }));
    expect(sectionList.getByRole("link", { name: "General" }).getAttribute("aria-current")).toBe("page");
    expect(sectionList.getAllByRole("link").map((sectionLink) => sectionLink.textContent)).toEqual(["General", "Appearance", "Runtime", "Command line", "About"]);
    expect(sectionList.getByText("This machine")).toBeTruthy();
    const sidebar = within(screen.getByRole("navigation", { name: "Tatolab" }));
    expect(sidebar.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
    expect(sidebar.getByRole("link", { name: "camera, Running" })).toBeTruthy();
    expect(sidebar.getByRole("link", { name: "lobby-recorder, Failed" })).toBeTruthy();
  });

  it("switches the window light, dark or to the system's look live, and keeps the choice", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("appearance");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("tatolab-window-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(localStorage.getItem("tatolab-window-theme")).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(window.matchMedia("(prefers-color-scheme: dark)").matches);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("names the running runtime's version and uptime and its local API socket, and restarts it through Starting", { timeout: 10_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Running · tatolabd 0.55.2 · up 3d 2h"));
    expect(within(settingsRow("runtime-logs")).getByText("/Users/jonathanf/Library/Application Support/Tatolab/logs")).toBeTruthy();
    expect(screen.getByText("/tmp/streamlib-501/local-api.sock")).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>("[data-settings-page]") ?? document.body).getByText("jonathanf-macbook")).toBeTruthy();

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));
    expect(within(settingsRow("runtime-status")).getByRole("button", { name: "Restarting…" })).toBeTruthy();
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Starting"), { timeout: 3_000 });
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Running · tatolabd 0.55.2 · up less than a minute"), { timeout: 5_000 });
  });

  it("makes projects' .venvs with Tatolab's Python until you choose your own in the file dialog, and goes back to Tatolab's", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    expect(settingsRow("python-for-new-environments").textContent).toContain("Tatolab's own Python 3.12.12,");
    expect(within(settingsRow("python-for-new-environments")).queryByRole("button", { name: "Use Tatolab's Python" })).toBeNull();
    fireEvent.click(within(settingsRow("python-for-new-environments")).getByRole("button", { name: "Choose Your Own…" }));
    await waitFor(() => expect(within(settingsRow("python-for-new-environments")).getByText("/opt/homebrew/bin/python3.12")).toBeTruthy());
    expect(settingsRow("python-for-new-environments").textContent).toContain("Your own Python,");

    fireEvent.click(within(settingsRow("python-for-new-environments")).getByRole("button", { name: "Use Tatolab's Python" }));
    await waitFor(() => expect(settingsRow("python-for-new-environments").textContent).toContain("Tatolab's own Python 3.12.12,"));
  });

  it("shows a picked file that is no Python refused in the app's words, the choice unchanged", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running&python_pick=not_python");
    await openSettingsOn("runtime");

    fireEvent.click(within(settingsRow("python-for-new-environments")).getByRole("button", { name: "Choose Your Own…" }));

    await waitFor(() => expect(settingsRow("python-for-new-environments").textContent).toContain("Couldn't use that Python: /usr/bin/ruby is not a Python interpreter: ruby 3.3.0"));
    expect(settingsRow("python-for-new-environments").textContent).toContain("Tatolab's own Python 3.12.12,");
  });

  it("clears a refused pick once Use Tatolab's Python goes through", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running&python=chosen&python_pick=not_python");
    await openSettingsOn("runtime");

    fireEvent.click(within(settingsRow("python-for-new-environments")).getByRole("button", { name: "Choose Another…" }));
    await waitFor(() => expect(settingsRow("python-for-new-environments").textContent).toContain("Couldn't use that Python:"));
    fireEvent.click(within(settingsRow("python-for-new-environments")).getByRole("button", { name: "Use Tatolab's Python" }));

    await waitFor(() => expect(settingsRow("python-for-new-environments").textContent).toContain("Tatolab's own Python 3.12.12,"));
    expect(settingsRow("python-for-new-environments").textContent).not.toContain("Couldn't use that Python:");
  });

  it("shows a refused restart in the service manager's words, and offers none while Run Tatolab is off", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running&restart=refused");
    await openSettingsOn("runtime");

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));

    await waitFor(() =>
      expect(within(settingsRow("runtime-status")).getByRole("alert").textContent).toContain(
        "launchctl kickstart -k gui/501/com.tatolab.tatolabd failed (exit status: 5): Input/output error",
      ),
    );
    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=stopped");
    await openSettingsOn("runtime");
    expect(textOf("[data-runtime-status-words]")).toBe("Stopped");
    expect(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens the runtime's log folder, and offers none for a runtime that keeps no log of its own", async () => {
    let logFolderOpenings = 0;
    await mountedWindowOverTheMock("state=running", {
      openRuntimeLogFolder: async () => {
        logFolderOpenings += 1;
      },
    });
    await openSettingsOn("runtime");
    const openLogsFolder = await waitFor(() => {
      const button = within(settingsRow("runtime-logs")).getByRole("button", { name: "Open logs folder" });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(openLogsFolder);
    await waitFor(() => expect(logFolderOpenings).toBe(1));

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&runtime_log=none");
    await openSettingsOn("runtime");
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toContain("tatolabd 0.55.2"));
    expect(within(settingsRow("runtime-logs")).getByRole("button", { name: "Open logs folder" }).hasAttribute("disabled")).toBe(true);
  });

  it("switches stream-failure notifications and opening at login through the backend, and says why where a build can't open at login", async () => {
    const switchesAsked: string[] = [];
    await mountedWindowOverTheMock("state=running", {
      setStreamFailureNotifications: async (enabled) => {
        switchesAsked.push(`notifications ${enabled}`);
      },
      setOpenTatolabAtLogin: async () => {
        throw "Tatolab could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied";
      },
    });
    await openSettingsOn("general");

    fireEvent.click(within(settingsRow("stream-failure-notifications")).getByRole("switch", { name: "When a stream fails" }));
    await waitFor(() => expect(switchesAsked).toEqual(["notifications false"]));
    const openAtLoginSwitch = within(settingsRow("open-at-login")).getByRole("switch", { name: "Open Tatolab at login" });
    fireEvent.click(openAtLoginSwitch);
    await waitFor(() =>
      expect(within(settingsRow("open-at-login")).getByRole("alert").textContent).toContain(
        "Tatolab could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied",
      ),
    );
    expect(openAtLoginSwitch.getAttribute("aria-checked")).toBe("false");

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&open_at_login=not_offered");
    await openSettingsOn("general");
    expect(within(settingsRow("open-at-login")).queryByRole("switch")).toBeNull();
    expect(within(settingsRow("open-at-login")).getByText("Only a packaged Tatolab opens at login.")).toBeTruthy();
  });

  it("goes back to the status's position when the backend accepts a switch and no status follows", { timeout: 8_000 }, async () => {
    await mountedWindowOverTheMock("state=running", { setStreamFailureNotifications: async () => {} });
    await openSettingsOn("general");
    const notificationsSwitch = within(settingsRow("stream-failure-notifications")).getByRole("switch", { name: "When a stream fails" });

    fireEvent.click(notificationsSwitch);
    await waitFor(() => expect(notificationsSwitch.getAttribute("aria-checked")).toBe("false"));

    await waitFor(() => expect(notificationsSwitch.getAttribute("aria-checked")).toBe("true"), { timeout: 5_000 });
  });

  it("colours a runtime that is not responding and says why", async () => {
    await mountedWindowOverTheMock("state=unreachable");
    await openSettingsOn("runtime");

    const statusWords = document.querySelector<HTMLElement>("[data-runtime-status-words]") ?? expect.unreachable("no status words");
    expect(statusWords.textContent).toBe("Not responding");
    expect(statusWords.classList.contains("text-danger-text")).toBe(true);
    expect(within(settingsRow("runtime-status")).getByText(/hasn't answered for over 20 seconds/)).toBeTruthy();
  });

  it("names the tatolab command's path and version, and how a coding agent starts tatolab mcp", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("command-line");

    expect(within(settingsRow("command-line-tool")).getByText("~/.local/bin/tatolab")).toBeTruthy();
    expect(within(settingsRow("command-line-tool")).getByText("0.55.2")).toBeTruthy();
    expect(textOf("[data-command-line-path-line]")).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(textOf("[data-coding-agent-command]")).toContain("tatolab mcp");
    expect(textOf("[data-coding-agent-config]")).toContain('"args": ["mcp"]');
  });

  it("names the app's and the runtime's versions and the runtime's licence in About", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("about");

    await waitFor(() => expect(within(document.querySelector<HTMLElement>("[data-settings-about]") ?? document.body).getByText("Version 0.45.0 · tatolabd 0.55.2")).toBeTruthy());
    expect(screen.getByText(/Runtime licensed BUSL-1\.1\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check for Updates…" })).toBeTruthy();
  });
});

function gettingStartedControl(action: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-getting-started-action="${action}"]`) ?? expect.unreachable(`no ${action} on first run`);
}

describe("first run on macOS", () => {
  it("says what Tatolab is, then ticks Start the runtime as it starts, and Get Started opens the Streams list", async () => {
    const { showStatusAsTheBackendWould, backend } = await mountedWindowOverTheMock("state=setup");

    expect(document.querySelector('[data-getting-started-screen="welcome"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Welcome to Tatolab" })).toBeTruthy();
    expect(document.querySelector("[data-window-navigation]")).toBeNull();
    fireEvent.click(gettingStartedControl("continue"));

    expect(screen.getByRole("heading", { name: "Getting set up" })).toBeTruthy();
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Starting…");
    expect(gettingStartedControl("get_started").hasAttribute("disabled")).toBe(true);

    await showStatusAsTheBackendWould({ ...(await backend.getTatolabStatus()), runtime_state: "running", streams: [] });
    expect(document.querySelector('[data-getting-started-step="start_the_runtime"]')?.getAttribute("data-checklist-step-progress")).toBe("done");
    fireEvent.click(gettingStartedControl("get_started"));

    await waitFor(() => expect(document.querySelector('[data-getting-started-screen]')).toBeNull());
    expect(document.querySelector("[data-window-navigation]")).not.toBeNull();
  });

  it("shows a step for macOS's approval with Open Login Items, and a blocked runtime as the start step retrying with nothing to press", async () => {
    await mountedWindowOverTheMock("state=approval&first_run=unfinished");
    fireEvent.click(gettingStartedControl("continue"));
    expect(textOf('[data-getting-started-step="approve_in_login_items"]')).toContain("Allow in the Background");
    expect(document.querySelector('[data-getting-started-step-action="open_login_items"]')?.textContent).toBe("Open Login Items…");
    document.body.replaceChildren();

    await mountedWindowOverTheMock("state=blocked&first_run=unfinished");
    fireEvent.click(gettingStartedControl("continue"));
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Retrying…");
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Blocked by macOS");
    expect(document.querySelector("[data-getting-started-step-action]")).toBeNull();
  });

  it("moves keyboard focus to Getting set up as Continue goes", async () => {
    await mountedWindowOverTheMock("state=setup");
    fireEvent.click(gettingStartedControl("continue"));
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Getting set up"));
  });

  it("drops a step's refusal once the step has moved on", async () => {
    const { showStatusAsTheBackendWould, backend } = await mountedWindowOverTheMock("state=stopped&first_run=unfinished", {
      setRunTatolab: () => Promise.reject("the service manager refused it"),
    });
    fireEvent.click(gettingStartedControl("continue"));
    fireEvent.click(document.querySelector<HTMLElement>('[data-getting-started-step-action="turn_on_run_tatolab"]') ?? expect.unreachable("no Turn On Tatolab"));
    await waitFor(() => expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("Couldn't turn Tatolab on: the service manager refused it"));

    await showStatusAsTheBackendWould({ ...(await backend.getTatolabStatus()), runtime_state: "running", streams: [] });
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).not.toContain("refused");
  });

  it("opens the Streams list even when Get Started can't be remembered, and says so there", async () => {
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=setup")));
    const { showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=setup", {
      rememberFirstRunFinished: async () => {
        await mockBackend.rememberFirstRunFinished();
        throw "EACCES: permission denied, open '/Users/ada/Library/Application Support/com.tatolab.tatolab/first-run-finished.json'";
      },
    });
    fireEvent.click(gettingStartedControl("continue"));
    await showStatusAsTheBackendWould({ ...(await mockBackend.getTatolabStatus()), runtime_state: "running", streams: [] });
    fireEvent.click(gettingStartedControl("get_started"));
    await showStatusAsTheBackendWould({ ...(await mockBackend.getTatolabStatus()), first_run_finished: true, runtime_state: "running", streams: [] });

    await waitFor(() => expect(textOf("[data-first-run-finishing-refusal]")).toContain("Welcome shows again next time it opens. EACCES"));
    expect(document.querySelector("[data-window-navigation]")).not.toBeNull();
  });

  it("never says not responding for a start that never answered", async () => {
    await mountedWindowOverTheMock("state=never-answered&first_run=unfinished");
    fireEvent.click(gettingStartedControl("continue"));
    expect(textOf('[data-getting-started-step="start_the_runtime"]')).toContain("The runtime didn't start");
    expect(document.body.textContent).not.toContain("not responding");
  });

  it("keeps Linux on its installer screen and never shows Welcome", async () => {
    await mountedWindowOverTheMock("platform=linux&state=setup");
    expect(document.querySelector("[data-getting-started-screen]")).toBeNull();
    expect(screen.getByRole("heading", { name: "Install the Tatolab runtime" })).toBeTruthy();
  });
});

/** Long enough for the mock's administrator prompt to answer and the row to show it, under a full suite's load. */
const MOCK_ADMINISTRATOR_PROMPT_WAIT_MILLISECONDS = 6_000;

describe("Settings › Command line › Link in /usr/local/bin", () => {
  it("warns that the prompt says osascript, waits for the password, then shows the link", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("command-line");

    expect(settingsRow("usr-local-bin-link").textContent).toContain("osascript wants to make changes");
    fireEvent.click(within(settingsRow("usr-local-bin-link")).getByRole("button", { name: "Link in /usr/local/bin…" }));
    expect(within(settingsRow("usr-local-bin-link")).getByText("Waiting for your password…")).toBeTruthy();
    await waitFor(() => expect(settingsRow("usr-local-bin-link").textContent).toContain("Linked at /usr/local/bin/tatolab"), {
      timeout: MOCK_ADMINISTRATOR_PROMPT_WAIT_MILLISECONDS,
    });
  }, 10_000);

  it("says a cancelled prompt changed nothing", async () => {
    await mountedWindowOverTheMock("state=running&usr_local_bin=cancel");
    await openSettingsOn("command-line");
    fireEvent.click(within(settingsRow("usr-local-bin-link")).getByRole("button", { name: "Link in /usr/local/bin…" }));
    await waitFor(() => expect(settingsRow("usr-local-bin-link").textContent).toContain("The password prompt was cancelled, so nothing changed."), {
      timeout: MOCK_ADMINISTRATOR_PROMPT_WAIT_MILLISECONDS,
    });
  }, 10_000);

  it("is not shown on Linux, whose installer links the command", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await openSettingsOn("command-line");
    expect(document.querySelector('[data-settings-row="usr-local-bin-link"]')).toBeNull();
  });
});
