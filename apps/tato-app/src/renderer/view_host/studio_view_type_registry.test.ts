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
  return tatolabFrameViewType({ view_type_id: viewTypeId, project: "", project_name: "tests", view_folder: viewTypeId, import_folder: null, opens: true, not_opened_because: null, manifest_json: manifestJson, folder_url: `https://views.example/${viewTypeId}/`, newer_version_blocked_because: null }, manifestReading.manifest, broughtBy);
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
    const listedView = (viewTypeId: string, projectName: string, importFolder: string | null, manifestJson: JsonValue): ListedStudioView => ({
      view_type_id: viewTypeId,
      project: "",
      project_name: projectName,
      view_folder: viewTypeId.split(":").at(-1) ?? viewTypeId,
      import_folder: importFolder,
      opens: true,
      not_opened_because: null,
      manifest_json: manifestJson,
      folder_url: `https://views.example/${viewTypeId}/`,
      newer_version_blocked_because: null,
    });
    registry.projectStudioViews.publish({
      kind: "listed",
      studio_views: [
        listedView("friday-set:deck", "friday-set", null, { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node" }),
        { ...listedView("friday-set:future", "friday-set", null, { contract: "9.0" }), opens: false, not_opened_because: "`contract`: this runtime reads view contract 1.0" },
        listedView("lobby-wall:meter", "lobby-wall", "lobby-wall", { contract: "1.0", title: "Meter", entry: "index.html", placement: "area" }),
        listedView("outliner", "friday-set", null, { contract: "1.0", title: "Outliner", entry: "index.html", placement: "area" }),
      ],
    });

    expect(registry.projectViewTypes().map((viewType) => [viewType.view_type_id, viewType.title, viewType.brought_by])).toEqual([
      ["friday-set:deck", "DJ Deck", { kind: "project", project_name: "friday-set" }],
      ["lobby-wall:meter", "Meter", { kind: "project", project_name: "lobby-wall" }],
    ]);
    expect(registry.viewTypeWithId("friday-set:deck")?.title).toBe("DJ Deck");
    expect(registry.projectViewTypesNotOpened()).toEqual([
      {
        view_type_id: "friday-set:future",
        title: "friday-set:future",
        brought_by: { kind: "project", project_name: "friday-set" },
        because: "`contract`: this runtime reads view contract 1.0",
      },
      {
        view_type_id: "outliner",
        title: "Outliner",
        brought_by: { kind: "project", project_name: "friday-set" },
        because: "The studio already has a view named outliner.",
      },
    ]);

    registry.projectStudioViews.publish({ kind: "none_open" });
    expect(registry.projectViewTypes()).toEqual([]);
    expect(registry.viewTypeWithId("friday-set:deck")).toBeNull();
  });

  it("finds a project's view by its project's UUID and folder, and by the project name a layout saved before, whichever form the runtime lists", () => {
    const fridaySet = "0c7e5b1a-3f42-4d9e-8a61-5b2c9e7d4f10";
    const registry = new StudioViewTypeRegistry([], (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }));
    const deckListedAs = (viewTypeId: string): ListedStudioView => ({
      view_type_id: viewTypeId,
      project: fridaySet,
      project_name: "Friday Set",
      view_folder: "deck",
      import_folder: null,
      opens: true,
      not_opened_because: null,
      manifest_json: { contract: "1.0", title: "DJ Deck", entry: "index.html", placement: "node" },
      folder_url: "https://views.example/deck/",
      newer_version_blocked_because: null,
    });

    for (const listedType of ["Friday Set:deck", projectViewIdOf(fridaySet, "deck")]) {
      registry.projectStudioViews.publish({ kind: "listed", studio_views: [deckListedAs(listedType)] });
      for (const savedType of ["Friday Set:deck", projectViewIdOf(fridaySet, "deck")]) {
        expect(registry.viewTypeWithId(savedType)?.view_type_id).toBe(listedType);
        expect(registry.viewTypeIdOf(savedType)).toBe(listedType);
      }
      expect(registry.viewTypeWithId("Friday Set:mixer")).toBeNull();
      expect(registry.viewTypeIdOf("Friday Set:mixer")).toBe("Friday Set:mixer");
    }
  });
});
