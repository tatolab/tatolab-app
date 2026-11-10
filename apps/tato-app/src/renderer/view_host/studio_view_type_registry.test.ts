import { describe, expect, it } from "vitest";
import { WatchedStudioValue } from "./in_window_view_host";
import type { JsonValue, StudioViewHostConnection, StudioViewType } from "./studio_view_contract";
import { registeredStudioViewType, StudioViewTypeRegistry, type StudioAreaOfTheView, type StudioViewHostServices } from "./studio_view_type_registry";

const HOST_SERVICES: StudioViewHostServices = {
  watchOpenProject: () => () => undefined,
  watchListedStreams: () => () => undefined,
  watchSelection: () => () => undefined,
  select: () => undefined,
  watchActiveStreamTab: () => () => undefined,
  openStreamTab: () => undefined,
  watchStreamGraph: () => () => undefined,
  watchNodeCatalog: () => () => undefined,
  watchCodeFileAsked: () => () => undefined,
  openCodeFile: () => undefined,
  openView: () => ({ kind: "not_opened", because: "no areas in this test" }),
  watchViewOpenedOn: () => () => undefined,
  readProjectFile: async () => ({ kind: "not_read", because: "no files in this test" }),
  saveProjectFile: async () => ({ kind: "not_saved", because: "no files in this test" }),
  listProjectFiles: async () => ({ kind: "not_listed", because: "no files in this test" }),
  watchProjectLog: () => () => undefined,
  watchProjectNodeTypes: () => () => undefined,
  watchProjectTransactions: () => () => undefined,
  undoInTheProject: async () => ({ kind: "not_applied", because: "no history in this test" }),
  redoInTheProject: async () => ({ kind: "not_applied", because: "no history in this test" }),
  connectToPythonLanguageServer: () => ({ send: () => undefined, close: () => undefined }),
  watchPortViewer: () => ({ close: () => undefined }),
};

/** A view type keeping a number, which records each connection it is drawn on. */
function countingViewType(viewTypeId: string, broughtBy: StudioViewType<number>["brought_by"], connections: StudioViewHostConnection<number>[]): StudioViewType<number> {
  return {
    view_type_id: viewTypeId,
    title: viewTypeId,
    icon: "outliner",
    brought_by: broughtBy,
    default_settings: 1,
    settingsFromSavedLayout: (saved: JsonValue) => (typeof saved === "number" ? saved : null),
    renderStudioView: (connection) => {
      connections.push(connection);
      return { header_tools: null, body: null };
    },
  };
}

describe("the view-type registry", () => {
  it("answers a view type by id, none for one this build lacks, and lists the studio's apart from the project's", () => {
    const registry = new StudioViewTypeRegistry([
      registeredStudioViewType(countingViewType("outliner", { kind: "built_in" }, [])),
      registeredStudioViewType(countingViewType("venue-3d", { kind: "project", project_name: "hall-of-light" }, [])),
    ]);
    expect(registry.viewTypeWithId("outliner")?.title).toBe("outliner");
    expect(registry.viewTypeWithId("rocket-assembly")).toBeNull();
    expect(registry.studioViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["outliner"]);
    expect(registry.projectViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["venue-3d"]);
  });

  it("offers a view type held for Developer mode only while Developer mode is on, last among the studio's", () => {
    const registry = new StudioViewTypeRegistry([registeredStudioViewType(countingViewType("outliner", { kind: "built_in" }, []))], null, [], [
      registeredStudioViewType(countingViewType("transactions", { kind: "built_in" }, [])),
    ]);
    expect(registry.studioViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["outliner"]);
    expect(registry.viewTypeWithId("transactions")).toBeNull();

    registry.developerMode.publish(true);
    expect(registry.studioViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["outliner", "transactions"]);
    expect(registry.viewTypeWithId("transactions")?.title).toBe("transactions");

    expect(registry.viewTypeHeldForDeveloperMode("transactions")).toBeNull();

    registry.developerMode.publish(false);
    expect(registry.viewTypeWithId("transactions")).toBeNull();
    expect(registry.viewTypeHeldForDeveloperMode("transactions")?.title).toBe("transactions");
    expect(registry.viewTypeHeldForDeveloperMode("outliner")).toBeNull();
  });

  it("draws a view on the settings its area saved, on its defaults where they no longer fit, and keeps the next ones with the area", () => {
    const connections: StudioViewHostConnection<number>[] = [];
    const kept: JsonValue[] = [];
    const viewType = registeredStudioViewType(countingViewType("counter", { kind: "built_in" }, connections));
    const areaSavedAs = (savedSettings: JsonValue | undefined): StudioAreaOfTheView => ({
      saved_settings: savedSettings,
      rememberSettings: (next) => kept.push(next),
      header_row: new WatchedStudioValue({ leading_inset_px: 0, height_px: 30 }),
    });
    viewType.renderInAnArea(areaSavedAs(7), HOST_SERVICES);
    viewType.renderInAnArea(areaSavedAs("seven"), HOST_SERVICES);
    viewType.renderInAnArea(areaSavedAs(undefined), HOST_SERVICES);
    connections[0]?.rememberSettings(8);

    expect(connections.map((connection) => connection.settings)).toEqual([7, 1, 1]);
    expect(kept).toEqual([8]);
  });

  it("lists the views the open project brings from their manifests, and each one that does not open with why", () => {
    const registry = new StudioViewTypeRegistry([registeredStudioViewType(countingViewType("outliner", { kind: "built_in" }, []))], (listed, manifest, projectName) =>
      registeredStudioViewType({ ...countingViewType(listed.view_type_id, { kind: "project", project_name: projectName }, []), title: manifest.title }),
    );
    const folder_url = "https://views.example/";
    registry.projectStudioViews.publish({
      kind: "listed",
      project_name: "friday-set",
      studio_views: [
        { view_type_id: "acme-dj:deck", distribution: "acme-dj", entry_name: "deck", manifest_json: { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node" }, folder_url },
        { view_type_id: "acme-dj:future", distribution: "acme-dj", entry_name: "future", manifest_json: { contract: "1.9", title: "Future", entry: "index.html", placement: "area" }, folder_url },
        { view_type_id: "outliner", distribution: "acme-dj", entry_name: "outliner", manifest_json: { contract: "1.0", title: "Outliner", entry: "index.html", placement: "area" }, folder_url },
      ],
    });

    expect(registry.projectViewTypes().map((viewType) => [viewType.view_type_id, viewType.title, viewType.brought_by])).toEqual([
      ["acme-dj:deck", "DJ Deck", { kind: "project", project_name: "friday-set" }],
    ]);
    expect(registry.viewTypeWithId("acme-dj:deck")?.title).toBe("DJ Deck");
    expect(registry.projectViewTypesNotOpened()).toEqual([
      { view_type_id: "acme-dj:future", because: "`contract`: this Tato Studio serves view contract 1.0." },
      { view_type_id: "outliner", because: "The studio already has a view named outliner." },
    ]);

    registry.projectStudioViews.publish({ kind: "none_open" });
    expect(registry.projectViewTypes()).toEqual([]);
    expect(registry.viewTypeWithId("acme-dj:deck")).toBeNull();
  });
});
