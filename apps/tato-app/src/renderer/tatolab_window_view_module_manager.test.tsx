// @vitest-environment happy-dom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend } from "../../mock/mock_tatolab_backend";
import { readMockTatolabOptions } from "../../mock/mock_tatolab_options";
import type { MarketplaceImport, MarketplaceImportProgressed, MarketplaceImportStage } from "../shared/tatolab_backend_contract";
import type { ModuleManagerSectionAsked } from "../shared/tatolab_electron_bridge_contract";
import { mountedWindowOverTheMock, textOf, pressAsAPointerDoes, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

describe("Module manager", () => {
  function moduleManagerRow(rowId: string): HTMLElement {
    return document.querySelector<HTMLElement>(`[data-module-manager-row="${rowId}"]`) ?? expect.unreachable(`no ${rowId} row`);
  }
  function pressed(selector: string): void {
    fireEvent.click(document.querySelector<HTMLElement>(selector) ?? expect.unreachable(`nothing at ${selector}`));
  }
  async function shown(selector: string): Promise<void> {
    await waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
  }
  async function chosenFromTheActionsOf(folder: string, choice: "update" | "remove"): Promise<void> {
    pressAsAPointerDoes(document.querySelector<HTMLElement>(`[data-module-manager-actions="${folder}"]`) ?? expect.unreachable(`no ⋯ menu for ${folder}`));
    fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-module-manager-${choice}="${folder}"]`) ?? expect.unreachable(`no ${choice} in the ⋯ menu of ${folder}`)));
  }
  function openThePageOf(rowId: string): void {
    pressed(`[data-module-manager-row="${rowId}"] :is([data-module-card-open], [data-module-list-row-open])`);
  }
  const shownTab = () => document.querySelector('[data-module-manager-show][aria-pressed="true"]')?.getAttribute("data-module-manager-show");
  const searchField = () => document.querySelector<HTMLInputElement>("input[data-module-manager-search]") ?? document.querySelector<HTMLInputElement>("[data-module-manager-search] input") ?? expect.unreachable("no search");

  it("names the project's tab and its page after the open project, and lists its modules as the runtime does with what each adds and where it was copied from", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture&module_manager=open&module_manager_section=added_to_this_project");

    await shown('[data-module-manager-row="import:lobby-wall"]');
    expect(document.querySelector("[data-studio-menu]")).toBeNull();
    expect(textOf('[data-module-manager-show="added_to_this_project"]')).toBe("Pulse Stage1");
    expect(textOf("[data-module-manager-project-name]")).toBe("Pulse Stage");
    expect(document.body.textContent).not.toContain("This project");
    expect(moduleManagerRow("import:lobby-wall").textContent).toContain("1 view");
    expect(moduleManagerRow("import:lobby-wall").textContent).toContain("From a folder");
    expect(moduleManagerRow("import:lobby-wall").textContent).not.toContain("imports/");
  });

  it("opens a module's own page from its row, with its folder under imports/ only in Technical details, and never offers to open it to edit or to place a node", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture&module_manager=open&module_manager_section=added_to_this_project");
    await shown('[data-module-manager-row="import:lobby-wall"]');

    openThePageOf("import:lobby-wall");

    await shown('[data-module-manager-detail="import:lobby-wall"]');
    expect(textOf("[data-module-manager-technical-details]")).toContain("imports/lobby-wall");
    expect(textOf("[data-module-manager-technical-details]")).toContain("/Users/jonathanf/streams/lobby-wall");
    expect(textOf('[data-module-manager-view="lobby-wall:stage_rig"]')).toBe("Stage rigDoesn't open: `contract`: this runtime reads view contract 1.0.");
    expect(document.querySelector("[data-module-manager-views-reach]")).toBeNull();
    expect(document.body.textContent).not.toContain("Open to edit");
    expect(document.body.textContent).not.toContain("Place node");
    pressed("[data-module-manager-back]");
    await shown('[data-module-manager-row="import:lobby-wall"]');
    expect(document.querySelector("[data-module-manager-detail]")).toBeNull();
  });

  it("opens on the tab File › Modules… asked for, and shows each tab asked of it once open", async () => {
    let askTheOpenWindowToShow: ((asked: ModuleManagerSectionAsked) => void) | null = null;
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", {
      onModuleManagerSectionAsked: (listener) => {
        askTheOpenWindowToShow = listener;
        return () => undefined;
      },
    });

    await waitFor(() => expect(shownTab()).toBe("added_to_this_project"));
    pressed('[data-module-manager-show="marketplace"]');
    expect(shownTab()).toBe("marketplace");
    act(() => askTheOpenWindowToShow?.({ shows: "added_to_this_project", page: null }));
    expect(shownTab()).toBe("added_to_this_project");
    pressed('[data-module-manager-show="marketplace"]');
    act(() => askTheOpenWindowToShow?.({ shows: "added_to_this_project", page: null }));
    expect(shownTab()).toBe("added_to_this_project");
  });

  it("opens on the page of the Marketplace entry the node search's See it asked for, and on each page asked of it once open", async () => {
    let askTheOpenWindowToShow: ((asked: ModuleManagerSectionAsked) => void) | null = null;
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=marketplace&module_manager_entry=camera-halftone", {
      onModuleManagerSectionAsked: (listener) => {
        askTheOpenWindowToShow = listener;
        return () => undefined;
      },
    });

    await shown('[data-module-manager-detail="catalog:camera-halftone"]');
    act(() => askTheOpenWindowToShow?.({ shows: "marketplace", page: "tatolab-camera" }));
    await shown('[data-module-manager-detail="catalog:tatolab-camera"]');
  });

  it("keeps a tab asked of it while it was still reading the one it opened on", async () => {
    let askTheOpenWindowToShow: ((asked: ModuleManagerSectionAsked) => void) | null = null;
    let answerTheSectionLastAsked: ((asked: ModuleManagerSectionAsked) => void) | null = null;
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      onModuleManagerSectionAsked: (listener) => {
        askTheOpenWindowToShow = listener;
        return () => undefined;
      },
      readModuleManagerSectionLastAsked: () =>
        new Promise((resolve) => {
          answerTheSectionLastAsked = resolve;
        }),
    });

    act(() => askTheOpenWindowToShow?.({ shows: "marketplace", page: null }));
    await act(async () => answerTheSectionLastAsked?.({ shows: "added_to_this_project", page: null }));

    await waitFor(() => expect(shownTab()).toBe("marketplace"));
  });

  it("adds a project's folder chosen in the dialog, or one dropped on the project's tab, and lists it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project");
    await shown('[data-module-manager-row="import:lobby-wall"]');

    pressed('[data-module-manager-add="folder"]');
    await shown('[data-module-manager-row="import:doorways"]');

    const moduleManagerWindow = document.querySelector<HTMLElement>("[data-module-manager-window]") ?? expect.unreachable("no window");
    fireEvent.drop(moduleManagerWindow, { dataTransfer: { files: [new File(["zip"], "night-lights.zip")], types: ["Files"] } });
    await shown('[data-module-manager-row="import:night-lights"]');
  });

  it("offers a folder or a .zip only on the project's tab: the Marketplace has no such button and takes no drop", async () => {
    let sourcesAdded: string[] = [];
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=marketplace", {
      addDependencyToTheWorkspace: (source) => {
        sourcesAdded = [...sourcesAdded, source];
        return Promise.reject("not asked for");
      },
    });
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');

    expect(document.querySelector("[data-module-manager-add]")).toBeNull();
    expect(document.querySelector("[data-module-manager-drop-hint]")).toBeNull();
    const moduleManagerWindow = document.querySelector<HTMLElement>("[data-module-manager-window]") ?? expect.unreachable("no window");
    fireEvent.drop(moduleManagerWindow, { dataTransfer: { files: [new File(["zip"], "night-lights.zip")], types: ["Files"] } });

    expect(sourcesAdded).toEqual([]);
    expect(shownTab()).toBe("marketplace");
  });

  it("opens nothing until a card is pressed, and keeps the search across the tabs", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=marketplace");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    expect(document.querySelector("[data-module-manager-detail]")).toBeNull();

    fireEvent.change(searchField(), { target: { value: "wall" } });
    await shown('[data-module-manager-state="empty"]');
    pressed('[data-module-manager-show="added_to_this_project"]');

    expect(searchField().value).toBe("wall");
    await shown('[data-module-manager-row="import:lobby-wall"]');
    expect(document.querySelector("[data-module-manager-detail]")).toBeNull();
    pressed('[data-module-manager-show="marketplace"]');
    expect(searchField().value).toBe("wall");
    expect(document.querySelector("[data-module-manager-detail]")).toBeNull();
  });

  it("shows the runtime's refusal of a folder in its own words", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", { addDependencyToTheWorkspace: () => Promise.reject("/Users/jonathanf/streams/doorways is not a project: it holds no tatolab-project.json") });
    await shown('[data-module-manager-row="import:lobby-wall"]');

    pressed('[data-module-manager-add="folder"]');
    await waitFor(() => expect(textOf("[data-module-manager-project-refusal]")).toContain("/Users/jonathanf/streams/doorways is not a project: it holds no tatolab-project.json"));
  });

  it("asks before an Update overwrites files edited since the copy, and Keep my edits leaves them", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&module_manager=edited_files&module_manager_section=added_to_this_project");
    await shown('[data-module-manager-row="import:lobby-wall"]');
    expect(moduleManagerRow("import:lobby-wall").textContent).not.toContain("edited");
    pressed("[data-module-manager-check-for-updates]");
    await waitFor(() => expect(textOf('[data-module-manager-status="lobby-wall"]')).toContain("Update available"));
    const editedFilesOfTheModule = async () => (await backend.listWorkspaceDependencies(false)).flatMap((dependency) => dependency.edited_files);

    await chosenFromTheActionsOf("lobby-wall", "update");
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")?.textContent).toContain("nodes/wall_mapping.py"));
    pressed("[data-module-manager-keep-my-edits]");
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull());
    expect(await editedFilesOfTheModule()).toEqual(["nodes/wall_mapping.py"]);

    await chosenFromTheActionsOf("lobby-wall", "update");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-overwrite]") === null ? expect.unreachable("no Overwrite") : "[data-module-manager-overwrite]")));
    await waitFor(() => expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull());
    await waitFor(async () => expect(await editedFilesOfTheModule()).toEqual([]));
  });

  it("closes the overwrite question when the runtime refuses the Overwrite, and says the refusal in its own words under the row", async () => {
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=edited_files&module_manager_section=added_to_this_project")));
    await mountedWindowOverTheMock("state=running&module_manager=edited_files&module_manager_section=added_to_this_project", {
      listWorkspaceDependencies: (checkForNewer) => backendOverTheMock.listWorkspaceDependencies(checkForNewer),
      updateWorkspaceDependency: (project, overwriteEditedFiles) =>
        overwriteEditedFiles ? Promise.reject("update_dependency failed: /Users/jonathanf/streams/lobby-wall could not be read") : backendOverTheMock.updateWorkspaceDependency(project, overwriteEditedFiles),
    });
    await shown('[data-module-manager-row="import:lobby-wall"]');
    pressed("[data-module-manager-check-for-updates]");
    await waitFor(() => expect(textOf('[data-module-manager-status="lobby-wall"]')).toContain("Update available"));

    await chosenFromTheActionsOf("lobby-wall", "update");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-overwrite]") === null ? expect.unreachable("no Overwrite") : "[data-module-manager-overwrite]")));
    await waitFor(() => expect(textOf('[data-module-manager-refusal="import:lobby-wall"]')).toContain("update_dependency failed: /Users/jonathanf/streams/lobby-wall could not be read"));
    expect(document.querySelector("[data-module-manager-overwrite-dialog]")).toBeNull();
  });

  it("says Update available in a module's Status once checked, greys Update in its ⋯ menu until then, and Update takes it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=newer&module_manager_section=added_to_this_project");
    await shown('[data-module-manager-row="import:lobby-wall"]');
    expect(textOf('[data-module-manager-status="lobby-wall"]')).toContain("Not checked for updates");
    expect(document.querySelector("[data-module-manager-filter]")).toBeNull();
    pressAsAPointerDoes(document.querySelector<HTMLElement>('[data-module-manager-actions="lobby-wall"]') ?? expect.unreachable("no ⋯ menu"));
    const greyedUpdate = await waitFor(() => document.querySelector<HTMLElement>('[data-module-manager-update="lobby-wall"]') ?? expect.unreachable("no Update in the ⋯ menu"));
    expect(greyedUpdate.getAttribute("aria-disabled")).toBe("true");
    expect(greyedUpdate.closest('[role="menu"]')?.textContent).toBe("UpdateUninstall…");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    pressed("[data-module-manager-check-for-updates]");
    await waitFor(() => expect(textOf('[data-module-manager-status="lobby-wall"] [data-module-card-mark="news"]')).toBe("Update available"));
    expect(textOf("[data-module-manager-updates-count]")).toBe("1 update");
    await chosenFromTheActionsOf("lobby-wall", "update");
    await waitFor(() => expect(document.querySelector("[data-module-manager-updates-count]")).toBeNull());
    expect(textOf('[data-module-manager-status="lobby-wall"]')).not.toContain("Update available");
  });

  it("says a module added from the Marketplace has the catalog's newer version on its page once checked, and Update takes it", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=marketplace_newer&module_manager_section=added_to_this_project");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    pressed("[data-module-manager-check-for-updates]");
    await waitFor(() => expect(textOf('[data-module-manager-status="camera"] [data-module-card-mark="news"]')).toBe("Update available"));
    expect(textOf("[data-module-manager-updates-count]")).toBe("1 update");

    openThePageOf("catalog:tatolab-camera");
    await shown("[data-module-manager-update-available]");
    expect(textOf("[data-module-manager-update-available]")).toBe("Version 0.68.29 is in the Marketplace.");
    pressed('[data-module-manager-detail] [data-module-manager-update="camera"]');
    await waitFor(() => expect(document.querySelector("[data-module-manager-updates-count]")).toBeNull());
    expect(document.querySelector("[data-module-manager-update-available]")).toBeNull();
  });

  it("uninstalls a module only once Uninstall… is confirmed, and says the runtime's refusal in its own words under its row", async () => {
    let refuseTheRemoval = true;
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open&module_manager_section=added_to_this_project")));
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", {
      listWorkspaceDependencies: (checkForNewer) => backendOverTheMock.listWorkspaceDependencies(checkForNewer),
      removeWorkspaceDependency: (project) => (refuseTheRemoval ? Promise.reject("remove_dependency failed: the stream main still uses a node of lobby-wall") : backendOverTheMock.removeWorkspaceDependency(project)),
    });
    await shown('[data-module-manager-row="import:lobby-wall"]');

    await chosenFromTheActionsOf("lobby-wall", "remove");
    await waitFor(() => expect(textOf("[data-module-manager-remove-dialog]")).toContain("Uninstall lobby-wall from Pulse Stage?"));
    pressed("[data-module-manager-confirm-remove]");
    await waitFor(() => expect(textOf('[data-module-manager-refusal="import:lobby-wall"]')).toContain("remove_dependency failed: the stream main still uses a node of lobby-wall"));
    expect(document.querySelector('[data-module-manager-row="import:lobby-wall"]')).not.toBeNull();

    refuseTheRemoval = false;
    await chosenFromTheActionsOf("lobby-wall", "remove");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-confirm-remove]") === null ? expect.unreachable("no Remove") : "[data-module-manager-confirm-remove]")));
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="import:lobby-wall"]')).toBeNull());
  });

  it("lists the catalog's packages and samples in the Marketplace, not a module it does not list, and narrows them to a kind and to a search", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");

    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    expect(moduleManagerRow("catalog:camera-halftone")).toBeTruthy();
    expect(document.querySelector('[data-module-manager-row="import:lobby-wall"]')).toBeNull();

    pressed('[data-module-manager-kind="sample"]');
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="catalog:tatolab-camera"]')).toBeNull());
    expect(moduleManagerRow("catalog:camera-halftone")).toBeTruthy();
    pressed('[data-module-manager-kind="all"]');

    fireEvent.change(searchField(), { target: { value: "opusdecoder" } });
    await waitFor(() => expect(document.querySelectorAll("[data-module-manager-row]").length).toBe(1));
  });

  it("adds a package from its card without opening anything, the card saying it is under way and then in the project, while other cards stay usable", async () => {
    let finishTheAdd: () => void = () => expect.unreachable("nothing was added");
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open")));
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      listWorkspaceDependencies: (checkForNewer) => backendOverTheMock.listWorkspaceDependencies(checkForNewer),
      importFromTheMarketplace: (name) =>
        new Promise((resolve, reject) => {
          finishTheAdd = () => backendOverTheMock.importFromTheMarketplace(name).then(resolve, reject);
        }),
    });
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');

    pressed('[data-module-manager-add-from-card="catalog:tatolab-camera"]');

    await waitFor(() => expect(textOf('[data-module-manager-row="catalog:tatolab-camera"] [data-module-card-pending]')).toBe("Adding…"));
    expect(textOf("[data-module-manager-in-progress]")).toBe("Adding Camera to Pulse Stage…");
    expect(document.querySelector("[data-module-manager-detail]")).toBeNull();
    expect(document.querySelector('[data-module-manager-add-from-card="catalog:tatolab-opus"]')).not.toBeNull();
    openThePageOf("catalog:tatolab-opus");
    await shown('[data-module-manager-import="tatolab-opus"]');
    pressed("[data-module-manager-back]");

    await act(async () => finishTheAdd());
    await waitFor(() => expect(textOf('[data-module-manager-row="catalog:tatolab-camera"] [data-module-card-mark]')).toBe("In project"));
    expect(document.querySelector('[data-module-manager-add-from-card="catalog:tatolab-camera"]')).toBeNull();
    expect(textOf("[data-module-manager-in-progress]")).toBe("Nothing in progress");
  });

  it("adds a package from its page under the project's name, then says it is in the project and names the nodes it brought", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await shown('[data-module-manager-row="catalog:tatolab-compositor"]');

    openThePageOf("catalog:tatolab-compositor");
    await shown('[data-module-manager-detail="catalog:tatolab-compositor"]');
    expect(textOf("[data-module-manager-whats-inside]")).toContain("LowerThird");
    expect(textOf('[data-module-manager-import="tatolab-compositor"]')).toBe("Add to Pulse Stage");
    pressed('[data-module-manager-import="tatolab-compositor"]');

    await shown('[data-module-manager-added="catalog:tatolab-compositor"]');
    expect(textOf('[data-module-manager-added="catalog:tatolab-compositor"]')).toContain("Compositor is in Pulse Stage");
    expect(textOf('[data-module-manager-added="catalog:tatolab-compositor"]')).toContain("LowerThird");
    expect(document.querySelector('[data-module-manager-import="tatolab-compositor"]')).toBeNull();
    pressed("[data-module-manager-view-in-project]");
    await waitFor(() => expect(shownTab()).toBe("added_to_this_project"));
    await shown('[data-module-manager-row="catalog:tatolab-compositor"]');
  });

  it("shows a refused add in its own words on the module's page, changes nothing, and Retry asks again", async () => {
    let timesAsked = 0;
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      importFromTheMarketplace: () => {
        timesAsked += 1;
        return Promise.reject("https://get.tatolab.com/modules/tatolab-camera-0.68.29.zip downloaded with the SHA-256 28f8, not the catalog's 4f7a; nothing was imported.");
      },
    });
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-import]") === null ? expect.unreachable("no Add") : "[data-module-manager-import]")));

    await waitFor(() => expect(textOf("[data-module-manager-refusal-words]")).toBe("https://get.tatolab.com/modules/tatolab-camera-0.68.29.zip downloaded with the SHA-256 28f8, not the catalog's 4f7a; nothing was imported."));
    expect(textOf('[data-module-manager-refusal="catalog:tatolab-camera"]')).toContain("Camera was not added");
    expect(textOf('[data-module-manager-refusal="catalog:tatolab-camera"]')).toContain("Nothing in Pulse Stage changed.");
    pressed("[data-module-manager-retry]");
    await waitFor(() => expect(timesAsked).toBe(2));
  });

  it("shows a Marketplace add's download with its bytes, then its check and its adding, on its page, offering Cancel only while it downloads", async () => {
    const progressListeners = new Set<(progressed: MarketplaceImportProgressed) => void>();
    let answerTheImport: (imported: MarketplaceImport) => void = () => expect.unreachable("no import asked");
    const namesCancelled: string[] = [];
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      importFromTheMarketplace: () => new Promise((answer) => (answerTheImport = answer)),
      cancelMarketplaceImport: async (name) => {
        namesCancelled.push(name);
      },
      onMarketplaceImportProgressed: (listener) => {
        progressListeners.add(listener);
        return () => progressListeners.delete(listener);
      },
    });
    const told = (stage: MarketplaceImportStage) => act(() => progressListeners.forEach((listener) => listener({ name: "tatolab-camera", stage })));
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-import]") === null ? expect.unreachable("no Add") : "[data-module-manager-import]")));
    await shown('[data-module-manager-work="catalog:tatolab-camera"]');

    told({ kind: "downloading", bytes_read: 12_300_000, bytes_total: 41_000_000 });
    await shown('[data-module-manager-add-stage="downloading"]');
    expect(textOf('[data-module-manager-work="catalog:tatolab-camera"]')).toContain("Downloading Camera…");
    expect(textOf('[data-module-manager-work="catalog:tatolab-camera"]')).toContain("12.3 MB of 41.0 MB");
    expect(textOf('[data-module-manager-work="catalog:tatolab-camera"]')).toContain("30%");
    pressed('[data-module-manager-cancel-add="catalog:tatolab-camera"]');
    await waitFor(() => expect(namesCancelled).toEqual(["tatolab-camera"]));
    expect(textOf('[data-module-manager-cancel-add="catalog:tatolab-camera"]')).toBe("Cancelling…");

    told({ kind: "verifying", sha256: "4f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70" });
    await shown('[data-module-manager-add-stage="verifying"]');
    expect(textOf('[data-module-manager-work="catalog:tatolab-camera"]')).toContain("The catalog's SHA-256: 4f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70");
    expect(document.querySelector("[data-module-manager-cancel-add]")).toBeNull();

    told({ kind: "adding" });
    await shown('[data-module-manager-add-stage="adding"]');
    expect(textOf('[data-module-manager-work="catalog:tatolab-camera"]')).toContain("Adding Camera to Pulse Stage…");
    act(() => answerTheImport({ kind: "imported", dependency: { project: "tatolab-camera", folder: "tatolab-camera", source: "/downloads/tatolab-camera-0.68.29.zip", version: "0.68.29" } }));
    await shown('[data-module-manager-added="catalog:tatolab-camera"]');
  });

  it("stops a download on Cancel and offers Add again, nothing in the project changed", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&marketplace_add=never_ends");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-import]") === null ? expect.unreachable("no Add") : "[data-module-manager-import]")));

    await shown('[data-module-manager-cancel-add="catalog:tatolab-camera"]');
    pressed('[data-module-manager-cancel-add="catalog:tatolab-camera"]');

    await shown('[data-module-manager-import="tatolab-camera"]');
    expect(document.querySelector('[data-module-manager-work="catalog:tatolab-camera"]')).toBeNull();
    expect(document.querySelector("[data-module-manager-refusal]")).toBeNull();
    expect(document.querySelector('[data-module-manager-added="catalog:tatolab-camera"]')).toBeNull();
  });

  it("offers a sample only Clone sample, which makes a project of its own and leaves the open project's modules as they were", async () => {
    let foldersShown: string[] = [];
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open")));
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      cloneMarketplaceSample: (name) => backendOverTheMock.cloneMarketplaceSample(name),
      openRecentProject: async (folder) => {
        await backendOverTheMock.openRecentProject(folder);
        foldersShown = [...foldersShown, folder];
      },
    });
    await shown('[data-module-manager-row="catalog:camera-halftone"]');
    expect(document.querySelector('[data-module-manager-add-from-card="catalog:camera-halftone"]')).toBeNull();

    openThePageOf("catalog:camera-halftone");
    await shown('[data-module-manager-clone="camera-halftone"]');
    expect(document.querySelector("[data-module-manager-import]")).toBeNull();
    expect(document.body.textContent).not.toContain("Open sample");
    pressed('[data-module-manager-clone="camera-halftone"]');

    await shown('[data-module-manager-cloned="catalog:camera-halftone"]');
    expect(textOf('[data-module-manager-cloned="catalog:camera-halftone"]')).toContain("Pulse Stage was not changed.");
    pressed("[data-module-manager-show-cloned-project]");
    await waitFor(() => expect(foldersShown).toEqual(["/Users/jonathanf/Documents/Tato Studio/Camera halftone"]));
    expect(document.querySelector("[data-module-manager-show-cloned-project-refusal]")).toBeNull();
    pressed('[data-module-manager-show="added_to_this_project"]');
    await shown('[data-module-manager-row="import:lobby-wall"]');
    expect(document.querySelector('[data-module-manager-row="catalog:camera-halftone"]')).toBeNull();
  });

  it("says on the sample's page why its new project was not shown", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open", { openRecentProject: () => Promise.reject("The project's folder is gone.") });
    await shown('[data-module-manager-row="catalog:camera-halftone"]');
    openThePageOf("catalog:camera-halftone");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-clone]") === null ? expect.unreachable("no Clone sample") : "[data-module-manager-clone]")));
    await shown("[data-module-manager-show-cloned-project]");

    pressed("[data-module-manager-show-cloned-project]");

    await waitFor(() => expect(textOf("[data-module-manager-show-cloned-project-refusal]")).toBe("The new project was not shown: The project's folder is gone."));
    expect(document.querySelector('[data-module-manager-cloned="catalog:camera-halftone"]')).not.toBeNull();
  });

  it("offers no second Add of a package just added while the project's modules are read again, on its page or its card", async () => {
    let timesListed = 0;
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open")));
    await mountedWindowOverTheMock("state=running&module_manager=open", {
      listWorkspaceDependencies: (checkForNewer) => {
        timesListed += 1;
        return timesListed === 1 ? backendOverTheMock.listWorkspaceDependencies(checkForNewer) : new Promise(() => undefined);
      },
      importFromTheMarketplace: (name) => backendOverTheMock.importFromTheMarketplace(name),
    });
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-import]") === null ? expect.unreachable("no Add") : "[data-module-manager-import]")));

    await shown('[data-module-manager-added="catalog:tatolab-camera"]');
    expect(timesListed).toBeGreaterThan(1);
    expect(document.querySelector("[data-module-manager-import]")).toBeNull();
    pressed("[data-module-manager-back]");
    await shown('[data-module-manager-row="catalog:tatolab-camera"] [data-module-card-mark="quiet"]');
    expect(document.querySelector('[data-module-manager-add-from-card="catalog:tatolab-camera"]')).toBeNull();
  });

  it("says a package was just added only until its page is left: opened again, the page offers what a module of the project is offered", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-import]") === null ? expect.unreachable("no Add") : "[data-module-manager-import]")));
    await shown('[data-module-manager-added="catalog:tatolab-camera"]');
    await waitFor(() => expect(textOf('[data-module-manager-show="added_to_this_project"]')).toBe("Pulse Stage2"));

    pressed("[data-module-manager-back]");
    pressed('[data-module-manager-show="added_to_this_project"]');
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");

    await shown('[data-module-manager-in-project="catalog:tatolab-camera"]');
    expect(document.querySelector("[data-module-manager-added]")).toBeNull();
    expect(textOf("[data-module-manager-detail] [data-module-manager-remove]")).toBe("Uninstall…");
    expect(document.querySelector("[data-module-manager-detail] [data-module-manager-update]")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("marks a card refused, not as news, when its Add is refused, and offers Add again", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&marketplace_add=refused");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');

    pressed('[data-module-manager-add-from-card="catalog:tatolab-camera"]');

    await waitFor(() => expect(textOf('[data-module-manager-row="catalog:tatolab-camera"] [data-module-card-mark="refused"]')).toBe("Not added"));
    expect(document.querySelector('[data-module-manager-add-from-card="catalog:tatolab-camera"]')).not.toBeNull();
  });

  it("keeps a module in a folder of a sample's name apart from the sample: removing it leaves the sample's card as it was", async () => {
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open")));
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project", {
      listWorkspaceDependencies: async (checkForNewer) => (await backendOverTheMock.listWorkspaceDependencies(checkForNewer)).map((dependency) => ({ ...dependency, folder: "camera-halftone", name: "Camera halftone" })),
      removeWorkspaceDependency: () => new Promise(() => undefined),
    });
    await shown('[data-module-manager-row="import:camera-halftone"]');

    await chosenFromTheActionsOf("camera-halftone", "remove");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-confirm-remove]") === null ? expect.unreachable("no Remove") : "[data-module-manager-confirm-remove]")));
    await waitFor(() => expect(textOf("[data-module-manager-in-progress]")).toBe("Uninstalling Camera halftone…"));
    pressed('[data-module-manager-show="marketplace"]');

    await shown('[data-module-manager-row="catalog:camera-halftone"]');
    expect(document.querySelector('[data-module-manager-row="catalog:camera-halftone"] [data-module-card-pending]')).toBeNull();
    expect(moduleManagerRow("catalog:camera-halftone").getAttribute("aria-busy")).toBe("false");
  });

  it("says a refused removal in the runtime's words, and under a module's row why its source could not be checked, in full", async () => {
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open")));
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project&module_remove=refused", {
      listWorkspaceDependencies: async (checkForNewer) =>
        (await backendOverTheMock.listWorkspaceDependencies(checkForNewer)).map((dependency) => ({ ...dependency, check_refused_because: checkForNewer ? "/Users/jonathanf/streams/lobby-wall could not be read: no folder or file is there" : null })),
    });
    await shown('[data-module-manager-row="import:lobby-wall"]');

    pressed("[data-module-manager-check-for-updates]");
    await waitFor(() =>
      expect(textOf('[data-module-manager-check-refusal="import:lobby-wall"]')).toBe("Where it was copied from could not be checked: /Users/jonathanf/streams/lobby-wall could not be read: no folder or file is there"),
    );
    await chosenFromTheActionsOf("lobby-wall", "remove");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-confirm-remove]") === null ? expect.unreachable("no Remove") : "[data-module-manager-confirm-remove]")));

    await waitFor(() => expect(textOf('[data-module-manager-refusal="import:lobby-wall"]')).toContain("remove_dependency failed: the project still uses the import"));
    expect(textOf('[data-module-manager-refusal="import:lobby-wall"]')).toContain("reference it; remove them first");
  });

  it("keeps a module's refusal under its row when the catalog is read after the project's modules", async () => {
    const backendOverTheMock = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&module_manager=open&module_remove=refused")));
    let serveTheCatalog: () => void = () => undefined;
    await mountedWindowOverTheMock("state=running&module_manager=open&module_manager_section=added_to_this_project&module_remove=refused", {
      listWorkspaceDependencies: async (checkForNewer) => (await backendOverTheMock.listWorkspaceDependencies(checkForNewer)).map((dependency) => ({ ...dependency, folder: "tatolab-camera", name: "Tatolab_Camera" })),
      readPackageCatalog: () =>
        new Promise((resolve) => {
          serveTheCatalog = () => void backendOverTheMock.readPackageCatalog().then(resolve);
        }),
    });
    await shown('[data-module-manager-row="import:tatolab-camera"]');
    await chosenFromTheActionsOf("tatolab-camera", "remove");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-confirm-remove]") === null ? expect.unreachable("no Remove") : "[data-module-manager-confirm-remove]")));
    await shown('[data-module-manager-refusal="import:tatolab-camera"]');

    await act(async () => serveTheCatalog());

    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    expect(textOf('[data-module-manager-refusal="catalog:tatolab-camera"]')).toContain("remove_dependency failed: the project still uses the import");
  });

  it("puts the keyboard's focus on Back when a module's page opens, and back on its card when the page closes", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');

    openThePageOf("catalog:tatolab-camera");
    await shown('[data-module-manager-detail="catalog:tatolab-camera"]');
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[data-module-manager-back]")));

    fireEvent.keyDown(document.querySelector("[data-module-manager-back]") ?? expect.unreachable("no Back"), { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-module-manager-detail]")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-module-manager-row="catalog:tatolab-camera"] [data-module-card-open]')));
  });

  it("keeps the keyboard's focus in the window when the control it was on goes: on the card or Back after Add, on the tab after a removal", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    const focusedAndPressed = (selector: string) => {
      const control = document.querySelector<HTMLElement>(selector) ?? expect.unreachable(`no ${selector}`);
      act(() => control.focus());
      fireEvent.click(control);
    };

    focusedAndPressed('[data-module-manager-add-from-card="catalog:tatolab-camera"]');
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-module-manager-row="catalog:tatolab-camera"] [data-module-card-open]')));

    openThePageOf("catalog:tatolab-microphone");
    focusedAndPressed(await waitFor(() => (document.querySelector("[data-module-manager-import]") === null ? expect.unreachable("no Add") : "[data-module-manager-import]")));
    await shown('[data-module-manager-added="catalog:tatolab-microphone"]');
    expect(document.activeElement).toBe(document.querySelector("[data-module-manager-back]"));

    pressed("[data-module-manager-back]");
    pressed('[data-module-manager-show="added_to_this_project"]');
    await shown('[data-module-manager-row="import:lobby-wall"]');
    await chosenFromTheActionsOf("lobby-wall", "remove");
    pressed(await waitFor(() => (document.querySelector("[data-module-manager-confirm-remove]") === null ? expect.unreachable("no Remove") : "[data-module-manager-confirm-remove]")));
    await waitFor(() => expect(document.querySelector('[data-module-manager-row="import:lobby-wall"]')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-module-manager-show="added_to_this_project"]')));
  });

  it("leaves the tabs their own arrow keys while a module's page is open", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    await shown('[data-module-manager-detail="catalog:tatolab-camera"]');

    fireEvent.keyDown(document.querySelector('[data-module-manager-show="marketplace"]') ?? expect.unreachable("no tab"), { key: "ArrowRight" });

    expect(document.querySelector('[data-module-manager-detail="catalog:tatolab-camera"]')).not.toBeNull();
  });

  it("goes back from a module's page on Escape, and to the next and previous module on the arrow keys", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open");
    await shown('[data-module-manager-row="catalog:tatolab-camera"]');
    openThePageOf("catalog:tatolab-camera");
    await shown('[data-module-manager-detail="catalog:tatolab-camera"]');

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    await shown('[data-module-manager-detail="catalog:tatolab-microphone"]');
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    await shown('[data-module-manager-detail="catalog:tatolab-camera"]');
    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => expect(document.querySelector("[data-module-manager-detail]")).toBeNull());
    expect(shownTab()).toBe("marketplace");
  });

  it("offers no Add of a package needing a newer runtime, on its card or its page, which says the runtime it needs and checks for a newer Tato Studio instead", async () => {
    let timesChecked = 0;
    await mountedWindowOverTheMock("state=running&module_manager=open&catalog=newer_runtime", {
      checkForTatolabAppUpdates: async () => {
        timesChecked += 1;
      },
    });
    await shown('[data-module-manager-row="catalog:tatolab-microphone"]');

    expect(document.querySelector('[data-module-manager-add-from-card="catalog:tatolab-microphone"]')).toBeNull();
    expect(document.querySelector('[data-module-manager-add-from-card="catalog:tatolab-camera"]')).not.toBeNull();
    expect(textOf('[data-module-manager-row="catalog:tatolab-microphone"]')).toContain("Needs a newer Tato Studio");
    openThePageOf("catalog:tatolab-microphone");
    await shown('[data-module-manager-needs-a-newer-runtime="tatolab-microphone"]');
    expect(textOf('[data-module-manager-needs-a-newer-runtime="tatolab-microphone"]')).toBe("Microphone runs on runtime 0.69.44 or later, which a newer Tato Studio carries. Update Tato Studio to add it.");
    expect(document.querySelector("[data-module-manager-import]")).toBeNull();
    pressed('[data-module-manager-update-tato-studio="tatolab-microphone"]');
    await waitFor(() => expect(timesChecked).toBe(1));
  });

  it("says why the catalog didn't load, and still lists the project's modules", async () => {
    await mountedWindowOverTheMock("state=running&module_manager=open&catalog=unserved");

    await shown('[data-module-manager-state="not_read"]');
    expect(textOf('[data-module-manager-state="not_read"]')).toContain("HTTP 404 Not Found");
    pressed('[data-module-manager-show="added_to_this_project"]');
    await shown('[data-module-manager-row="import:lobby-wall"]');
  });
});
