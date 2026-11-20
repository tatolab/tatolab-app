// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenProjectReading, RecentProject } from "../shared/tatolab_backend_contract";
import { PULSE_STAGE_PROJECT_DESCRIPTION } from "../../mock/mock_pulse_stage_sample";
import { removeTheKeydownListenersOfEarlierWindows, hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle, mountedWindowOverTheMock, textOf, pressAsAPointerDoes, PULSE_STAGE_FOLDER, CAMERA_PROJECT, coreViewPage, inTheCoreView, projectsWindowNewProjectButton, AREAS_OF_THE_DEFAULT_LAYOUT, theAreasShownAre, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

describe("the studio", () => {
  it("shows the Projects window with no project open, its recent projects as cards, and opens the one chosen on its stream", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const pulseStageCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage card"));
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);

    fireEvent.click(pulseStageCard.querySelector<HTMLElement>("[data-project-open]") ?? expect.unreachable("no open button"));

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => `${tab.textContent} ${tab.getAttribute("aria-selected")}`)).toEqual(["main true"]));
    await waitFor(() => expect(coreViewPage("viewer", "viewer").querySelector('[data-viewer-state="nothing_selected"]')).not.toBeNull());
  });

  it("shows the Projects window with no menu bar, a bare strip for the window buttons on macOS only, and a gear that opens Settings", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-projects-title-bar]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    await waitFor(() => expect(document.querySelector('[data-settings-page="general"]')).not.toBeNull());
  });

  it("shows the Linux Projects window under its own title bar, with no strip and no menu bar", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running&project=none");
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(document.querySelector("[data-projects-title-bar]")).toBeNull();
  });

  it("narrows the Projects window to the projects a search names, the search opening from its button and folding back when left empty", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    expect(screen.queryByRole("textbox", { name: "Search projects" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search projects" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search projects" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "camera" } });
    expect([...document.querySelectorAll("[data-projects-project]")].map((card) => card.getAttribute("data-projects-project"))).toEqual([CAMERA_PROJECT]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "nothing-like-it" } });
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(0);
    expect(textOf("[data-projects-empty]")).toContain("No project matches");

    const searchTextbox = screen.getByRole("textbox", { name: "Search projects" });
    fireEvent.keyDown(searchTextbox, { key: "Escape" });
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);
    fireEvent.keyDown(searchTextbox, { key: "Escape" });
    fireEvent.blur(searchTextbox);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Search projects" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search projects" }));
  });

  it("switches the Projects window between grid and list from its View menu, and opens on the layout chosen last", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    expect(document.querySelector("[data-projects]")?.getAttribute("data-projects-layout")).toBe("grid");

    pressAsAPointerDoes(screen.getByRole("button", { name: "View: Grid" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-projects-view-choice="list"]') ?? expect.unreachable("no List choice")));

    await waitFor(() => expect(document.querySelector("[data-projects]")?.getAttribute("data-projects-layout")).toBe("list"));
    expect(screen.getByRole("button", { name: "View: List" })).toBeTruthy();
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6);
    const pulseStageRow = document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage row");
    expect(pulseStageRow.querySelector("[data-project-open]")?.getAttribute("title")).toBe("~/streams/pulse-stage");
    expect(pulseStageRow.textContent).toContain(PULSE_STAGE_PROJECT_DESCRIPTION);
    expect(pulseStageRow.textContent).toMatch(/(ago|just now)$/);

    await hideTheWindowsOfEarlierTestsAndLetTheirReadsSettle();
    removeTheKeydownListenersOfEarlierWindows();
    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    expect(document.querySelector("[data-projects]")?.getAttribute("data-projects-layout")).toBe("list");

    fireEvent.click(document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"] [data-project-open]`) ?? expect.unreachable("no Pulse Stage row"));

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("orders the Projects window by last edited, or by name from its sort menu", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    const namesShown = () => [...document.querySelectorAll("[data-projects-project] [data-project-more-actions]")].map((moreActions) => (moreActions.getAttribute("aria-label") ?? "").replace(/^Actions for (.*), [^,]*$/, "$1"));
    const namesByLastOpened = namesShown();
    expect(namesByLastOpened.slice(0, 3)).toEqual(["Pulse Stage", "night-market-visuals", "camera"]);

    pressAsAPointerDoes(screen.getByRole("button", { name: "Sort: Last edited" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-projects-sort-choice="name"]') ?? expect.unreachable("no Name choice")));

    await waitFor(() => expect(screen.getByRole("button", { name: "Sort: Name" })).toBeTruthy());
    expect(namesShown()).toEqual([...namesByLastOpened].sort((first, second) => first.localeCompare(second, "en", { sensitivity: "base", numeric: true })));
    expect(namesShown()).not.toEqual(namesByLastOpened);
  });

  it("shows each project's description, or that it has none, and when it was edited, or opened for a project with no edit", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const pulseStageCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage card"));
    expect(pulseStageCard.textContent).toContain(PULSE_STAGE_PROJECT_DESCRIPTION);
    expect(pulseStageCard.textContent).toMatch(/Edited (\d+ minutes? ago|just now)/);
    const galleryCard = document.querySelector<HTMLElement>(`[data-projects-project$="/streams/gallery-wall"]`) ?? expect.unreachable("no gallery card");
    expect(galleryCard.textContent).toContain("No description yet");
    expect(galleryCard.textContent).toContain("Opened 2 weeks ago");
  });

  it("renames a project from its ⋯ menu through the runtime, refusing a blank name and keeping the dialog open with the runtime's words", async () => {
    const renameRecentProject = vi.fn(async (folder: string, name: string) => {
      if (name === "Refused") throw "rename_project failed: the project file is read-only";
      renamedNames.set(folder, name);
    });
    const renamedNames = new Map<string, string>();
    const { backend } = await mountedWindowOverTheMock("state=running&project=none", { renameRecentProject });
    const readRecentProjectsOfTheMock = backend.readRecentProjects.bind(backend);
    backend.readRecentProjects = async () => (await readRecentProjectsOfTheMock()).map((recent) => ({ ...recent, project_name: renamedNames.get(recent.folder) ?? recent.project_name }));
    const pulseStageCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage card"));

    pressAsAPointerDoes(within(pulseStageCard).getByRole("button", { name: /^Actions for Pulse Stage,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Rename…/ }));
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-naming-dialog-name]") ?? expect.unreachable("no Rename dialog"));
    expect(nameField.value).toBe("Pulse Stage");
    fireEvent.change(nameField, { target: { value: "   " } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    expect(renameRecentProject).not.toHaveBeenCalled();

    fireEvent.change(nameField, { target: { value: "Refused" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(textOf("[data-naming-dialog-refusal]")).toContain("rename_project failed: the project file is read-only"));
    expect(document.querySelector("[data-name-form-dialog='rename_project']")).not.toBeNull();

    fireEvent.change(nameField, { target: { value: "Night Show" } });
    fireEvent.keyDown(nameField, { key: "Enter" });

    await waitFor(() => expect(document.querySelector("[data-name-form-dialog='rename_project']")).toBeNull());
    expect(renameRecentProject).toHaveBeenLastCalledWith(PULSE_STAGE_FOLDER, "Night Show");
    await waitFor(() => expect(within(pulseStageCard).getByRole("button", { name: /^Actions for Night Show,/ })).toBeTruthy());
  });

  it("duplicates a project from its ⋯ menu into a card of its own, and says why in a notice when the runtime refuses", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    const pulseStageCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage card"));

    pressAsAPointerDoes(within(pulseStageCard).getByRole("button", { name: /^Actions for Pulse Stage,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Duplicate/ }));

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PULSE_STAGE_FOLDER} copy"]`)).not.toBeNull());
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(7);
    expect(screen.getByRole("button", { name: /^Actions for Pulse Stage copy,/ })).toBeTruthy();

    const goneCard = document.querySelector<HTMLElement>(`[data-projects-project$="/Desktop/old-sketch"]`) ?? expect.unreachable("no card of the project gone from disk");
    pressAsAPointerDoes(within(goneCard).getByRole("button", { name: /^Actions for old-sketch,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Duplicate/ }));

    await waitFor(() => expect(document.querySelector('[data-recent-project-change-refusal="duplicate"]')).not.toBeNull());
    expect(textOf('[data-recent-project-change-refusal="duplicate"]')).toContain("The project wasn't duplicated");
    expect(textOf('[data-recent-project-change-refusal="duplicate"]')).toContain("holds no project: it has no tatolab-project.json");
  });

  it("shows a project covered by a chosen image by that image, one with none by its initial's tile, and ends the grid with New project", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const createAProject = vi.spyOn(backend, "readNewProjectDefaults");
    const pulseStageCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage card"));
    await waitFor(() => expect(pulseStageCard.querySelector('[data-project-cover="image"] img')?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/));
    const galleryCard = document.querySelector<HTMLElement>(`[data-projects-project$="/streams/gallery-wall"]`) ?? expect.unreachable("no gallery card");
    expect(galleryCard.querySelector('[data-project-cover="plain"]')?.textContent).toBe("G");

    const listItems = [...document.querySelectorAll('[role="list"][aria-label="Projects"] > [role="listitem"]')];
    expect(listItems.at(-1)?.querySelector('[data-projects-action="new-card"]')).not.toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-projects-action="new-card"]') ?? expect.unreachable("no New project card"));
    await waitFor(() => expect(createAProject).toHaveBeenCalled());
  });

  it("shows the first project in Project details, another chosen from its ⋯ menu, and saves a description and a name as their fields lose focus", async () => {
    const setRecentProjectDescription = vi.fn<(folder: string, description: string) => Promise<void>>(async () => undefined);
    const renameRecentProject = vi.fn<(folder: string, name: string) => Promise<void>>(async () => undefined);
    await mountedWindowOverTheMock("state=running&project=none", { setRecentProjectDescription, renameRecentProject });
    const detailsPanel = () => document.querySelector<HTMLElement>("[data-project-details]") ?? expect.unreachable("no Project details");
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toBe(PULSE_STAGE_FOLDER));
    expect(detailsPanel().querySelector<HTMLInputElement>("[data-project-details-name]")?.value).toBe("Pulse Stage");

    const cameraCard = document.querySelector<HTMLElement>(`[data-projects-project$="/streams/camera"]`) ?? expect.unreachable("no camera card");
    pressAsAPointerDoes(within(cameraCard).getByRole("button", { name: /^Actions for camera,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Details/ }));
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toMatch(/\/streams\/camera$/));
    const cameraFolder = detailsPanel().getAttribute("data-project-details") ?? "";
    const descriptionField = detailsPanel().querySelector<HTMLTextAreaElement>("[data-project-details-description]") ?? expect.unreachable("no description field");
    expect(descriptionField.value).toBe("Camera test bench for the new capture cards.");

    fireEvent.blur(descriptionField);
    expect(setRecentProjectDescription).not.toHaveBeenCalled();
    fireEvent.change(descriptionField, { target: { value: "The capture-card bench." } });
    fireEvent.blur(descriptionField);
    await waitFor(() => expect(setRecentProjectDescription).toHaveBeenCalledWith(cameraFolder, "The capture-card bench."));

    const nameField = detailsPanel().querySelector<HTMLInputElement>("[data-project-details-name]") ?? expect.unreachable("no name field");
    fireEvent.change(nameField, { target: { value: "  " } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    await waitFor(() => expect(detailsPanel().textContent).toContain("Give the project a name."));
    fireEvent.change(nameField, { target: { value: "Capture bench" } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    await waitFor(() => expect(renameRecentProject).toHaveBeenCalledWith(cameraFolder, "Capture bench"));

    fireEvent.click(within(detailsPanel()).getByRole("button", { name: "Hide project details" }));
    await waitFor(() => expect(document.querySelector("[data-project-details]")).toBeNull());
  });

  it("keeps Project details on a project renamed from it under the Name sort, and renames it once for an Enter then a blur", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const renameRecentProject = vi.spyOn(backend, "renameRecentProject");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(6));
    pressAsAPointerDoes(screen.getByRole("button", { name: "Sort: Last edited" }));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-projects-sort-choice="name"]') ?? expect.unreachable("no Name choice")));
    const detailsPanel = () => document.querySelector<HTMLElement>("[data-project-details]") ?? expect.unreachable("no Project details");
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toMatch(/\/streams\/camera$/));
    const cameraFolder = detailsPanel().getAttribute("data-project-details") ?? "";

    const nameField = detailsPanel().querySelector<HTMLInputElement>("[data-project-details-name]") ?? expect.unreachable("no name field");
    fireEvent.focus(nameField);
    fireEvent.change(nameField, { target: { value: "zebra" } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    fireEvent.blur(nameField);

    await waitFor(() => expect(within(document.querySelector<HTMLElement>(`[data-projects-project="${cameraFolder}"]`) ?? expect.unreachable("no camera card")).getByRole("button", { name: /^Actions for zebra,/ })).toBeTruthy());
    expect(renameRecentProject).toHaveBeenCalledTimes(1);
    expect(renameRecentProject).toHaveBeenCalledWith(cameraFolder, "zebra");
    expect(detailsPanel().getAttribute("data-project-details")).toBe(cameraFolder);
  });

  it("covers a project by an image chosen in Project details, removes it again, and says why when the runtime refuses", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const setRecentProjectCover = vi.spyOn(backend, "setRecentProjectCover");
    const detailsPanel = () => document.querySelector<HTMLElement>("[data-project-details]") ?? expect.unreachable("no Project details");
    const galleryCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project$="/streams/gallery-wall"]`) ?? expect.unreachable("no gallery card"));
    pressAsAPointerDoes(within(galleryCard).getByRole("button", { name: /^Actions for gallery-wall,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Details/ }));
    await waitFor(() => expect(detailsPanel().getAttribute("data-project-details")).toMatch(/\/streams\/gallery-wall$/));
    expect(detailsPanel().querySelector('[data-project-details-action="remove-image"]')).toBeNull();

    fireEvent.click(detailsPanel().querySelector<HTMLElement>('[data-project-details-action="choose-image"]') ?? expect.unreachable("no Choose image…"));
    await waitFor(() => expect(setRecentProjectCover).toHaveBeenCalledWith(expect.stringMatching(/\/streams\/gallery-wall$/), expect.stringMatching(/night-market-poster\.png$/)));
    await waitFor(() => expect(galleryCard.querySelector('[data-project-cover="image"] img')).not.toBeNull());
    expect(detailsPanel().querySelector('[data-project-cover="image"] img')).not.toBeNull();

    setRecentProjectCover.mockImplementationOnce(async () => {
      throw "set_project_cover failed: the project file is read-only";
    });
    fireEvent.click(detailsPanel().querySelector<HTMLElement>('[data-project-details-action="remove-image"]') ?? expect.unreachable("no Remove"));
    await waitFor(() => expect(detailsPanel().textContent).toContain("The cover wasn't removed: set_project_cover failed: the project file is read-only"));

    fireEvent.click(detailsPanel().querySelector<HTMLElement>('[data-project-details-action="remove-image"]') ?? expect.unreachable("no Remove"));
    await waitFor(() => expect(galleryCard.querySelector('[data-project-cover="plain"]')).not.toBeNull());
    expect(detailsPanel().querySelector('[data-project-details-action="remove-image"]')).toBeNull();
  });

  it("deletes a project from its ⋯ menu only once the question is answered, and its card leaves", async () => {
    const deleteRecentProject = vi.fn<(folder: string) => Promise<void>>();
    const { backend } = await mountedWindowOverTheMock("state=running&project=none");
    const deleteRecentProjectOfTheMock = backend.deleteRecentProject.bind(backend);
    backend.deleteRecentProject = async (folder) => {
      deleteRecentProject(folder);
      await deleteRecentProjectOfTheMock(folder);
    };
    const pulseStageCard = await waitFor(() => document.querySelector<HTMLElement>(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Pulse Stage card"));

    pressAsAPointerDoes(within(pulseStageCard).getByRole("button", { name: /^Actions for Pulse Stage,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete…/ }));
    await waitFor(() => expect(screen.getByText("Delete “Pulse Stage”?")).toBeTruthy());
    expect(screen.getByText("Its streams stop, and Tato Studio moves its folder to the Trash, where you can put it back.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Delete “Pulse Stage”?")).toBeNull());
    expect(deleteRecentProject).not.toHaveBeenCalled();

    pressAsAPointerDoes(within(pulseStageCard).getByRole("button", { name: /^Actions for Pulse Stage,/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete…/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to Trash" }));
    await waitFor(() => expect(within(pulseStageCard).getByText("Moving to Trash…")).toBeTruthy());
    expect(pulseStageCard.querySelector<HTMLButtonElement>("[data-project-open]")?.disabled).toBe(true);
    expect(pulseStageCard.querySelector("[data-project-more-actions]")).toBeNull();

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`)).toBeNull());
    expect(deleteRecentProject).toHaveBeenCalledExactlyOnceWith(PULSE_STAGE_FOLDER);
    expect(document.querySelectorAll("[data-projects-project]")).toHaveLength(5);
  });

  it("imports a project .zip from New project's menu on a sheet named after the zip, and opens the project made", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project \.zip…/ }));

    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no Import project sheet"));
    expect(screen.getByText("Import project")).toBeTruthy();
    expect(screen.getByText("Tato Studio makes a project of its own from halftone-webcam-main.zip, in a new folder. It keeps the name it was saved with.")).toBeTruthy();
    expect(screen.getByLabelText("Folder name")).toBe(nameField);
    expect(nameField.value).toBe("halftone-webcam-main");
    expect(textOf("[data-new-project-folder]")).toBe("~/Documents/Tato Studio/halftone-webcam-main");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("keeps the Import project sheet open with the runtime's words when it refuses the zip, and a cancelled dialog opens no sheet", async () => {
    const chosenArchives = [null, { archive: "/Users/jonathanf/Downloads/notes.zip", location: "/Users/jonathanf/Documents/Tato Studio", name: "notes" }];
    await mountedWindowOverTheMock("state=running&project=none", {
      chooseProjectArchiveToImport: async () => chosenArchives.shift() ?? null,
      importProjectArchive: () => Promise.reject("import_project failed: /Users/jonathanf/Downloads/notes.zip holds no tatolab-project.json"),
    });
    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project \.zip…/ }));
    await act(() => new Promise<void>((settled) => setTimeout(settled, 50)));
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();

    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project \.zip…/ }));
    await waitFor(() => expect(document.querySelector("[data-new-project-sheet]")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(textOf("[data-new-project-refusal]")).toContain("The project wasn't imported:"));
    expect(textOf("[data-new-project-refusal]")).toContain("holds no tatolab-project.json");
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });

  it("opens New project from ⌘N on the Projects window, and leaves an open sheet as it is", async () => {
    const readNewProjectDefaults = vi.fn(async () => ({ location: "/Users/jonathanf/Documents/Tato Studio", name: "Untitled project 2" }));
    await mountedWindowOverTheMock("state=running&project=none", { readNewProjectDefaults });
    await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());

    fireEvent.keyDown(document, { key: "n", metaKey: true });

    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));
    fireEvent.change(nameField, { target: { value: "Night Show" } });
    fireEvent.keyDown(document, { key: "n", metaKey: true });
    await act(() => new Promise<void>((settled) => setTimeout(settled, 50)));
    expect(document.querySelector<HTMLInputElement>("[data-new-project-name]")?.value).toBe("Night Show");
    expect(readNewProjectDefaults).toHaveBeenCalledTimes(1);
  });

  it("shows a project opened from another window once the Projects window is focused again", async () => {
    const recentProjectsOnDisk: RecentProject[] = [];
    await mountedWindowOverTheMock("state=running&project=none&recent=none", { readRecentProjects: () => Promise.resolve([...recentProjectsOnDisk]) });
    await waitFor(() => expect(textOf("[data-projects-empty]")).toContain("No projects yet"));

    recentProjectsOnDisk.push({ folder: PULSE_STAGE_FOLDER, project_name: "Pulse Stage", project_description: null, last_edited_at_wall_clock_ms: null, has_a_chosen_cover: false, last_opened_at_wall_clock_ms: Date.now() });
    act(() => {
      window.dispatchEvent(new FocusEvent("focus"));
    });

    await waitFor(() => expect(document.querySelector(`[data-projects-project="${PULSE_STAGE_FOLDER}"]`)).not.toBeNull());
    expect(document.querySelector("[data-projects-empty]")).toBeNull();
  });

  it("opens first run on the empty Projects window, All projects in its sidebar beside the app's version, and Import project folder… opens the one chosen", async () => {
    await mountedWindowOverTheMock("state=running&project=none&recent=none");
    await waitFor(() => expect(textOf("[data-projects-empty]")).toContain("No projects yet"));
    expect(screen.getByRole("heading", { level: 1, name: "All projects" })).toBeTruthy();
    expect(document.querySelector('[data-projects-section="all_projects"]')?.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("v0.45.0")).toBeTruthy();
    expect(document.querySelector("[data-project-details]")).toBeNull();

    pressAsAPointerDoes(screen.getByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project folder…/ }));

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-projects]")).toBeNull();
  });

  it("says why an unreadable project can't be read, in the reader's words", async () => {
    await mountedWindowOverTheMock("state=running&project=unreadable");
    await waitFor(() => expect(inTheCoreView("outliner").getByText(`${PULSE_STAGE_FOLDER} can't be read`)).toBeTruthy());
    expect(inTheCoreView("outliner").getByText(/holds no project: it has no tatolab-project\.json/)).toBeTruthy();
  });

  it("shows a refused project choice in its own words, and the open project stays as it was", async () => {
    const reading: OpenProjectReading = { kind: "none_open" };
    await mountedWindowOverTheMock("state=running&project=none", {
      readOpenProject: async () => reading,
      chooseProjectFolder: () => Promise.reject("The project dialog did not open: no window"),
    });
    pressAsAPointerDoes(await screen.findByRole("button", { name: "More ways to start a project" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Import project folder…/ }));

    await waitFor(() => expect(textOf("[data-project-opening-refusal]")).toContain("The project dialog did not open: no window"));
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });

  it("opens New project on a sheet with an untitled name in Documents/Tato Studio, its full path following the name and Browse…, and Create opens the project made", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await projectsWindowNewProjectButton());
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));
    expect(nameField.value).toBe("Untitled project 2");
    expect(textOf("[data-new-project-location]")).toBe("~/Documents/Tato Studio");
    expect(textOf("[data-new-project-folder]")).toBe("~/Documents/Tato Studio/Untitled project 2");

    fireEvent.change(nameField, { target: { value: "Night Show" } });
    expect(textOf("[data-new-project-folder]")).toBe("~/Documents/Tato Studio/Night Show");
    fireEvent.click(screen.getByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(textOf("[data-new-project-location]")).toBe("~/Shows"));
    expect(textOf("[data-new-project-folder]")).toBe("~/Shows/Night Show");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await theAreasShownAre(AREAS_OF_THE_DEFAULT_LAYOUT);
    expect(document.querySelector("[data-new-project-sheet]")).toBeNull();
    expect(document.querySelector("[data-projects]")).toBeNull();
    const streamTabs = within(await screen.findByRole("tablist", { name: "Open streams" }));
    await waitFor(() => expect(streamTabs.getAllByRole("tab").map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true"]));
    await waitFor(() => expect(streamTabs.getByRole("tab").textContent).toBe("main"));
  });

  it("opens the Activity panel as a new project's packages sync, naming each package uv downloads, and keeps how many it installed and each package once it ends", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await projectsWindowNewProjectButton());
    await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const packageList = await screen.findByRole("list", { name: "Untitled project 2's Python packages, each part" }, { timeout: 4000 });
    await waitFor(() => expect(within(packageList).getByText("pillow")).toBeTruthy(), { timeout: 4000 });
    expect(document.querySelector("[data-studio-activity-panel]")?.textContent).toMatch(/Downloading|Installing|Installed/);
    const endedRow = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-activity-panel] [data-progress-meter-outcome="done"]') ?? expect.unreachable("the sync has not ended"), { timeout: 8000 });
    expect(endedRow.textContent).toContain("Installed 8 packages");
    expect(within(within(endedRow).getByRole("list")).getByText("pillow")).toBeTruthy();
  }, 15_000);

  it("refuses a name that is no folder name before Create, and a folder already there in the sheet, which stays open", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    fireEvent.click(await projectsWindowNewProjectButton());
    const nameField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-new-project-name]") ?? expect.unreachable("no New project sheet"));

    fireEvent.change(nameField, { target: { value: "lights/left" } });
    expect(screen.getByRole("alert").textContent).toBe("A project's name can't hold a /.");
    expect(document.querySelector('[data-new-project-action="create"]')?.getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(nameField, { target: { value: "Untitled project" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(textOf("[data-new-project-refusal]")).toBe("The project wasn't created: /Users/jonathanf/Documents/Tato Studio/Untitled project already exists. Choose another name or location."),
    );
    expect(document.querySelector("[data-new-project-sheet]")).not.toBeNull();
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });

  it("shows the runtime's refusal to create a project in the sheet, in its own words, and Cancel closes it with nothing opened", async () => {
    await mountedWindowOverTheMock("state=running&project=none", { createNewProject: () => Promise.reject("the folder already holds a project") });
    fireEvent.click(await projectsWindowNewProjectButton());
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));

    await waitFor(() => expect(textOf("[data-new-project-refusal]")).toBe("The project wasn't created: the folder already holds a project"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(document.querySelector("[data-new-project-sheet]")).toBeNull());
    expect(document.querySelector("[data-projects]")).not.toBeNull();
  });
});
