// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountedWindowOverTheMock, pressAsAPointerDoes, coreViewPage, showInTheLibrary, libraryRow, showTheLibraryInTheViewerArea, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

describe("the studio", () => {
  it("closes the view-type menu on a choice, and lists in the Library each source's node types by category, its generators under Show, and says why a module does not parse", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();

    await waitFor(() => libraryRow("source:project"));
    expect(libraryRow("source:project").textContent).toBe("This project");
    expect(coreViewPage("library").querySelector('[data-tree-row-id="source:project/graph_generators"]')).toBeNull();
    expect(libraryRow("source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11").textContent).toBe("imports/stage-lights");
    expect(libraryRow("source:distribution:tatolab-testpattern").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(libraryRow("source:project/unreadable:nodes.half_written"));
    await waitFor(() => expect(coreViewPage("library").querySelector('[data-library-unreadable-why="nodes.half_written"]')?.textContent).toBe("SyntaxError: expected ':'"));
    const dimmer = "imports/stage-lights/nodes.dimmer:Dimmer";
    fireEvent.click(libraryRow(`source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11/category:Lighting/node_type:${dimmer}`));
    await waitFor(() => expect(coreViewPage("library").querySelector(`[data-library-details="${dimmer}"]`)).not.toBeNull());
    expect(coreViewPage("library").querySelector('[data-library-port="picture"]')?.textContent).toContain("picture");
    expect(coreViewPage("library").querySelector('[data-library-port="dimmed"]')?.textContent).toContain("dimmed");

    await showInTheLibrary("graph_generators");
    await waitFor(() => expect(libraryRow("source:project/graph_generators/generators.glow_looks:warm_glow").textContent).toBe("warm_glow"));
    expect(coreViewPage("library").querySelector('[data-tree-row-id="source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11"]')).toBeNull();
  });

  it("moves a node type into a group typed from its row's right-click menu and puts it back, a group with a blank name refused in the runtime's words", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();

    const library = coreViewPage("library");
    const stageLights = "source:dependency:6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11";
    const dimmer = "imports/stage-lights/nodes.dimmer:Dimmer";
    const chooseFromTheRowsMenu = async (rowId: string, choice: string) => {
      fireEvent.contextMenu(await waitFor(() => libraryRow(rowId)));
      // A fake core view frame is drawn by the window's own React, so its menu's portal opens in the window's document.
      fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-library-node-type-choice="${choice}"]`) ?? expect.unreachable(`no ${choice} in the menu of ${rowId}`)));
    };
    const groupField = () => library.querySelector<HTMLInputElement>("[data-library-node-type-group-field]") ?? expect.unreachable("no Group field");
    const pressMove = () => fireEvent.click(library.querySelector<HTMLElement>('[data-library-node-type-group-action="move"]') ?? expect.unreachable("no Move button"));

    fireEvent.click(await waitFor(() => libraryRow(`${stageLights}/category:Lighting/node_type:${dimmer}`)));
    await chooseFromTheRowsMenu(`${stageLights}/category:Lighting/node_type:${dimmer}`, "move_to_group");
    await waitFor(() => expect(groupField().value).toBe("Lighting"));
    fireEvent.change(groupField(), { target: { value: "Show//Levels" } });
    pressMove();
    const refusal = await waitFor(() => library.querySelector<HTMLElement>("[data-library-node-type-group-refusal]") ?? expect.unreachable("no refusal"));
    expect(refusal.textContent).toContain('set_node_type_group failed: "Show//Levels" cannot file `imports/stage-lights/nodes.dimmer:Dimmer`: a group is one or more names split by `/`, none of them blank, as `Effects/Stylize`');
    fireEvent.change(groupField(), { target: { value: "Show/Levels" } });
    pressMove();
    const movedRowId = `${stageLights}/category:Show/Levels/node_type:${dimmer}`;
    await waitFor(() => libraryRow(movedRowId));
    await waitFor(() => expect(library.querySelector("[data-library-node-type-group-form]")).toBeNull());
    expect(library.querySelector(`[data-tree-row-id="${stageLights}/category:Lighting/node_type:${dimmer}"]`)).toBeNull();
    // The node type chosen before the move is still chosen at its new row, its details saying the project files it there.
    await waitFor(() => expect(library.querySelector(`[data-library-details="${dimmer}"]`)?.textContent).toContain("GroupShow / LevelsFiled byThis project"));
    expect(libraryRow(movedRowId).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-node-type-action="put_back"]') ?? expect.unreachable("no Put back button in the details"));
    await waitFor(() => libraryRow(`${stageLights}/category:Lighting/node_type:${dimmer}`));
    expect(library.querySelector(`[data-tree-row-id="${movedRowId}"]`)).toBeNull();
    fireEvent.contextMenu(libraryRow(`${stageLights}/category:Lighting/node_type:${dimmer}`));
    await waitFor(() => document.querySelector('[data-library-node-type-choice="move_to_group"]') ?? expect.unreachable("no menu"));
    expect(document.querySelector('[data-library-node-type-choice="put_back"]')).toBeNull();
  });

  it("shows the project's assets in the Library by folder, narrowed by the search, the card pressed outlined and no details beside it, its graph documents left out", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    const assetCardPaths = () => [...library.querySelectorAll<HTMLElement>("[data-library-asset]")].map((card) => card.dataset.libraryAsset);
    await waitFor(() => expect(assetCardPaths()).toEqual(["luts/warm.cube", "media/lobby-intro.mp4", "media/poster.png", "scenes/stage.usdz"]));
    expect([...library.querySelectorAll<HTMLElement>("[data-library-asset-folder]")].map((folder) => folder.textContent)).toEqual(["All assets4", "luts1", "media2", "scenes1"]);
    expect(library.querySelector('[data-library-asset="media/lobby-intro.mp4"]')?.textContent).toBe("MP4lobby-intro.mp4media · 40 MB");

    const folderMenu = library.querySelector<HTMLElement>("[data-library-asset-folder-menu]") ?? expect.unreachable("no Folder menu");
    pressAsAPointerDoes(folderMenu);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^scenes/ }));
    await waitFor(() => expect(assetCardPaths()).toEqual(["scenes/stage.usdz"]));
    expect(folderMenu.getAttribute("aria-label")).toBe("Folder: scenes");

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-asset-folder="folder:media"]') ?? expect.unreachable("no media folder"));
    await waitFor(() => expect(assetCardPaths()).toEqual(["media/lobby-intro.mp4", "media/poster.png"]));
    expect(folderMenu.getAttribute("aria-label")).toBe("Folder: media");
    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-asset-search]") ?? expect.unreachable("no search field"), { target: { value: "POSTER" } });
    await waitFor(() => expect(assetCardPaths()).toEqual(["media/poster.png"]));

    const posterCard = library.querySelector<HTMLElement>('[data-library-asset="media/poster.png"]') ?? expect.unreachable("no poster card");
    fireEvent.click(posterCard);
    await waitFor(() => expect(posterCard.getAttribute("aria-pressed")).toBe("true"));
    expect(posterCard.textContent).toBe("PNGposter.pngmedia · 11 KB");
    expect(library.querySelector("aside")).toBeNull();
  });

  it("shows each asset's preview picture on its card, an asset with none keeping its tinted card", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    const cardPicture = (assetPath: string) =>
      library.querySelector<HTMLElement>(`[data-library-asset="${assetPath}"] [data-project-asset-picture]`) ?? expect.unreachable(`no picture on ${assetPath}`);
    await waitFor(() => expect(cardPicture("media/lobby-intro.mp4").dataset.projectAssetPicture).toBe("preview"));
    await waitFor(() => expect(cardPicture("media/poster.png").dataset.projectAssetPicture).toBe("preview"));
    expect(cardPicture("media/lobby-intro.mp4").querySelector("img")?.getAttribute("src")).toMatch(/^data:image\//);
    expect(cardPicture("luts/warm.cube").dataset.projectAssetPicture).toBe("tinted");
    expect(cardPicture("scenes/stage.usdz").dataset.projectAssetPicture).toBe("tinted");
  });

  it("keeps an asset's card tinted when the runtime refuses its preview picture, the runtime's words under it", async () => {
    const refusal = "read_asset_preview failed: no file is at asset 207ef246-3d00-4167-b394-bb591f7c4b8f's path";
    await mountedWindowOverTheMock("state=running", {
      readAssetPreviewOfTheOpenProject: async () => {
        throw refusal;
      },
    });
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("assets");
    const library = coreViewPage("library");
    const videoCard = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset="media/lobby-intro.mp4"]') ?? expect.unreachable("no video card"));
    await waitFor(() => expect(videoCard.parentElement?.querySelector("[data-project-asset-preview-refusal]")?.textContent).toContain(refusal));
    expect(videoCard.querySelector<HTMLElement>("[data-project-asset-picture]")?.dataset.projectAssetPicture).toBe("tinted");
  });

  it("lists in the Library the views the project and its imports bring by who brought them, Studio's own last, with the chosen view's ports or why it does not open", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture");
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("views");

    const library = coreViewPage("library");
    const viewRowIds = () => [...library.querySelectorAll<HTMLElement>("[data-library-view]")].map((row) => row.dataset.libraryView);
    await waitFor(() => expect(viewRowIds().slice(0, 2)).toEqual(["pattern/pattern:picture_and_fader", "lobby-wall/lobby-wall:stage_rig"]));
    expect(viewRowIds()).toContain("Tato Studio/outliner");
    expect(viewRowIds()).not.toContain("Tato Studio/transactions");
    expect(library.querySelector('[data-library-view="pattern/pattern:picture_and_fader"]')?.textContent).toContain("Picture and fader · 1 in · 1 out");
    const details = () => library.querySelector<HTMLElement>("[data-library-view-details]") ?? expect.unreachable("no view details");
    expect(details().dataset.libraryViewDetails).toBe("pattern/pattern:picture_and_fader");
    expect([...details().querySelectorAll<HTMLElement>("[data-library-view-port]")].map((port) => port.dataset.libraryViewPort)).toEqual(["picture", "fader"]);

    fireEvent.click(library.querySelector<HTMLElement>('[data-library-view="lobby-wall/lobby-wall:stage_rig"]') ?? expect.unreachable("no Stage rig row"));
    await waitFor(() => expect(details().dataset.libraryViewDetails).toBe("lobby-wall/lobby-wall:stage_rig"));
    expect(details().textContent).toContain("`contract`: this runtime reads view contract 1.0.");

    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-view-search]") ?? expect.unreachable("no search field"), { target: { value: "fader" } });
    await waitFor(() => expect(viewRowIds()).toEqual(["pattern/pattern:picture_and_fader"]));
  });

  it("imports the file the person chooses, which the runtime places in its kind's folder, shows it at once and outlines its card", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    await waitFor(() => library.querySelector('[data-library-asset="luts/warm.cube"]') ?? expect.unreachable("no assets listed"));
    fireEvent.click(library.querySelector<HTMLElement>("[data-library-import-asset]") ?? expect.unreachable("no Import asset button"));

    const imported = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset="media/night-sky.jpg"]') ?? expect.unreachable("the imported file is not shown"));
    expect(imported.textContent).toBe("JPGnight-sky.jpgmedia · 2.2 MB");
    await waitFor(() => expect(imported.getAttribute("aria-pressed")).toBe("true"));
    expect(library.querySelector("[data-library-import-refused]")).toBeNull();
  });

  it("renames, moves and deletes an asset from its card's ⋯ menu through the runtime, a path another asset takes refused in its words", async () => {
    await mountedWindowOverTheMock("state=running");
    await showTheLibraryInTheViewerArea();
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    const chooseFromTheCardsMenu = async (assetPath: string, change: string) => {
      const card = await waitFor(() => library.querySelector<HTMLElement>(`[data-library-asset="${assetPath}"]`) ?? expect.unreachable(`no card for ${assetPath}`));
      pressAsAPointerDoes(card.parentElement?.querySelector<HTMLElement>("[data-project-asset-more-actions]") ?? expect.unreachable(`no ⋯ menu on ${assetPath}`));
      // A fake core view frame is drawn by the window's own React, so its menu's portal opens in the window's document.
      fireEvent.click(await waitFor(() => document.querySelector<HTMLElement>(`[data-library-asset-change="${change}"]`) ?? expect.unreachable(`no ${change} in the ⋯ menu`)));
    };
    const formField = () => library.querySelector<HTMLInputElement>("[data-library-asset-change-field]") ?? expect.unreachable("no form field");
    const pressTheForms = (action: string) => fireEvent.click(library.querySelector<HTMLElement>(`[data-library-asset-change-action="${action}"]`) ?? expect.unreachable(`no ${action} button`));

    await chooseFromTheCardsMenu("media/poster.png", "rename");
    await waitFor(() => expect(formField().value).toBe("poster.png"));
    fireEvent.change(formField(), { target: { value: "lobby-intro.mp4" } });
    pressTheForms("rename");
    const refusal = await waitFor(() => library.querySelector<HTMLElement>("[data-library-asset-change-refusal]") ?? expect.unreachable("no refusal"));
    expect(refusal.textContent).toContain("relocate_asset failed: `media/lobby-intro.mp4` is already the path of the asset 207ef246-3d00-4167-b394-bb591f7c4b8f");
    fireEvent.change(formField(), { target: { value: "harbour-poster.png" } });
    pressTheForms("rename");
    await waitFor(() => expect(library.querySelector('[data-library-asset="media/harbour-poster.png"]')).not.toBeNull());
    await waitFor(() => expect(library.querySelector("[data-library-asset-change-form]")).toBeNull());
    await waitFor(() => expect(library.activeElement?.closest("[data-project-asset-more-actions]")?.parentElement?.parentElement?.querySelector("[data-library-asset]")?.getAttribute("data-library-asset")).toBe("media/harbour-poster.png"));

    await chooseFromTheCardsMenu("media/harbour-poster.png", "move");
    await waitFor(() => expect(formField().value).toBe("media"));
    fireEvent.change(formField(), { target: { value: "media/posters" } });
    expect(library.querySelector("[data-library-asset-change-lands-at]")?.textContent).toBe("media/posters/harbour-poster.png");
    pressTheForms("move");
    await waitFor(() => expect(library.querySelector('[data-library-asset="media/posters/harbour-poster.png"]')).not.toBeNull());
    await waitFor(() => expect(library.querySelector("[data-library-asset-change-form]")).toBeNull());

    await chooseFromTheCardsMenu("media/posters/harbour-poster.png", "delete");
    await waitFor(() => library.querySelector('[data-library-asset-change-action="delete"]') ?? expect.unreachable("no Delete button"));
    pressTheForms("delete");
    await waitFor(() => expect(library.querySelector('[data-library-asset="media/posters/harbour-poster.png"]')).toBeNull());
    expect(library.querySelector("[data-library-asset-change-form]")).toBeNull();
  });

  it("shows each file the runtime refused to import in its words, beside the file it imported, the search cleared so the import shows", async () => {
    await mountedWindowOverTheMock("state=running&asset_import=refuses_one");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));
    await showInTheLibrary("assets");

    const library = coreViewPage("library");
    await waitFor(() => library.querySelector('[data-library-asset="luts/warm.cube"]') ?? expect.unreachable("no assets listed"));
    fireEvent.change(library.querySelector<HTMLInputElement>("[data-library-asset-search]") ?? expect.unreachable("no search field"), { target: { value: "cube" } });
    fireEvent.click(library.querySelector<HTMLElement>("[data-library-import-asset]") ?? expect.unreachable("no Import asset button"));

    const refusal = await waitFor(() => library.querySelector<HTMLElement>("[data-library-import-refused]") ?? expect.unreachable("no refusal"));
    expect(refusal.textContent).toBe("Didn't import main.graph.json: import_asset failed: `data/main.graph.json` is not an asset path: it names a stream's graph document, which only the stream verbs write");
    expect(library.querySelector<HTMLInputElement>("[data-library-asset-search]")?.value).toBe("");
    const imported = await waitFor(() => library.querySelector<HTMLElement>('[data-library-asset="media/night-sky.jpg"]') ?? expect.unreachable("the imported file is not shown"));
    await waitFor(() => expect(imported.getAttribute("aria-pressed")).toBe("true"));
  });

  it("lists in an area's view-type menu each view with who brought it, and a view that does not open as a row that cannot be chosen, with why", async () => {
    await mountedWindowOverTheMock("state=running&studio_views=fixture");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));

    expect((await screen.findByRole("menuitemradio", { name: /^Outliner/ })).textContent).toBe("OutlinerTato Studio");
    expect((await screen.findByRole("menuitemradio", { name: /^Picture and fader/ })).textContent).toBe("Picture and faderpattern");
    const stageRigRow = document.querySelector<HTMLElement>('[data-view-type-not-opened="lobby-wall:stage_rig"]') ?? expect.unreachable("no row for the view that does not open");
    expect(stageRigRow.textContent).toBe("Stage riglobby-wall");
    expect(stageRigRow.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(stageRigRow.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Stage rig doesn't open: `contract`: this runtime reads view contract 1.0.");
  });

  it("offers Transactions only in Developer mode, listing the open project's transactions with their author, stream and operations, and each one's detail", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    await screen.findByRole("menuitemradio", { name: /^Library/ });
    expect(screen.queryByRole("menuitemradio", { name: /^Transactions/ })).toBeNull();

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&developer_mode=on");
    const developerViewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(developerViewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Transactions/ }));

    const transactionRows = () => [...coreViewPage("transactions").querySelectorAll<HTMLElement>("[data-record-table-row]")];
    await waitFor(() => expect(transactionRows().length).toBeGreaterThan(0));
    const rowWords = transactionRows().map((row) => [...row.querySelectorAll("td")].slice(1, 6).map((cell) => cell.textContent));
    expect(rowWords).toContainEqual(["agent · claude-code", "main", "commit", "add_node", "applied"]);
    expect(rowWords[0]?.[3]).toBe("undo · set_node_config");

    const addedRow = transactionRows().find((row) => row.textContent?.includes("add_node")) ?? expect.unreachable("no add_node row");
    fireEvent.click(addedRow);
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-detail]")).not.toBeNull());
    expect(coreViewPage("transactions").querySelector("[data-transactions-detail-operations]")?.textContent).toContain('"operation": "add_node"');

    const refusedRow = transactionRows().find((row) => row.dataset.recordTableRowTone === "danger") ?? expect.unreachable("no refused row");
    expect([...refusedRow.querySelectorAll("td")].slice(1, 7).map((cell) => cell.textContent)).toEqual(["agent · claude-code", "project", "commit", "redo", "refused", "none"]);
    expect(refusedRow.querySelector('[data-status-chip-tone="danger"]')?.textContent).toBe("refused");
    fireEvent.click(refusedRow);
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-detail-refusal]")).not.toBeNull());
    expect(coreViewPage("transactions").querySelector("[data-transactions-detail-refusal]")?.textContent).toContain("claude-code has undone nothing that is left to redo");

    pressAsAPointerDoes(coreViewPage("transactions").querySelector<HTMLElement>("[data-transactions-log-menu]") ?? expect.unreachable("no log menu"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Pause the log" }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-transactions-paused-chip]")?.textContent).toBe("Paused"));
    pressAsAPointerDoes(coreViewPage("transactions").querySelector<HTMLElement>("[data-transactions-log-menu]") ?? expect.unreachable("no log menu"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear the view" }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector('[data-transactions-state="cleared"]')).not.toBeNull());
    expect(transactionRows()).toEqual([]);

    const downloadedFiles: { fileName: string; blob: Blob }[] = [];
    const blobsByUrl = new Map<string, Blob>();
    const madeFileUrl = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      const fileUrl = `blob:transactions-log-${blobsByUrl.size}`;
      if (blob instanceof Blob) blobsByUrl.set(fileUrl, blob);
      return fileUrl;
    });
    const revokedFileUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickedLink = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function recordTheDownload(this: HTMLAnchorElement) {
      const blob = blobsByUrl.get(this.href) ?? expect.unreachable("the download names no file made for it");
      downloadedFiles.push({ fileName: this.download, blob });
    });
    try {
      pressAsAPointerDoes(coreViewPage("transactions").querySelector<HTMLElement>("[data-transactions-log-menu]") ?? expect.unreachable("no log menu"));
      fireEvent.click(await screen.findByRole("menuitem", { name: "Download transaction logs" }));
    } finally {
      [madeFileUrl, revokedFileUrl, clickedLink].forEach((spy) => spy.mockRestore());
    }
    expect(downloadedFiles.map((file) => file.fileName)).toEqual(["pattern transactions.json"]);
    const downloadedLog: unknown = JSON.parse(await (downloadedFiles[0]?.blob ?? expect.unreachable("nothing downloaded")).text());
    expect(downloadedLog).toMatchObject({ transactions: expect.arrayContaining([expect.objectContaining({ author_name: "claude-code" })]), refused_actions: [expect.objectContaining({ author_name: "claude-code" })] });
  });

  it("offers no transaction log to download while the project's transactions aren't read", async () => {
    await mountedWindowOverTheMock("state=not-running&developer_mode=on");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Transactions/ }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector('[data-transactions-state="not_read"]')).not.toBeNull());

    const madeFileUrl = vi.spyOn(URL, "createObjectURL");
    try {
      pressAsAPointerDoes(coreViewPage("transactions").querySelector<HTMLElement>("[data-transactions-log-menu]") ?? expect.unreachable("no log menu"));
      const downloadItem = await screen.findByRole("menuitem", { name: "Download transaction logs" });
      expect(downloadItem.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(downloadItem);
      expect(madeFileUrl).not.toHaveBeenCalled();
    } finally {
      madeFileUrl.mockRestore();
    }
  });

  it("says an area left on Transactions shows it only in Developer mode once Developer mode is turned off", async () => {
    const { backend } = await mountedWindowOverTheMock("state=running&developer_mode=on");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Transactions/ }));
    await waitFor(() => expect(coreViewPage("transactions").querySelector("[data-record-table-row]")).not.toBeNull());

    await act(async () => {
      await backend.setDeveloperMode(false);
    });
    await waitFor(() => expect(document.querySelector('[data-studio-area="viewer"] [data-studio-area-held-for-developer-mode]')?.textContent).toContain("Transactions shows only in Developer mode"));
  });

  it("says in the runtime's own words why the Library lists no node types", async () => {
    await mountedWindowOverTheMock("state=not-running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^Library/ }));

    await waitFor(() => expect(coreViewPage("library").querySelector("[data-library-not-listed-because]")?.textContent).toMatch(/^no runtime answers at /));
  });

  it("lists the project's edits in History, newest first, and choosing an earlier one undoes back to it by each edit's author", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^History/ }));

    const historyRows = () => [...coreViewPage("history").querySelectorAll<HTMLElement>("[data-history-row]")];
    await waitFor(() =>
      expect(historyRows().map((row) => [row.getAttribute("aria-label")?.split(". ").slice(0, 2).join(". ").replace(/ · (?!undone)[^·]*?(?= · |$)/g, ""), row.hasAttribute("data-undone")])).toEqual([
        ["Set displaywindow scaling to fit. Sam · undone", true],
        ["Added brightnessmeter and its link. claude-code (agent)", false],
        ["Renamed invert to invertingeffect. Sam", false],
        ["Refreshed mic_levels from its code. Runtime", false],
        ["Imported warm.cube. Sam", false],
      ]),
    );

    fireEvent.click(historyRows()[2] ?? expect.unreachable("no rename row"));
    await waitFor(() => expect(historyRows()[1]?.hasAttribute("data-undone")).toBe(true));
    expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, true, false, false, false]);

    fireEvent.click(historyRows()[0] ?? expect.unreachable("no config row"));
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([false, false, false, false, false]));

    fireEvent.click(historyRows()[4] ?? expect.unreachable("no import row"));
    await waitFor(() => expect(coreViewPage("history").querySelector('[role="alert"]')?.textContent).toBe("History can't go back there: The runtime's own edit after it (Refreshed mic_levels from its code) can't be undone."));
  });

  it("follows a ⌘Z in the window in History, and scrolls the edit the project is at into view as it moves", async () => {
    await mountedWindowOverTheMock("state=running");
    const viewerArea = await waitFor(() => document.querySelector<HTMLElement>('[data-studio-area="viewer"]') ?? expect.unreachable("no viewer area"));
    pressAsAPointerDoes(viewerArea.querySelector<HTMLElement>("[data-area-view-type-menu]") ?? expect.unreachable("no view-type menu"));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /^History/ }));
    const historyRows = () => [...coreViewPage("history").querySelectorAll<HTMLElement>("[data-history-row]")];
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, false, false, false, false]));
    const historyPageElement = coreViewPage("history").defaultView?.Element ?? expect.unreachable("the History frame has no window");
    const rowsScrolledIntoView: (string | null)[] = [];
    historyPageElement.prototype.scrollIntoView = function scrollIntoViewRecorded(this: Element) {
      rowsScrolledIntoView.push(this.getAttribute("data-history-row"));
    };

    fireEvent.keyDown(document, { key: "z", metaKey: true });

    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, false, true, false, false]));
    expect(historyRows()[2]?.getAttribute("aria-label")).toContain("undone");

    fireEvent.click(historyRows()[3] ?? expect.unreachable("no runtime row"));
    await waitFor(() => expect(historyRows().map((row) => row.hasAttribute("data-undone"))).toEqual([true, true, true, false, false]));
    await waitFor(() => expect(rowsScrolledIntoView.at(-1)).toBe(historyRows()[3]?.getAttribute("data-history-row")));
    expect(coreViewPage("history").querySelector("[data-history]")?.textContent).toContain("Each row is one transaction from the project's change feed");
  });
});
