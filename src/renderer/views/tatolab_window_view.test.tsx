// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../backend/mock_tatolab_backend";
import { mockStreamIdOf as mockStreamIdOfTheLocation } from "../backend/mock_stream_fixtures";
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

/** The id the mock runtime lists each of its streams under, by display name, as the runtime computes one from its location. */
const MOCK_STREAM_ID_BY_DISPLAY_NAME: Readonly<Record<string, string>> = {
  main: "pattern-main-645dbe",
  camera: "camera-main-018da9",
  recorder: "pattern-recorder-7d11b1",
  "pattern-two": "pattern-pattern-two-e6043c",
  "lobby-recorder": "lobby-recorder-main-3fc45e",
  heat_map: "heat-map-heat-map-1acf70",
  hello: "hello-main-56afa5",
};

function mockStreamIdOf(displayName: string): string {
  return MOCK_STREAM_ID_BY_DISPLAY_NAME[displayName] ?? expect.unreachable(`no mock stream shown as ${displayName}`);
}

/** The id the mock runtime gives the `@stream` `streamFunction` of the project in `projectDirectory`. */
function mockStreamIdOfTheProjectStream(streamFunction: string, projectDirectory: string): string {
  return mockStreamIdOfTheLocation({ project_directory: projectDirectory, stream_function: `stream:${streamFunction}` });
}

/** The row of the mock stream shown as `displayName`. */
function rowOf(displayName: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-stream-row="${mockStreamIdOf(displayName)}"]`);
  if (row === null) return expect.unreachable(`no row for ${displayName}`);
  return row;
}

describe("the Streams list", () => {
  it("lists each stream under its project folder, its state in its name, a failure's reason in the runtime's words under it", async () => {
    await mountedWindowOverTheMock("state=running");

    const patternFolder = within(document.querySelector<HTMLElement>('[data-streams-list-project-folder="/Users/jonathanf/streams/pattern"]') ?? expect.unreachable("no pattern folder"));
    expect(patternFolder.getAllByRole("listitem").map((row) => row.getAttribute("data-stream-row"))).toEqual(["main", "recorder", "pattern-two"].map(mockStreamIdOf));
    expect(within(rowOf("recorder")).getByRole("link", { name: "recorder, Running" })).toBeTruthy();
    expect(within(rowOf("main")).getByRole("link", { name: "main, Running" })).toBeTruthy();
    expect(within(rowOf("pattern-two")).getByRole("link", { name: "pattern-two, Stopped" })).toBeTruthy();
    expect(within(rowOf("lobby-recorder")).getByRole("link", { name: "lobby-recorder, Failed" })).toBeTruthy();
    expect(rowOf("lobby-recorder").textContent).toContain("camera access is denied for Tatolab");
  });

  it("shows only the streams in the state chosen from the state menu, counting each state", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(document.querySelector<HTMLElement>("[data-streams-list-state-filter]") ?? expect.unreachable("no state menu"));
    const failedChoice = await waitFor(() => document.querySelector<HTMLElement>('[data-streams-list-state-choice="failed"]') ?? expect.unreachable("no Failed choice"));
    expect(document.querySelector('[data-streams-list-state-choice="running"]')?.textContent).toBe("Running3");
    fireEvent.click(failedChoice);

    await waitFor(() => expect([...document.querySelectorAll("[data-stream-row]")].map((row) => row.getAttribute("data-stream-row"))).toEqual([mockStreamIdOf("lobby-recorder")]));
    expect(screen.getByRole("button", { name: "States shown: Failed" })).toBeTruthy();
  });

  it("stops a stream through the backend, shows it pending, then shows the runtime's new listing", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    expect(within(rowOf("camera")).getByRole("status").textContent).toBe("Stopping…");
    await waitFor(() => expect(within(rowOf("camera")).getByRole("link", { name: "camera, Stopped" })).toBeTruthy());
    expect(within(rowOf("camera")).queryByRole("status")).toBeNull();
    expect(within(rowOf("camera")).getByRole("button", { name: "Start: loads it again from its record" })).toBeTruthy();
  });

  it("shows a refusal under its row in the runtime's own words", async () => {
    const refusal = "Runtime error: the stream `camera-main-018da9` is already stopped; `start` loads it again";
    await mountedWindowOverTheMock("state=running", {
      runStreamAction: async (_streamAction: TatolabStreamActionName) => {
        throw refusal;
      },
    });

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() => expect(within(rowOf("camera")).getByRole("alert").textContent).toBe(`Stop was refused: ${refusal}`));
  });

  it("queues a retry of a failed stream, shows it preparing with its step, and keeps it failed with the retry's reason when it does not load", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("lobby-recorder")).getByRole("button", { name: "Retry: loads it again from its record" }));

    await waitFor(() => expect(within(rowOf("lobby-recorder")).getByRole("status").textContent).toMatch(/^Preparing · (queued|compiling|starting)$/));
    await waitFor(() => expect(within(rowOf("lobby-recorder")).getByText(/^`start` retried it, and it did not load: /)).toBeTruthy(), { timeout: 3000 });
    expect(within(rowOf("lobby-recorder")).queryByRole("alert")).toBeNull();
  });

  it("shows a stop under way as the runtime lists it, stopping, then stopped", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() => expect(within(rowOf("camera")).getByRole("status").textContent).toMatch(/^Stopping/));
    await waitFor(() => expect(within(rowOf("camera")).getByRole("link", { name: "camera, Stopped" })).toBeTruthy(), { timeout: 3000 });
    expect(within(rowOf("camera")).queryByRole("status")).toBeNull();
  });

  it("asks before removing a project, naming its folder and every stream of it, and removes them only when told to", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("pattern-two")).getByRole("button", { name: "More for pattern-two" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove project…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove the project pattern?")).toBeTruthy();
    expect(dialog.textContent).toContain("its 3 streams, main, recorder and pattern-two");
    expect(dialog.textContent).toContain("The folder ~/streams/pattern and its log stay as they are.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove project" }));

    await waitFor(
      () => expect(["main", "recorder", "pattern-two"].map((displayName) => document.querySelector(`[data-stream-row="${mockStreamIdOf(displayName)}"]`))).toEqual([null, null, null]),
      { timeout: 3000 },
    );
    expect(document.querySelector(`[data-stream-row="${mockStreamIdOf("camera")}"]`)).not.toBeNull();
  });

  it("guides a person with no streams to their first one", async () => {
    await mountedWindowOverTheMock("state=empty");

    expect(screen.getByText("No streams on jonathanf-macbook yet")).toBeTruthy();
    expect(screen.queryByText("tatolab dev")).toBeNull();
  });

  it("shows the page that says why while the runtime is not running", async () => {
    await mountedWindowOverTheMock("state=stopped");

    expect(document.querySelector("[data-streams-list-page]")).toBeNull();
    expect(document.querySelector("[data-hosted-dom-page] .streams-page")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Streams" })).toBeTruthy();
    expect(document.querySelector("[data-hosted-dom-page] [role='status']")?.textContent).toBe("Tatolab is off");
  });
});

describe("the window's shell", () => {
  it("opens a stream's page from its row on its Overview, hosting no DOM page in it", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(rowOf("main"));

    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("main"));
    expect(document.querySelector("[data-stream-page] [data-stream-overview]")).not.toBeNull();
    expect(document.querySelector("[data-stream-page] [data-hosted-dom-page]")).toBeNull();
  });

  it("opens the stream a failure notification names when the app asks", async () => {
    let requestStreamPage: (streamId: string) => void = () => {};
    await mountedWindowOverTheMock("state=running", {
      onStreamPageRequested: (listener) => {
        requestStreamPage = listener;
        return () => {};
      },
    });

    await act(async () => requestStreamPage(mockStreamIdOf("lobby-recorder")));

    await waitFor(() => expect(document.querySelector("[data-stream-page] h1")?.textContent).toBe("lobby-recorder"));
  });

  it("shows no sidebar header, title bar controls or status bar, leaving the sidebar's + menu the one way to add a project", async () => {
    await mountedWindowOverTheMock("state=running");

    const sidebar = within(screen.getByRole("navigation", { name: "Tatolab" }));
    expect(sidebar.queryByText("jonathanf-macbook")).toBeNull();
    expect(sidebar.queryByText("Tatolab")).toBeNull();
    for (const removedControl of ["Back", "Forward", "Use the dark theme", "Search streams, outputs and views"]) {
      expect(screen.queryByRole("button", { name: removedControl }), removedControl).toBeNull();
    }
    expect(screen.queryByText("Runtime running")).toBeNull();
    expect(screen.queryByText("Tatolab 0.45.0")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Add stream/ })).toEqual([]);
    expect(screen.getByRole("button", { name: "New or import a project" }).getAttribute("data-window-navigation")).toBe("add-project-menu");
  });
});

/** The rename dialog of the mock stream shown as `displayName`, opened from its sidebar row's right-click menu. */
async function openTheRenameDialogOfTheSidebarRowOf(displayName: string): Promise<HTMLInputElement> {
  const sidebarRowLink = await waitFor(
    () => document.querySelector<HTMLElement>(`[data-sidebar-stream="${mockStreamIdOf(displayName)}"] a`) ?? expect.unreachable(`no sidebar row for ${displayName}`),
  );
  fireEvent.contextMenu(sidebarRowLink, { button: 2, clientX: 40, clientY: 40 });
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-slot="context-menu-item"][data-stream-action="rename_stream"]') ?? expect.unreachable("no Rename… in the right-click menu")));
  return waitFor(() => document.querySelector<HTMLInputElement>("[data-stream-rename-display-name]") ?? expect.unreachable("no rename dialog"));
}

describe("renaming a stream", () => {
  it("renames a stream from its sidebar row's right-click menu, the list and sidebar then showing the new name under the same id", async () => {
    await mountedWindowOverTheMock("state=running");

    const displayNameField = await openTheRenameDialogOfTheSidebarRowOf("camera");
    expect(displayNameField.value).toBe("camera");
    await waitFor(() => expect(document.activeElement).toBe(displayNameField));
    expect([displayNameField.selectionStart, displayNameField.selectionEnd]).toEqual([0, "camera".length]);
    expect(document.querySelector("[data-stream-rename-dialog] h2")?.textContent).toBe("Rename camera");
    expect(document.querySelector<HTMLButtonElement>('[data-stream-rename-action="rename"]')?.disabled).toBe(true);
    fireEvent.change(displayNameField, { target: { value: "  Desk camera " } });
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-rename-action="rename"]') ?? expect.unreachable("no Rename button"));

    await waitFor(() => expect(within(rowOf("camera")).getByRole("link", { name: "Desk camera, Running" })).toBeTruthy());
    expect(document.querySelector(`[data-sidebar-stream="${mockStreamIdOf("camera")}"]`)?.textContent).toBe("Desk camera");
    expect(document.querySelector("[data-stream-rename-display-name]")).toBeNull();
  });

  it("keeps the dialog open with the runtime's refusal in its own words", async () => {
    const refusal = "Runtime error: the record of `camera-main-018da9` could not be written: Permission denied (os error 13)";
    await mountedWindowOverTheMock("state=running", { renameStream: () => Promise.reject(refusal) });

    const displayNameField = await openTheRenameDialogOfTheSidebarRowOf("camera");
    fireEvent.change(displayNameField, { target: { value: "Desk camera" } });
    fireEvent.submit(displayNameField.closest("form") ?? expect.unreachable("no form around the field"));

    await waitFor(() => expect(document.querySelector("[data-stream-rename-dialog] [role=alert]")?.textContent).toBe(`Rename was refused: ${refusal}`));
    expect(within(rowOf("camera")).getByRole("link", { name: "camera, Running", hidden: true })).toBeTruthy();
  });

  it("leaves a rename's late answer out of a dialog opened since on another stream", async () => {
    let refuseTheFirstRename: (refusal: string) => void = () => {};
    await mountedWindowOverTheMock("state=running", {
      renameStream: () => new Promise<void>((_, reject) => (refuseTheFirstRename = reject)),
    });

    fireEvent.change(await openTheRenameDialogOfTheSidebarRowOf("camera"), { target: { value: "Desk camera" } });
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-rename-action="rename"]') ?? expect.unreachable("no Rename button"));
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-rename-action="cancel"]') ?? expect.unreachable("no Cancel button"));
    await waitFor(() => expect(document.querySelector("[data-stream-rename-display-name]")).toBeNull());
    const mainsField = await openTheRenameDialogOfTheSidebarRowOf("main");
    await act(async () => refuseTheFirstRename("Runtime error: the record of `camera-main-018da9` could not be written"));

    expect(mainsField.value).toBe("main");
    expect(document.querySelector("[data-stream-rename-dialog] [role=alert]")).toBeNull();
    expect(document.querySelector("[data-stream-rename-display-name]")).not.toBeNull();
  });

  it("renames from the stream page's menu too", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");

    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-page-header] [data-stream-action="more"]') ?? expect.unreachable("no ⋯ in the bar"));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-slot="dropdown-menu-item"][data-stream-action="rename_stream"]') ?? expect.unreachable("no Rename… in the menu")));
    const displayNameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-stream-rename-display-name]") ?? expect.unreachable("no rename dialog"));
    fireEvent.change(displayNameField, { target: { value: "Test pattern" } });
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-rename-action="rename"]') ?? expect.unreachable("no Rename button"));

    await waitFor(() => expect(document.querySelector(`[data-stream-page="${mockStreamIdOf("main")}"] [data-stream-page-header]`)?.textContent).toContain("Test pattern"));
  });

  it("tells two streams shown under one name apart by their ids, so Stop on one row stops that stream alone", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    await act(async () => backend.renameStream(mockStreamIdOf("camera"), "main"));
    await waitFor(() => expect(within(rowOf("camera")).getByRole("link", { name: "main, Running" })).toBeTruthy());

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() => expect(within(rowOf("camera")).getByRole("link", { name: "main, Stopped" })).toBeTruthy());
    expect(within(rowOf("main")).getByRole("link", { name: "main, Running" })).toBeTruthy();
  });
});

describe("a record an earlier runtime wrote", () => {
  it("is listed failed under a folder named for it, with no project path or log folder path made up for it", async () => {
    await mountedWindowOverTheMock("state=running&streams=earlier_record");

    const sidebarFolder = await waitFor(() => [...document.querySelectorAll<HTMLElement>("[data-sidebar-project-folder]")].find((folder) => folder.textContent === "From an earlier runtime") ?? expect.unreachable("no folder for the earlier runtime's record"));
    expect(sidebarFolder.getAttribute("data-sidebar-project-folder")).toBe("");
    const listSection = document.querySelector<HTMLElement>('[data-streams-list-project-folder=""]') ?? expect.unreachable("no list section for it");
    expect(listSection.getAttribute("aria-label")).toBe("From an earlier runtime");
    expect(listSection.querySelector("h2")?.textContent).toBe("From an earlier runtime");
    expect(within(listSection).getByRole("link", { name: "doorbell, Failed" })).toBeTruthy();

    fireEvent.click(within(listSection).getByRole("link", { name: "doorbell, Failed" }));
    fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Logs" })));
    await waitFor(() => expect(document.querySelector("[data-stream-logs-without-a-project='doorbell']")).not.toBeNull());
    expect(document.querySelector("[data-stream-logs-without-a-project='doorbell']")?.textContent).not.toContain(".streamlib/logs");
    expect(document.querySelector('[data-stream-action="open_stream_log_folder"]')).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-page-header] [data-stream-action="more"]') ?? expect.unreachable("no ⋯ in the bar"));
    await waitFor(() => expect(document.querySelector('[data-slot="dropdown-menu-item"][data-stream-action="rename_stream"]')).not.toBeNull());
    expect(document.querySelector('[data-stream-action^="open_"]')).toBeNull();
  });
});

/** The stream page of the mock stream shown as `displayName`, opened from its row, once its Overview shows. */
async function openTheStreamPageOf(displayName: string): Promise<HTMLElement> {
  fireEvent.click(rowOf(displayName));
  return waitFor(() => {
    const streamPage = document.querySelector<HTMLElement>(`[data-stream-page="${mockStreamIdOf(displayName)}"]`);
    if (streamPage === null) throw new Error(`no page for ${displayName}`);
    return streamPage;
  });
}

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

describe("a stream's page", () => {
  it("opens on Overview playing each exposed output, and lists its project, outputs with their links and nodes in the Details slide-out", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");

    const preview = await waitFor(() => {
      const previewFrame = document.querySelector<HTMLIFrameElement>('[data-stream-output-preview="invertingeffect/video_to_downstream"] iframe');
      if (previewFrame === null) throw new Error("no preview yet");
      return previewFrame;
    });
    expect(preview.getAttribute("src")?.startsWith("data:text/html")).toBe(true);
    expect(textOf('[data-stream-output-preview="invertingeffect/video_to_downstream"]'), "a private output carries no exposure word").not.toContain("This machine");
    expect(document.querySelector("[data-stream-details]"), "Details stays closed until asked").toBeNull();
    expect(document.querySelector("[data-dropping-links]")).toBeNull();

    await openTheOverviewDetails();

    const details = within(document.querySelector<HTMLElement>("[data-stream-details]") ?? expect.unreachable("no Details"));
    expect(details.getByText("~/streams/pattern")).toBeTruthy();
    expect(document.querySelector('[data-stream-details] [data-stream-output="invertingeffect/video_to_downstream"] [data-stream-output-preview-link]')?.textContent).toBe(preview.getAttribute("src"));
    const stepRows = [...document.querySelectorAll<HTMLElement>("[data-stream-step]")];
    expect(stepRows.map((stepRow) => stepRow.dataset.streamStep)).toEqual(["testpatternsource", "invertingeffect", "displaywindow", "brightnessmeter"]);
    expect(stepRows[1].textContent, "no origin or process words").not.toMatch(/own process|Python|in runtime|Built-in/);
    expect(within(stepRows[0]).queryByText("Running"), "every node runs, so no state beside them").toBeNull();
    expect(details.queryByText("Instance")).toBeNull();
  });

  it("plays every output a stream exposes in a tile of its own, each named with its exposure", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("camera");

    await waitFor(() => expect(document.querySelectorAll("[data-stream-output-previews] iframe")).toHaveLength(2));
    expect([...document.querySelectorAll<HTMLElement>("[data-stream-output-preview]")].map((tile) => tile.dataset.streamOutputPreview)).toEqual([
      "camerasource/video",
      "microphonesource/audio",
    ]);
    expect(textOf('[data-stream-output-preview="microphonesource/audio"]')).toContain("Public");
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
    await openTheOverviewDetails();
    expect(document.querySelector("[data-stream-step='brightnessmeter']")?.textContent).toMatch(/[\d,]+ dropped/);
    expect(document.querySelector("[data-stream-step='invertingeffect']")?.textContent).toMatch(/[\d,]+ refused/);
    expect(document.querySelector("[data-stream-step='testpatternsource']")?.textContent).not.toMatch(/dropped|refused/);
  });

  it("keeps the steps of a stream it stopped as of the last load, muted, with Start in place of the preview", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-output-preview]")).not.toBeNull());

    fireEvent.click(within(document.querySelector<HTMLElement>("[data-stream-page-header]") ?? document.body).getByRole("button", { name: /Stop/ }));

    await waitFor(() => expect(textOf("[data-nothing-to-preview]")).toContain("Stopped, so nothing to preview"));
    expect(screen.getByRole("button", { name: "Start stream" })).toBeTruthy();
    await openTheOverviewDetails();
    expect(textOf("[data-stream-details]")).toContain("Nodes as of the last load");
  });

  it("shows a failed stream's reason in the runtime's words and queues a retry from the bar, the banner offering no second Retry", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("lobby-recorder");

    const banner = document.querySelector<HTMLElement>("[data-failed-stream-banner]");
    expect(banner?.textContent).toContain("Failed — the stream's CameraSource could not open camera 0x1420000");
    expect(textOf("[data-nothing-to-preview]")).toContain("Not loaded, so nothing to preview");
    await openTheOverviewDetails();
    expect(textOf("[data-stream-details]")).toContain("Its nodes show here once it is loaded.");

    expect(within(banner ?? document.body).queryByRole("button")).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-stream-page-header] [data-stream-action="start_stream"]') ?? expect.unreachable("no Retry in the bar"));

    await waitFor(() => expect(textOf("[data-stream-page-header] [role=status]")).toMatch(/^Preparing · /));
  });

  it("shows the graph document as the runtime wrote it in Inspect, raw or as a tree, with no outline beside it", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Inspect" })));

    await waitFor(() => expect(document.querySelector("[data-graph-document-view='raw']")).not.toBeNull());
    expect(textOf("[data-graph-document-view='raw']")).toContain('"stream": "pattern-main-645dbe"');
    expect(screen.queryByRole("complementary", { name: "Graph document outline" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    expect(document.querySelector("[data-graph-document-view='tree']")?.textContent).toContain("machine:");
  });

  it("copies each exposed output's preview link, the runtime's loopback preview page for it", async () => {
    const copiedTexts: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void copiedTexts.push(text) } });
    const { backend } = await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("camera");
    const servedWatchPageUrl = (await backend.describeStreamGraph(mockStreamIdOf("camera"))).exposed.find((port) => port.node === "camerasource" && port.port === "video")?.watch_page_url;

    const videoOutput = await waitFor(() => document.querySelector<HTMLElement>('[data-stream-output-preview="camerasource/video"]') ?? expect.unreachable("no video output playing"));
    fireEvent.click(within(videoOutput).getByRole("button", { name: "Copy preview link" }));

    await waitFor(() => expect(copiedTexts).toHaveLength(1));
    expect(servedWatchPageUrl).toBeTruthy();
    expect(copiedTexts).toEqual([servedWatchPageUrl]);
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("asks before removing the stream's project from its bar's menu, and goes back to the list once it is gone", async () => {
    await mountedWindowOverTheMock("state=running");
    const streamPage = await openTheStreamPageOf("pattern-two");

    fireEvent.click(within(streamPage).getByRole("button", { name: "More for pattern-two" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove project…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove the project pattern?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove project" }));

    await waitFor(() => expect(document.querySelector("[data-streams-list-page]")).not.toBeNull(), { timeout: 3000 });
    expect(document.querySelector(`[data-stream-row="${mockStreamIdOf("pattern-two")}"]`)).toBeNull();
  });

  it("opens the stream's project and a terminal in it, showing what refused either in its own words", async () => {
    const openedProjects: string[] = [];
    await mountedWindowOverTheMock("state=running&platform=linux&terminal=missing", {
      openStreamProjectFolder: async (streamId) => {
        openedProjects.push(streamId);
      },
    });
    await openTheStreamPageOf("camera");

    fireEvent.click(screen.getByRole("button", { name: "More for camera" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open project" }));
    fireEvent.click(screen.getByRole("button", { name: "More for camera" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open a terminal in the project" }));

    await waitFor(() =>
      expect(textOf("[data-stream-page-header] [role=alert]")).toBe(
        "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.",
      ),
    );
    expect(openedProjects).toEqual([mockStreamIdOf("camera")]);
  });

  it("focuses the log search with ⌘F, from Overview by way of Logs, and on Logs where it is", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-output-preview]")).not.toBeNull());
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

/** The Logs tab of the mock stream shown as `displayName`, opened from its page's header. */
async function openTheLogsOf(displayName: string): Promise<void> {
  await openTheStreamPageOf(displayName);
  const streamId = mockStreamIdOf(displayName);
  fireEvent.click(await waitFor(() => screen.getByRole("link", { name: "Logs" })));
  await waitFor(() => expect(document.querySelector(`[data-stream-logs-page="${streamId}"], [data-stream-logs-without-a-project="${streamId}"]`)).not.toBeNull());
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
    const servedPage = await backend.readProjectLogRecords("/Users/jonathanf/streams/pattern", { stream: mockStreamIdOf("main"), action: null }, null);
    expect(document.querySelector("[data-stream-log-records] [data-stream-log-record]")?.textContent).toContain(servedPage.records[0]?.message);
    const loadingRow = logRowOf("Loading the stream `pattern-main-645dbe`");
    expect(loadingRow.textContent).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}INFOruntimeLoading the stream `pattern-main-645dbe`/);
    expect(logRowOf("mean=127.5").textContent).toMatch(/INFObrightnessmeterbrightness {2}height=720 {2}mean=127.5 {2}width=1280$/);
    const rowCountBefore = shownLogMessages().length;

    await waitFor(() => expect(shownLogMessages().length).toBeGreaterThan(rowCountBefore), { timeout: 4000 });
  });

  it("opens a selected record in full, with its JSON record as the runtime wrote it, and goes to its node on Graph", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");
    const brightnessRow = await waitFor(() => logRowOf("mean=127.5"));
    expect(document.querySelector("[data-stream-log-record-details]"), "no panel until a line is selected").toBeNull();

    fireEvent.mouseDown(brightnessRow);

    const details = within(screen.getByRole("complementary", { name: "Selected record" }));
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
    expect(screen.getByRole("button", { name: "Nodes shown: brightnessmeter" })).toBeTruthy();

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
      openStreamLogFolder: async (streamId) => {
        openedLogFolders.push(streamId);
      },
    });
    await openTheLogsOf("main");

    await waitFor(() => expect(textOf("[data-stream-log-earlier-records]")).toBe("Earlier records are in ~/streams/pattern/.streamlib/logs/Open"));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(openedLogFolders).toEqual([mockStreamIdOf("main")]);
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

    fireEvent.click(screen.getByRole("button", { name: "Nodes shown: brightnessmeter" }));
    const showAllSteps = await waitFor(() => screen.getByRole("menuitem", { name: "Show all nodes" }));
    expect(showAllSteps.hasAttribute("data-disabled")).toBe(false);
    fireEvent.click(showAllSteps);

    await waitFor(() => expect(screen.getByRole("button", { name: "Nodes shown: All nodes" })).toBeTruthy());
    expect(shownLogMessages().some((row) => row.includes("runtime"))).toBe(true);
  });

  it("says why it cannot read new records in the runtime's words, keeping the rows it has", async () => {
    const refusal = "logs failed: Resource not found: this runtime holds no stream of the project in /Users/jonathanf/streams/pattern";
    const answeringBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running")));
    let isRefusingReads = false;
    await mountedWindowOverTheMock("state=running", {
      readProjectLogRecords: async (projectDirectory, narrowing, after) => {
        if (isRefusingReads) throw refusal;
        return answeringBackend.readProjectLogRecords(projectDirectory, narrowing, after);
      },
    });
    await openTheLogsOf("main");
    await waitFor(() => expect(shownLogMessages().length).toBeGreaterThan(0));
    isRefusingReads = true;

    await waitFor(() => expect(textOf("[data-stream-log-read-refusal]")).toBe(`Couldn't read new records, trying again: ${refusal}`), { timeout: 3000 });
    expect(logRowOf("Loading the stream `pattern-main-645dbe`")).toBeTruthy();
  });

  it("opens a failed stream on the records of the action that failed it, its error among them, and shows every action again from the action menu", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("lobby-recorder");

    await waitFor(() => expect(screen.getByRole("button", { name: /^Actions shown: Action at \d\d:\d\d:\d\d$/ })).toBeTruthy());
    await waitFor(() => expect(shownLogMessages().some((row) => row.includes("ERROR") && row.includes("could not open camera"))).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: /^Actions shown: / }));
    fireEvent.click(await waitFor(() => screen.getByRole("menuitemradio", { name: "All actions" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Actions shown: All actions" })).toBeTruthy());
  });

  it("shows a stopped stream's records too, and the whole project's records from the scope switch", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheLogsOf("main");
    await waitFor(() => expect(shownLogMessages().length).toBeGreaterThan(3));
    expect(shownLogMessages().every((row) => !row.includes("recorder"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Whole project" }));

    await waitFor(() => expect(document.querySelector("[data-stream-logs-page]")?.getAttribute("data-stream-log-scope-shown")).toBe("whole_project"));
    await waitFor(() => expect(document.querySelectorAll("[data-stream-log-action-divider]").length).toBeGreaterThan(1));
  });
});

/** The Graph tab of the mock stream shown as `displayName`, opened from its page's header, once its step cards show. */
async function openTheGraphOf(displayName: string): Promise<void> {
  await openTheStreamPageOf(displayName);
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
    expect(within(stepCardOf("testpatternsource")).queryByText("Built-in")).toBeNull();
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
    expect(hoverPreview.textContent).toContain("jonathanf-macbook/pattern-main-645dbe/invertingeffect/video_to_downstream");
    const describedHoveredPort = () => document.getElementById(outputPortOf("invertingeffect", "video_to_downstream").getAttribute("aria-describedby") ?? "");
    expect(describedHoveredPort()?.textContent).toBe("jonathanf-macbook/pattern-main-645dbe/invertingeffect/video_to_downstream");

    fireEvent.click(outputPortOf("invertingeffect", "video_to_downstream"));

    await waitFor(() => expect(document.querySelector("[data-pinned-output-preview='jonathanf-macbook/pattern-main-645dbe/invertingeffect/video_to_downstream'] iframe")).not.toBeNull());
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

  it("shows the selected node's type, config and outputs, and no inspector with nothing selected", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("main");
    await waitFor(() => stepCardOf("testpatternsource"));
    expect(document.querySelector("[data-stream-graph-inspector]")).toBeNull();

    fireEvent.click(stepCardOf("testpatternsource"));

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='step']")).not.toBeNull());
    const inspector = within(screen.getByRole("complementary", { name: "Inspector" }));
    expect(inspector.getByText("tatolab.stream:TestPatternSource")).toBeTruthy();
    expect(inspector.queryByText("Built-in")).toBeNull();
    expect(inspector.queryByText("In the runtime")).toBeNull();
    expect(textOf("[data-stream-graph-step-config]")).toBe("width1280height720fps30");
    expect(textOf("[data-stream-graph-output-exposure='video']"), "an internal output carries no exposure word").toBe("video");
    expect(stepCardOf("testpatternsource").dataset.selected).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector]")).toBeNull());
  });

  it("opens with the output Search's Watch asked for pinned, with the Watch flag on", async () => {
    await mountedWindowOverTheMock("state=running", {}, { watchExposedOutput: true });
    await openTheStreamPageOf("main");
    await waitFor(() => expect(document.querySelector("[data-stream-output-preview]")).not.toBeNull());

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const searchInput = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(".search-overlay[open] .search-input");
      if (input === null) throw new Error("no search yet");
      return input;
    });
    fireEvent.input(searchInput, { target: { value: "watch jonathanf-macbook/pattern-main-645dbe/invertingeffect" } });
    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-pinned-output-preview='jonathanf-macbook/pattern-main-645dbe/invertingeffect/video_to_downstream']")).not.toBeNull());
  });

  it("waits for a restarted stream's new graph instead of drawing the last load's", async () => {
    let areGraphReadsHeld = false;
    const answeringBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running")));
    await mountedWindowOverTheMock("state=running", {
      describeStreamGraph: (streamId) => (areGraphReadsHeld ? new Promise(() => {}) : answeringBackend.describeStreamGraph(streamId)),
    });
    await openTheGraphOf("main");
    // Stopping redirects Graph to Overview, which draws the page, its header included, anew.
    const streamPageHeader = () => within(document.querySelector<HTMLElement>("[data-stream-page-header]") ?? document.body);
    areGraphReadsHeld = true;

    fireEvent.click(streamPageHeader().getByRole("button", { name: /Stop/ }));
    fireEvent.click(await waitFor(() => streamPageHeader().getByRole("button", { name: /Start/ }), { timeout: 3000 }));
    await waitFor(() => expect(streamPageHeader().getByRole("button", { name: /Stop/ })).toBeTruthy(), { timeout: 3000 });
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
    expect(cardsNode.getAttribute("aria-label")).toBe("testpatternsource, Running");
    const cardsDescription = document.getElementById(cardsNode.getAttribute("aria-describedby") ?? "");
    expect(cardsDescription?.textContent).toBe("Press Enter or Space to inspect this node. Escape selects nothing.");

    cardsNode.focus();
    fireEvent.keyDown(cardsNode, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-stream-graph-inspector='step']")).not.toBeNull());
    expect(stepCardOf("testpatternsource").dataset.selected).toBe("true");
  });

  it("draws a link's source in another stream as a dimmed card that does not select", async () => {
    await mountedWindowOverTheMock("state=running");
    await openTheGraphOf("recorder");

    const sourceInMain = await waitFor(() => stepCardOf(`${mockStreamIdOf("main")}/invertingeffect`));
    expect(sourceInMain.dataset.inAnotherStream).toBe("true");
    expect(sourceInMain.textContent).toContain("Another stream");
    expect(stepCardOf("mp4writer").querySelector("[data-step-input-port='video']")).not.toBeNull();

    fireEvent.click(sourceInMain);

    expect(document.querySelector("[data-stream-graph-inspector]")).toBeNull();
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

/** Overview's Details slide-out, opened from the stream's bar. */
async function openTheOverviewDetails(): Promise<void> {
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-stream-page-header] [data-stream-action="details"]') ?? expect.unreachable("no Details toggle")));
  await waitFor(() => expect(document.querySelector("[data-stream-details]")).not.toBeNull());
}

/** The add-stream dialog opened from the sidebar's + menu on New project. */
async function openTheAddStreamDialogOnNewProject(): Promise<void> {
  fireEvent.click(document.querySelector<HTMLElement>('[data-window-navigation="add-project-menu"]') ?? expect.unreachable("no + menu in the sidebar"));
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-window-navigation="new-project"]') ?? expect.unreachable("no New project in the + menu")));
}

/** The add-stream dialog closed by its close button. */
function closeTheAddStreamDialog(): void {
  fireEvent.click(document.querySelector<HTMLElement>("[data-form-dialog-close]") ?? expect.unreachable("no open dialog to close"));
}

/** The add-stream dialog opened from the sidebar's + menu on Import project. */
async function openAddStream(): Promise<void> {
  fireEvent.click(document.querySelector<HTMLElement>('[data-window-navigation="add-project-menu"]') ?? expect.unreachable("no + menu in the sidebar"));
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-window-navigation="add-stream"]') ?? expect.unreachable("no Import project in the + menu")));
}

/** Long enough for the mock runtime to load a project that has its `.venv`. */
const MOCK_LOAD_WAIT = { timeout: 6000 };
/** Long enough for the mock runtime to make a project's `.venv`, then load it. */
const MOCK_LOAD_AFTER_MAKING_THE_VENV_WAIT = { timeout: 10_000 };

describe("New project and Import project", () => {
  it("imports a chosen folder with two streams, following the load through its steps, then lists both with the failed one's reason", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running&add_folder=several");
    await openAddStream();
    expect((await addStreamControl("import")).hasAttribute("disabled")).toBe(true);
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/code/doorways"));
    expect(screen.queryByRole("textbox", { name: "Stream name" })).toBeNull();

    fireEvent.click(await addStreamControl("import"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="following"] h2')?.textContent).toBe("Importing doorways"));
    expect(document.querySelector("[data-add-stream-load-output]")?.textContent).toContain("run_project  /Users/jonathanf/code/doorways");

    await waitFor(() => expect(document.querySelector('[data-add-stream-ending="done"] h2')?.textContent).toBe("doorways is running, 1 of 2 streams failed"), MOCK_LOAD_WAIT);
    const backDoor = document.querySelector<HTMLElement>(`[data-add-stream-taken-in="${mockStreamIdOfTheProjectStream("back_door", "/Users/jonathanf/code/doorways")}"]`) ?? expect.unreachable("no back_door row");
    expect(backDoor.getAttribute("data-add-stream-taken-in-state")).toBe("Failed");
    expect(backDoor.textContent).toMatch(/Open logs/);
    expect(document.querySelector(`[data-add-stream-taken-in="${mockStreamIdOfTheProjectStream("front_door", "/Users/jonathanf/code/doorways")}"]`)?.getAttribute("data-add-stream-taken-in-state")).toBe("Running");

    fireEvent.click(backDoor.querySelector<HTMLElement>('[data-add-stream-action="open_logs"]') ?? expect.unreachable("no Open logs"));
    await waitFor(() => expect(document.querySelector(`[data-stream-page="${mockStreamIdOfTheProjectStream("back_door", "/Users/jonathanf/code/doorways")}"]`)).not.toBeNull());
  });

  it("creates the sample project with Create alone, in a folder the runtime draws, through making its environment to running", { timeout: 20_000 }, async () => {
    await mountedWindowOverTheMock("state=empty");
    fireEvent.click(screen.getByRole("button", { name: /Create the sample project/ }));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="new_project"]')?.textContent).toContain("A new folder under ~/streams"));
    expect(document.querySelector('[data-add-stream-action="import"]')).toBeNull();

    fireEvent.click(await addStreamControl("create"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="following"] h2')?.textContent).toBe("Creating kind-butte"));
    expect(document.querySelector("[data-add-stream-load-output]")?.textContent).toContain("create_project  (a folder under ~/streams)");
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="following"]')?.getAttribute("data-add-stream-load-step")).toBe("making_the_venv"), MOCK_LOAD_WAIT);
    await waitFor(() => expect(document.querySelector('[data-add-stream-ending="done"] h2')?.textContent).toBe("kind-butte is running"), MOCK_LOAD_AFTER_MAKING_THE_VENV_WAIT);
    fireEvent.click(await addStreamControl("open_the_stream"));
    await waitFor(() => expect(document.querySelector(`[data-stream-page="${mockStreamIdOfTheProjectStream("main", "/Users/jonathanf/streams/kind-butte")}"]`)).not.toBeNull());
  });

  it("shows a failed load in the runtime's own words and keeps the form usable: a create into a folder holding a project", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running&add_new_folder=existing");
    await openTheAddStreamDialogOnNewProject();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/code/heat-map"));
    fireEvent.click(await addStreamControl("create"));

    await waitFor(
      () =>
        expect(document.querySelector("[data-add-stream-refusal]")?.textContent).toMatch(
          /^Creating the project failed: Invalid configuration: `\/Users\/jonathanf\/code\/heat-map` already has pyproject.toml, stream.py, and a new project's files would overwrite it/,
        ),
      MOCK_LOAD_WAIT,
    );
    expect((await addStreamControl("create")).hasAttribute("disabled")).toBe(false);
    expect((await addStreamControl("choose_folder")).hasAttribute("disabled")).toBe(false);
  });

  it("says in the dialog why Import can't be pressed while the runtime is down", async () => {
    const { backend, showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=running");
    await openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/code/heat-map"));
    const statusBefore = await backend.getTatolabStatus();

    await showStatusAsTheBackendWould({ ...statusBefore, runtime_state: "stopped", streams: null });

    await waitFor(() => expect(document.querySelector("[data-add-stream-blocker]")?.textContent).toBe("The runtime isn't running, so it can't add a project."));
    expect((await addStreamControl("import")).hasAttribute("disabled")).toBe(true);
  });

  it("keeps a load under way after the dialog closes, shows its step in a notice, says what it came to, and View reopens it", { timeout: 15_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openAddStream();
    fireEvent.click(await addStreamControl("choose_folder"));
    await waitFor(() => expect(document.querySelector("[data-add-stream-folder]")?.getAttribute("data-add-stream-folder")).toBe("/Users/jonathanf/code/heat-map"));
    fireEvent.click(await addStreamControl("import"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="following"]')).not.toBeNull());

    closeTheAddStreamDialog();

    const followingNotice = await waitFor(() => document.querySelector<HTMLElement>('[data-add-stream-run-notice="following"]') ?? expect.unreachable("no notice yet"));
    expect(followingNotice.textContent).toContain("Importing heat-map");
    await openTheAddStreamDialogOnNewProject();
    await waitFor(() => expect(document.querySelector('[data-add-stream-step="following"] h2')?.textContent).toBe("Importing heat-map"));
    closeTheAddStreamDialog();

    const endedNotice = await waitFor(() => document.querySelector<HTMLElement>('[data-add-stream-run-notice="ended"]') ?? expect.unreachable("no notice yet"), MOCK_LOAD_WAIT);
    expect(endedNotice.textContent).toContain("heat-map is running");
    expect(endedNotice.textContent).toContain("heat_map: Running");
    expect(document.querySelector("[data-streams-list-page]")).not.toBeNull();

    fireEvent.click(endedNotice.querySelector<HTMLElement>('[data-window-notice-action="view"]') ?? expect.unreachable("no View"));
    await waitFor(() => expect(document.querySelector('[data-add-stream-ending="done"]')).not.toBeNull());
    expect(document.querySelector("[data-add-stream-run-notice]")).toBeNull();

    closeTheAddStreamDialog();
    await openAddStream();
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

describe("the sidebar's project folders", () => {
  it("closes a folder to hide its streams, saying when it holds a failed one, and opens it again", async () => {
    await mountedWindowOverTheMock("state=running");
    const sidebar = within(screen.getByRole("navigation", { name: "Tatolab" }));
    const folderRow =
      [...document.querySelectorAll<HTMLElement>("[data-sidebar-project-folder]")].find((row) => row.parentElement?.textContent?.includes("lobby-recorder")) ??
      expect.unreachable("no folder holds lobby-recorder");
    expect(folderRow.getAttribute("aria-expanded")).toBe("true");
    expect(folderRow.textContent).not.toContain("holds a failed stream");

    fireEvent.click(folderRow);

    expect(folderRow.getAttribute("aria-expanded")).toBe("false");
    expect(sidebar.queryByRole("link", { name: "lobby-recorder, Failed" })).toBeNull();
    expect(folderRow.textContent).toContain(", holds a failed stream");
    expect(sidebar.getByRole("link", { name: "camera, Running" })).toBeTruthy();

    fireEvent.click(folderRow);

    expect(sidebar.getByRole("link", { name: "lobby-recorder, Failed" })).toBeTruthy();
  });
});

describe("Settings", () => {
  it("opens on General, listing every section under its group beside it and leaving the sidebar as it was", async () => {
    await mountedWindowOverTheMock("state=running");
    fireEvent.click(document.querySelector<HTMLElement>(`[data-window-navigation="settings"]`) ?? expect.unreachable("no Settings"));

    await waitFor(() => expect(document.querySelector(`[data-settings-page="general"]`)).not.toBeNull());
    const sectionList = within(screen.getByRole("navigation", { name: "Settings" }));
    expect(sectionList.getByRole("link", { name: "General" }).getAttribute("aria-current")).toBe("page");
    expect(sectionList.getAllByRole("link").map((sectionLink) => sectionLink.textContent)).toEqual(["General", "Appearance", "Runtime", "Relays", "Command line", "About"]);
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

/** Settings › Relays' row for `relayId`. */
function relayRowOf(relayId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-relay-row="${relayId}"]`) ?? expect.unreachable(`no row for the relay ${relayId}`);
}

/** The relay dialog open now. */
function openRelayDialog(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-relay-dialog]") ?? expect.unreachable("no relay dialog is open");
}

/** The add-relay dialog for `adapterKind`, opened from the Added relays group's + menu. */
async function openTheAddRelayDialogFor(adapterKind: string): Promise<HTMLElement> {
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-relay-action="add-menu"]') ?? expect.unreachable("no + menu")));
  fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-relay-adapter-choice="${adapterKind}"]`) ?? expect.unreachable(`no ${adapterKind} choice`)));
  return waitFor(() => document.querySelector<HTMLElement>(`[data-relay-dialog="add:${adapterKind}"]`) ?? expect.unreachable(`no add dialog for ${adapterKind}`));
}

function typeIntoTheRelaySetting(settingName: string, text: string): void {
  fireEvent.change(document.querySelector<HTMLInputElement>(`[data-relay-setting-field="${settingName}"]`) ?? expect.unreachable(`no field for ${settingName}`), { target: { value: text } });
}

describe("Settings › Relays", () => {
  it("shows the local relay's two listeners first with their ports and state, never removable, and the relays added after them", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("relays");

    await waitFor(() => expect(relayRowOf("local-loopback").textContent).toContain("Port 4443"));
    expect(relayRowOf("local-loopback").textContent).toContain("Loopback");
    expect(relayRowOf("local-loopback").textContent).toContain("Joined");
    expect(relayRowOf("local-every-interface").textContent).toContain("Every interface");
    expect(relayRowOf("local-every-interface").textContent).toContain("Port 4445");
    expect(document.querySelector('[data-relays-group="local"] [data-relay-action="more"]')).toBeNull();
    expect(relayRowOf("moqpro-1").textContent).toContain("Project ID pb1studio · Signing key set");
    expect(within(relayRowOf("moqpro-1")).getByRole("status").textContent).toBe("Why: the relay closed the session: unauthorized");
    expect(relayRowOf("cloudflare-1").textContent).toContain("Relay URL set");
  });

  it("names every relay's adapter by the name its catalog serves, its logo in one square slot, in the rows, the + menu and the form's heading", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("moqpro-1")).toBeTruthy());

    expect(relayRowOf("moqpro-1").querySelector("[data-relay-adapter-name]")?.textContent).toBe("moq.pro");
    expect(relayRowOf("cloudflare-1").querySelector("[data-relay-adapter-name]")?.textContent).toBe("Cloudflare");
    expect(relayRowOf("cloudflare-1").textContent).toContain("cloudflare-1");
    const logoSlotsOfTheRows = ["local-loopback", "local-every-interface", "cloudflare-1", "moqpro-1"].map(
      (relayId) => relayRowOf(relayId).querySelector('[data-served-logo-slot="in_a_row"]') ?? expect.unreachable(`no logo slot in ${relayId}`),
    );
    for (const logoSlot of logoSlotsOfTheRows) {
      expect(logoSlot.querySelector("img")?.getAttribute("src")?.startsWith("data:image/svg+xml;base64,")).toBe(true);
      expect(logoSlot.querySelector("img")?.getAttribute("alt")).toBe("");
      expect(logoSlot.querySelector("svg")).toBeNull();
    }

    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-action="add-menu"]') ?? expect.unreachable("no + menu"));
    await waitFor(() => expect(document.querySelector('[data-relay-adapter-choice="moqpro"]')).not.toBeNull());
    expect([...document.querySelectorAll("[data-relay-adapter-choice]")].map((choice) => choice.textContent)).toEqual(["Cloudflare", "moq.pro"]);
    expect(document.querySelectorAll('[data-relay-adapter-choice] [data-served-logo-slot="in_a_menu"] img')).toHaveLength(2);
    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-adapter-choice="cloudflare"]') ?? expect.unreachable("no cloudflare choice"));
    const dialog = await waitFor(() => document.querySelector<HTMLElement>('[data-relay-dialog="add:cloudflare"]') ?? expect.unreachable("no add dialog"));

    expect(dialog.querySelector("[data-relay-dialog-adapter-name]")?.textContent).toBe("Cloudflare");
    expect(dialog.querySelector('[data-served-logo-slot="in_a_row"] img')).not.toBeNull();
  });

  it("names every adapter by its kind and every added relay by its id alone, with no logo slot, over a runtime whose catalog serves no names or logos", async () => {
    await mountedWindowOverTheMock("state=running&adapter_names=none");
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("moqpro-1")).toBeTruthy());

    expect(relayRowOf("moqpro-1").querySelector("[data-relay-adapter-name]")).toBeNull();
    expect(relayRowOf("moqpro-1").querySelector("code")?.textContent).toBe("moqpro-1");
    expect(document.querySelector("[data-served-logo-slot]")).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-action="add-menu"]') ?? expect.unreachable("no + menu"));
    await waitFor(() => expect(document.querySelector('[data-relay-adapter-choice="moqpro"]')).not.toBeNull());
    expect([...document.querySelectorAll("[data-relay-adapter-choice]")].map((choice) => choice.textContent)).toEqual(["cloudflare", "moqpro"]);
    expect(document.querySelector("[data-served-logo-slot]")).toBeNull();
  });

  it("offers to add every adapter but the local relay's, through a form built from its settings, and lists the relay added with its secret set", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=local");
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("local-loopback")).toBeTruthy());

    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-action="add-menu"]') ?? expect.unreachable("no + menu"));
    await waitFor(() => expect(document.querySelector('[data-relay-adapter-choice="moqpro"]')).not.toBeNull());
    expect([...document.querySelectorAll("[data-relay-adapter-choice]")].map((choice) => choice.getAttribute("data-relay-adapter-choice"))).toEqual(["cloudflare", "moqpro"]);
    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-adapter-choice="moqpro"]') ?? expect.unreachable("no moqpro choice"));
    const dialog = await waitFor(() => document.querySelector<HTMLElement>('[data-relay-dialog="add:moqpro"]') ?? expect.unreachable("no add dialog"));

    expect([...dialog.querySelectorAll("[data-relay-setting]")].map((row) => row.getAttribute("data-relay-setting"))).toEqual(["project_id", "signing_key"]);
    expect(dialog.querySelector<HTMLInputElement>('[data-relay-setting-field="project_id"]')?.type).toBe("text");
    expect(dialog.querySelector('[data-relay-setting-field="signing_key"]')?.tagName).toBe("TEXTAREA");
    expect(dialog.querySelector('[data-relay-setting-field="signing_key"]')?.className).toContain("[-webkit-text-security:disc]");
    expect(dialog.querySelector('[data-relay-setting="signing_key"] [data-relay-action="choose-file"]')?.textContent).toBe("Choose file…");
    expect(dialog.querySelector("[data-relay-additional-options]")).toBeNull();
    const addButton = () => openRelayDialog().querySelector<HTMLButtonElement>('[data-relay-action="add"]') ?? expect.unreachable("no Add relay");
    expect(addButton().disabled).toBe(true);

    typeIntoTheRelaySetting("project_id", "pb2studio");
    typeIntoTheRelaySetting("signing_key", '{"kty":"OKP","d":"typed-in-the-test"}');
    expect(addButton().disabled).toBe(false);
    fireEvent.click(addButton());

    await waitFor(() => expect(document.querySelector("[data-relay-dialog]")).toBeNull(), { timeout: 3_000 });
    await waitFor(() => expect(relayRowOf("moqpro-1").textContent).toContain("Project ID pb2studio · Signing key set"));
    expect(document.body.innerHTML).not.toContain("typed-in-the-test");
  });

  it("adds a moq.pro relay with its signing key chosen as a file, naming the file and never showing its text", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=local");
    await openSettingsOn("relays");
    await openTheAddRelayDialogFor("moqpro");

    typeIntoTheRelaySetting("project_id", "pb2studio");
    const fileInput = openRelayDialog().querySelector<HTMLInputElement>('[data-relay-setting="signing_key"] input[type="file"]') ?? expect.unreachable("no file input");
    const chosenFile = new File(['{"kty":"OKP","d":"chosen-in-the-test"}'], "pb2studio.jwk");
    Object.defineProperty(fileInput, "files", { value: [chosenFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(openRelayDialog().querySelector("[data-relay-chosen-file]")?.textContent).toBe("From pb2studio.jwk"));
    expect(fileInput.value).toBe("");
    expect(openRelayDialog().querySelector<HTMLTextAreaElement>('[data-relay-setting-field="signing_key"]')?.value).toBe('{"kty":"OKP","d":"chosen-in-the-test"}');
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="add"]') ?? expect.unreachable("no Add relay"));

    await waitFor(() => expect(document.querySelector("[data-relay-dialog]")).toBeNull(), { timeout: 3_000 });
    await waitFor(() => expect(relayRowOf("moqpro-1").textContent).toContain("Project ID pb2studio · Signing key set"));
    expect(document.body.innerHTML).not.toContain("chosen-in-the-test");
  });

  it("draws each setting by its declared type and sends what each control holds", { timeout: 8_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=every-field-type");
    await openSettingsOn("relays");
    const dialog = await openTheAddRelayDialogFor("every-field-type");

    const settingField = (settingName: string) => dialog.querySelector<HTMLElement>(`[data-relay-setting-field="${settingName}"]`) ?? expect.unreachable(`no control for ${settingName}`);
    expect(settingField("api_key").getAttribute("type")).toBe("password");
    expect(settingField("certificate").tagName).toBe("TEXTAREA");
    expect(settingField("port").getAttribute("inputmode")).toBe("decimal");
    expect(settingField("port")).toHaveProperty("value", "4446");
    expect(settingField("records").getAttribute("role")).toBe("switch");
    expect(settingField("records").getAttribute("aria-labelledby")).toBe("relay-setting-records-label");
    expect(settingField("region").textContent).toBe("Choose…");
    expect(settingField("fallback_region").textContent).toBe("None");
    expect(settingField("relay_url").getAttribute("inputmode")).toBe("url");
    expect(settingField("tags").querySelectorAll("input")).toHaveLength(0);
    expect(openRelayDialog().querySelector<HTMLButtonElement>('[data-relay-action="add"]')?.disabled).toBe(true);

    typeIntoTheRelaySetting("relay_url", "https://relay.example");
    fireEvent.click(settingField("records"));
    fireEvent.click(dialog.querySelector<HTMLElement>('[data-relay-setting="tags"] [data-relay-action="add-value"]') ?? expect.unreachable("no Add value"));
    const tagField = await waitFor(() => settingField("tags").querySelector<HTMLInputElement>("input") ?? expect.unreachable("no tag field"));
    fireEvent.change(tagField, { target: { value: "studio" } });
    fireEvent.click(settingField("region"));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-relay-setting-choice="option:eu"]') ?? expect.unreachable("no eu choice")));

    await waitFor(() => expect(settingField("region").textContent).toBe("eu"));
    expect(settingField("records").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="add"]') ?? expect.unreachable("no Add relay"));

    await waitFor(() => expect(document.querySelector("[data-relay-dialog]")).toBeNull(), { timeout: 3_000 });
    await waitFor(() => expect(relayRowOf("every-field-type-2").textContent).toContain("Records true · Region eu · Relay URL https://relay.example · Tags studio"));
  });

  it("moves focus to the switch, the menu or the list Use default returns to its default", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=every-field-type");
    await openSettingsOn("relays");
    fireEvent.click(await waitFor(() => relayRowOf("every-field-type-1").querySelector<HTMLElement>('[data-relay-action="configure"]') ?? expect.unreachable("no Configure…")));
    await waitFor(() => expect(document.querySelector('[data-relay-dialog="configure:every-field-type-1"]')).not.toBeNull());
    const useDefaultOf = (settingName: string) =>
      openRelayDialog().querySelector<HTMLElement>(`[data-relay-setting="${settingName}"] [data-relay-action="use-default"]`) ?? expect.unreachable(`no Use default for ${settingName}`);

    for (const settingName of ["records", "fallback_region", "tags"]) {
      fireEvent.click(useDefaultOf(settingName));
      expect(document.activeElement?.getAttribute("data-relay-setting-field")).toBe(settingName);
    }
  });

  it("moves focus to a value added, to the value before one removed, and to the list once none is left", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=every-field-type");
    await openSettingsOn("relays");
    await openTheAddRelayDialogFor("every-field-type");
    const tagsRow = () => openRelayDialog().querySelector<HTMLElement>('[data-relay-setting="tags"]') ?? expect.unreachable("no Tags row");
    const removeButtons = () => [...tagsRow().querySelectorAll<HTMLElement>('[data-relay-action="remove-value"]')];

    for (const addedIndex of [0, 1]) {
      fireEvent.click(tagsRow().querySelector<HTMLElement>('[data-relay-action="add-value"]') ?? expect.unreachable("no Add value"));
      await waitFor(() => expect(document.activeElement?.id).toBe(`relay-setting-tags-${addedIndex}`));
    }
    fireEvent.click(removeButtons()[1] ?? expect.unreachable("no second remove"));
    await waitFor(() => expect(document.activeElement?.id).toBe("relay-setting-tags-0"));
    fireEvent.click(removeButtons()[0] ?? expect.unreachable("no first remove"));
    await waitFor(() => expect(document.activeElement?.id).toBe("relay-setting-tags"));
  });

  it("forgets a file it could not read once the setting is edited", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=every-field-type");
    await openSettingsOn("relays");
    fireEvent.click(await waitFor(() => relayRowOf("every-field-type-1").querySelector<HTMLElement>('[data-relay-action="configure"]') ?? expect.unreachable("no Configure…")));
    await waitFor(() => expect(document.querySelector('[data-relay-dialog="configure:every-field-type-1"]')).not.toBeNull());
    const certificateRow = () => openRelayDialog().querySelector<HTMLElement>('[data-relay-setting="certificate"]') ?? expect.unreachable("no Certificate row");
    const fileInput = certificateRow().querySelector<HTMLInputElement>('input[type="file"]') ?? expect.unreachable("no file input");
    const unreadableFile = new File(["unread"], "moved.pem");
    Object.defineProperty(unreadableFile, "text", { value: () => Promise.reject(new Error("the file was moved")) });
    Object.defineProperty(fileInput, "files", { value: [unreadableFile], configurable: true });

    fireEvent.change(fileInput);
    await waitFor(() => expect(certificateRow().textContent).toContain("The file couldn't be read: the file was moved"));
    typeIntoTheRelaySetting("certificate", "-----BEGIN CERTIFICATE-----");

    expect(certificateRow().textContent).not.toContain("couldn't be read");
  });

  it("forgets a file it could not read once Use default returns the setting to its default", { timeout: 6_000 }, async () => {
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&relays=every-field-type")));
    await mountedWindowOverTheMock("state=running&relays=every-field-type", {
      describeRelays: async () => {
        const described = await mockBackend.describeRelays();
        return {
          ...described,
          relays: described.relays.map((relay) =>
            relay.relay_id === "every-field-type-1" ? { ...relay, settings: { ...relay.settings, certificate: "-----BEGIN CERTIFICATE-----" } } : relay,
          ),
        };
      },
    });
    await openSettingsOn("relays");
    fireEvent.click(await waitFor(() => relayRowOf("every-field-type-1").querySelector<HTMLElement>('[data-relay-action="configure"]') ?? expect.unreachable("no Configure…")));
    await waitFor(() => expect(document.querySelector('[data-relay-dialog="configure:every-field-type-1"]')).not.toBeNull());
    const certificateRow = () => openRelayDialog().querySelector<HTMLElement>('[data-relay-setting="certificate"]') ?? expect.unreachable("no Certificate row");
    const fileInput = certificateRow().querySelector<HTMLInputElement>('input[type="file"]') ?? expect.unreachable("no file input");
    const unreadableFile = new File(["unread"], "moved.pem");
    Object.defineProperty(unreadableFile, "text", { value: () => Promise.reject(new Error("the file was moved")) });
    Object.defineProperty(fileInput, "files", { value: [unreadableFile], configurable: true });

    fireEvent.change(fileInput);
    await waitFor(() => expect(certificateRow().textContent).toContain("The file couldn't be read: the file was moved"));
    fireEvent.click(certificateRow().querySelector<HTMLElement>('[data-relay-action="use-default"]') ?? expect.unreachable("no Use default"));

    expect(certificateRow().textContent).not.toContain("couldn't be read");
  });

  it("refuses copying or cutting a masked file's text out of its field, and allows it from an unmasked one", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=every-field-type");
    await openSettingsOn("relays");
    await openTheAddRelayDialogFor("every-field-type");
    const unmaskedField = openRelayDialog().querySelector<HTMLTextAreaElement>('[data-relay-setting-field="certificate"]') ?? expect.unreachable("no certificate field");
    expect(fireEvent.copy(unmaskedField)).toBe(true);
    expect(fireEvent.cut(unmaskedField)).toBe(true);
    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-dialog] button[aria-label="Close"], [data-relay-dialog] [data-slot="dialog-close"]') ?? expect.unreachable("no close"));
    await waitFor(() => expect(document.querySelector("[data-relay-dialog]")).toBeNull());
    await openTheAddRelayDialogFor("moqpro");
    const maskedField = openRelayDialog().querySelector<HTMLTextAreaElement>('[data-relay-setting-field="signing_key"]') ?? expect.unreachable("no signing key field");
    typeIntoTheRelaySetting("signing_key", "typed-in-the-test");

    expect(fireEvent.copy(maskedField)).toBe(false);
    expect(fireEvent.cut(maskedField)).toBe(false);
  });

  it("keeps a secret file's line breaks whole in its masked field", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=local");
    await openSettingsOn("relays");
    await openTheAddRelayDialogFor("moqpro");

    typeIntoTheRelaySetting("signing_key", "-----BEGIN PRIVATE KEY-----\nline\n-----END PRIVATE KEY-----\n");

    expect(openRelayDialog().querySelector<HTMLTextAreaElement>('[data-relay-setting-field="signing_key"]')?.value).toBe("-----BEGIN PRIVATE KEY-----\nline\n-----END PRIVATE KEY-----\n");
  });

  it("shows an add the runtime refuses inside the form in its own words, adds nothing, and clears the secret typed", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running&relays=local");
    await openSettingsOn("relays");
    await openTheAddRelayDialogFor("moqpro");

    typeIntoTheRelaySetting("project_id", "desk/a");
    typeIntoTheRelaySetting("signing_key", "typed-in-the-test");
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="add"]') ?? expect.unreachable("no Add relay"));

    await waitFor(
      () =>
        expect(openRelayDialog().querySelector("[data-relay-dialog-refusal]")?.textContent).toBe(
          "The runtime didn't add the relay: the settings of the relay `moqpro-1` are refused: `project_id` `desk/a` is not a moq.pro project id: one path segment, non-empty, with no `/`",
        ),
      { timeout: 3_000 },
    );
    expect(openRelayDialog().querySelector<HTMLInputElement>('[data-relay-setting-field="signing_key"]')?.value).toBe("");
    expect(openRelayDialog().querySelector<HTMLInputElement>('[data-relay-setting-field="project_id"]')?.value).toBe("desk/a");
    expect(document.querySelector('[data-relay-row="moqpro-1"]')).toBeNull();
  });

  it("moves a local listener's port, and returns it to its default", { timeout: 8_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("local-every-interface")).toBeTruthy());

    fireEvent.click(within(relayRowOf("local-every-interface")).getByRole("button", { name: "Configure Every interface" }));
    await waitFor(() => expect(openRelayDialog().getAttribute("data-relay-dialog")).toBe("configure:local-every-interface"));
    expect(openRelayDialog().querySelector<HTMLInputElement>('[data-relay-setting-field="port"]')?.value).toBe("4445");
    typeIntoTheRelaySetting("port", "14447");
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="save"]') ?? expect.unreachable("no Save"));
    await waitFor(() => expect(relayRowOf("local-every-interface").textContent).toContain("Port 14447"), { timeout: 3_000 });

    fireEvent.click(within(relayRowOf("local-every-interface")).getByRole("button", { name: "Configure Every interface" }));
    await waitFor(() => expect(openRelayDialog()).toBeTruthy());
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="use-default"]') ?? expect.unreachable("no Use default"));
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="save"]') ?? expect.unreachable("no Save"));
    await waitFor(() => expect(relayRowOf("local-every-interface").textContent).toContain("Port 4445"), { timeout: 3_000 });
  });

  it("shows a held secret as the runtime lists it beside an empty field, and replaces it only when something is typed", { timeout: 6_000 }, async () => {
    const configured: [string, unknown][] = [];
    const mock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running")));
    await mountedWindowOverTheMock("state=running", {
      describeRelays: () => mock.describeRelays(),
      configureRelay: async (relayId, settings) => {
        configured.push([relayId, settings]);
      },
    });
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("moqpro-1")).toBeTruthy());

    fireEvent.click(within(relayRowOf("moqpro-1")).getByRole("button", { name: "Configure moqpro-1" }));
    await waitFor(() => expect(openRelayDialog()).toBeTruthy());
    expect(openRelayDialog().querySelector('[data-relay-setting="signing_key"] [data-relay-secret-presence]')?.textContent).toBe("Set");
    expect(openRelayDialog().querySelector<HTMLInputElement>('[data-relay-setting-field="signing_key"]')?.value).toBe("");
    expect(openRelayDialog().querySelector<HTMLButtonElement>('[data-relay-action="save"]')?.disabled).toBe(true);
    typeIntoTheRelaySetting("signing_key", "a-new-key");
    fireEvent.click(openRelayDialog().querySelector<HTMLElement>('[data-relay-action="save"]') ?? expect.unreachable("no Save"));

    await waitFor(() => expect(configured).toEqual([["moqpro-1", { signing_key: "a-new-key" }]]));
  });

  it("asks before removing an added relay, and removes it only when told to", { timeout: 6_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("cloudflare-1")).toBeTruthy());

    fireEvent.click(within(relayRowOf("cloudflare-1")).getByRole("button", { name: "More for cloudflare-1" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-relay-action="remove"]') ?? expect.unreachable("no Remove relay…")));
    await waitFor(() => expect(screen.getByText("Remove cloudflare-1?")).toBeTruthy());
    fireEvent.click(document.querySelector<HTMLElement>('[data-relay-action="confirm-remove"]') ?? expect.unreachable("no Remove relay"));

    await waitFor(() => expect(document.querySelector('[data-relay-row="cloudflare-1"]')).toBeNull(), { timeout: 3_000 });
    expect(relayRowOf("moqpro-1")).toBeTruthy();
  });

  it("closes Configure when its relay is no longer listed, so a relay listed again under the same id never reopens it", { timeout: 20_000 }, async () => {
    const { backend } = await mountedWindowOverTheMock("state=running");
    await openSettingsOn("relays");
    await waitFor(() => expect(relayRowOf("moqpro-1")).toBeTruthy());
    fireEvent.click(within(relayRowOf("moqpro-1")).getByRole("button", { name: "Configure moqpro-1" }));
    await waitFor(() => expect(openRelayDialog().getAttribute("data-relay-dialog")).toBe("configure:moqpro-1"));

    await backend.removeRelay("moqpro-1");
    await waitFor(() => expect(document.querySelector('[data-relay-row="moqpro-1"]')).toBeNull(), { timeout: 6_000 });
    await backend.addRelay("moqpro", { project_id: "pb2studio", signing_key: "typed-in-the-test" });
    await waitFor(() => expect(relayRowOf("moqpro-1").textContent).toContain("Project ID pb2studio"), { timeout: 6_000 });

    expect(document.querySelector("[data-relay-dialog]")).toBeNull();
  });

  it("says the relays show while the runtime runs when it is down", async () => {
    await mountedWindowOverTheMock("state=stopped");
    await openSettingsOn("relays");

    expect(document.querySelector('[data-relays-section="runtime-not-running"]')?.textContent).toBe("Relays show here while the runtime runs.");
  });
});
