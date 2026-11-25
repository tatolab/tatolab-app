import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk/studio_host";
import { describe, expect, it } from "vitest";
import type { JsonValue, StudioViewTypeSource } from "./studio_view_contract";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import { projectViewIdOf, StudioViewTypeRegistry, type RegisteredStudioViewType } from "./studio_view_type_registry";
import { tatolabFrameViewType } from "./tatolab_frame_view_type";

/** The view type an `area` view's manifest titled `viewTypeId` declares, brought by `broughtBy`. */
function viewTypeFromItsManifest(viewTypeId: string, broughtBy: StudioViewTypeSource): RegisteredStudioViewType {
  const manifestJson: JsonValue = { contract: "1.0", title: viewTypeId, entry: "index.html", placement: "area" };
  const manifestReading = readTatolabViewManifest(manifestJson);
  if (manifestReading.kind === "not_read") throw new Error(manifestReading.because);
  return tatolabFrameViewType({ view_type_id: viewTypeId, project: null, project_name: "tests", view_folder: viewTypeId, import_folder: null, opens: true, not_opened_because: null, manifest_json: manifestJson, folder_url: `https://views.example/${viewTypeId}/`, newer_version_blocked_because: null }, manifestReading.manifest, broughtBy);
}

describe("the view-type registry", () => {
  it("answers a view type by id, none for one this build lacks, and lists the studio's apart from the project's", () => {
    const registry = new StudioViewTypeRegistry([
      viewTypeFromItsManifest("outliner", { kind: "tato_studio" }),
      viewTypeFromItsManifest("venue-3d", { kind: "project", project_name: "hall-of-light" }),
    ]);
    expect(registry.viewTypeWithId("outliner")?.title).toBe("outliner");
    expect(registry.viewTypeWithId("rocket-assembly")).toBeNull();
    expect(registry.studioViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["outliner"]);
    expect(registry.projectViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["venue-3d"]);
  });

  it("offers a view type held for Developer mode only while Developer mode is on, last among the studio's", () => {
    const registry = new StudioViewTypeRegistry([viewTypeFromItsManifest("outliner", { kind: "tato_studio" })], null, [], [
      viewTypeFromItsManifest("transactions", { kind: "tato_studio" }),
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

  it("lists the views the open project and its imports bring, each under the project bringing it, and each one that does not open with the runtime's reason", () => {
    const registry = new StudioViewTypeRegistry([viewTypeFromItsManifest("outliner", { kind: "tato_studio" })], (listed, manifest) =>
      tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }),
    );
    const FRIDAY_SET = "6d3a8f2c-1b7e-4c95-8a04-3e9f5b2d7c61";
    const LOBBY_WALL = "b2e7c4a9-5f13-4d68-9e2b-7a1c6f3d8e05";
    const listedView = (project: string, projectName: string, viewFolder: string, importFolder: string | null, manifestJson: JsonValue): ListedStudioView => ({
      view_type_id: projectViewIdOf(project, viewFolder),
      project,
      project_name: projectName,
      view_folder: viewFolder,
      import_folder: importFolder,
      opens: true,
      not_opened_because: null,
      manifest_json: manifestJson,
      folder_url: `https://views.example/${viewFolder}/`,
      newer_version_blocked_because: null,
    });
    registry.projectStudioViews.publish({
      kind: "listed",
      studio_views: [
        listedView(FRIDAY_SET, "friday-set", "deck", null, { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node" }),
        { ...listedView(FRIDAY_SET, "friday-set", "future", null, { contract: "9.0" }), opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0" },
        listedView(LOBBY_WALL, "lobby-wall", "meter", "lobby-wall", { contract: "1.0", title: "Meter", entry: "index.html", placement: "area" }),
      ],
    });

    expect(registry.projectViewTypes().map((viewType) => [viewType.view_type_id, viewType.title, viewType.brought_by])).toEqual([
      [projectViewIdOf(FRIDAY_SET, "deck"), "DJ Deck", { kind: "project", project_name: "friday-set" }],
      [projectViewIdOf(LOBBY_WALL, "meter"), "Meter", { kind: "project", project_name: "lobby-wall" }],
    ]);
    expect(registry.viewTypeWithId(projectViewIdOf(FRIDAY_SET, "deck"))?.title).toBe("DJ Deck");
    expect(registry.projectViewTypesNotOpened()).toEqual([
      {
        view_type_id: projectViewIdOf(FRIDAY_SET, "future"),
        title: "future",
        brought_by: { kind: "project", project_name: "friday-set" },
        because: "`contract`: this runtime reads view contract 1.0",
      },
    ]);

    registry.projectStudioViews.publish({ kind: "none_open" });
    expect(registry.projectViewTypes()).toEqual([]);
    expect(registry.viewTypeWithId(projectViewIdOf(FRIDAY_SET, "deck"))).toBeNull();
  });

  it("holds a project's view under the type the runtime lists it as, found too by its project's UUID and folder or name and folder an area was saved under", () => {
    const fridaySet = "0c7e5b1a-3f42-4d9e-8a61-5b2c9e7d4f10";
    const deckView = "9b41e6d2-7a05-4c38-b1f9-2e6d8c4a7053";
    const registry = new StudioViewTypeRegistry([], (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }));
    const deckListedAs = (viewTypeId: string, opens: boolean): ListedStudioView => ({
      view_type_id: viewTypeId,
      project: fridaySet,
      project_name: "Friday Set",
      view_folder: "deck",
      import_folder: null,
      ...(opens ? { opens: true, not_opened_because: null } : { opens: false, not_opened_because: "`entry` names no file." }),
      manifest_json: { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node" },
      folder_url: "https://views.example/deck/",
      newer_version_blocked_because: null,
    });

    for (const listedType of [projectViewIdOf(fridaySet, "deck"), deckView]) {
      registry.projectStudioViews.publish({ kind: "listed", studio_views: [deckListedAs(listedType, true)] });
      expect(registry.projectViewTypes().map((viewType) => viewType.view_type_id)).toEqual([listedType]);
      for (const savedType of [listedType, projectViewIdOf(fridaySet, "deck"), "Friday Set:deck"]) {
        expect(registry.viewTypeWithId(savedType)?.view_type_id).toBe(listedType);
        expect(registry.viewTypeIdOf(savedType)).toBe(listedType);
      }
      expect(registry.viewTypeWithId("Friday Set:mixer")).toBeNull();
      expect(registry.viewTypeIdOf("Friday Set:mixer")).toBe("Friday Set:mixer");

      registry.projectStudioViews.publish({ kind: "listed", studio_views: [deckListedAs(listedType, false)] });
      expect(registry.viewTypeIdOf("Friday Set:deck")).toBe(listedType);
      expect(registry.projectViewTypesNotOpened()).toEqual([{ view_type_id: listedType, title: "DJ Deck", brought_by: { kind: "project", project_name: "Friday Set" }, because: "`entry` names no file." }]);
    }
  });

  it("keeps an area saved under Studio's own view by its own id, though a project brings a view in a folder of that name", () => {
    const paintPulse = "4f8a2d61-9c3e-4b75-a0d8-6e1f3b9c2a74";
    const registry = new StudioViewTypeRegistry([viewTypeFromItsManifest("outliner", { kind: "tato_studio" })], (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }));
    registry.projectStudioViews.publish({
      kind: "listed",
      studio_views: [
        {
          view_type_id: "c3d9a7e1-5b28-4f60-9e14-7a2b6d8f0c35",
          project: paintPulse,
          project_name: "Paint Pulse",
          view_folder: "outliner",
          import_folder: null,
          opens: true,
          not_opened_because: null,
          manifest_json: { contract: "1.0", title: "Stage", entry: "index.html", placement: "area" },
          folder_url: "https://views.example/outliner/",
          newer_version_blocked_because: null,
        },
      ],
    });
    expect(registry.viewTypeIdOf("outliner")).toBe("outliner");
    expect(registry.viewTypeWithId("outliner")?.title).toBe("outliner");
    expect(registry.viewTypeIdOf("Paint Pulse:outliner")).toBe("c3d9a7e1-5b28-4f60-9e14-7a2b6d8f0c35");
  });
});
