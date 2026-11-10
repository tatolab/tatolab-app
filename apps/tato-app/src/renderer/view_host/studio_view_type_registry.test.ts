import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import { describe, expect, it } from "vitest";
import type { StudioViewTypeSource } from "./studio_view_contract";
import { StudioViewTypeRegistry, type RegisteredStudioViewType } from "./studio_view_type_registry";
import { tatolabFrameViewType } from "./tatolab_frame_view_type";

/** The view type an `area` view's manifest titled `viewTypeId` declares, brought by `broughtBy`. */
function viewTypeFromItsManifest(viewTypeId: string, broughtBy: StudioViewTypeSource): RegisteredStudioViewType {
  const manifestJson = { contract: "1.0", title: viewTypeId, entry: "index.html", placement: "area" };
  const manifestReading = readTatolabViewManifest(manifestJson);
  if (manifestReading.kind === "not_read") throw new Error(manifestReading.because);
  return tatolabFrameViewType({ view_type_id: viewTypeId, distribution: "tests", entry_name: viewTypeId, manifest_json: manifestJson, folder_url: `https://views.example/${viewTypeId}/` }, manifestReading.manifest, broughtBy);
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

  it("lists the views the open project brings from their manifests, and each one that does not open with why", () => {
    const registry = new StudioViewTypeRegistry([viewTypeFromItsManifest("outliner", { kind: "tato_studio" })], (listed, manifest, projectName) =>
      tatolabFrameViewType(listed, manifest, { kind: "project", project_name: projectName }),
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
