import { describe, expect, it } from "vitest";
import type { JsonValue, StudioViewHostConnection, StudioViewType } from "./studio_view_contract";
import { registeredStudioViewType, StudioViewTypeRegistry, type StudioViewHostServices } from "./studio_view_type_registry";

const HOST_SERVICES: StudioViewHostServices = {
  watchOpenWorkspace: () => () => undefined,
  watchListedStreams: () => () => undefined,
  watchSelection: () => () => undefined,
  select: () => undefined,
  watchActiveStreamTab: () => () => undefined,
  openStreamTab: () => undefined,
  watchStreamGraph: () => () => undefined,
  watchNodeCatalog: () => () => undefined,
  watchCodeFileAsked: () => () => undefined,
  openCodeFile: () => undefined,
  readWorkspaceFile: async () => ({ kind: "not_read", because: "no files in this test" }),
  saveWorkspaceFile: async () => ({ kind: "not_saved", because: "no files in this test" }),
  listWorkspaceProjectFiles: async () => ({ kind: "not_listed", because: "no files in this test" }),
  watchProjectLog: () => () => undefined,
  connectToPythonLanguageServer: () => ({ send: () => undefined, close: () => undefined }),
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
  it("answers a view type by id, none for one this build lacks, and lists the studio's apart from the workspace's", () => {
    const registry = new StudioViewTypeRegistry([
      registeredStudioViewType(countingViewType("outliner", { kind: "built_in" }, [])),
      registeredStudioViewType(countingViewType("venue-3d", { kind: "workspace_project", project_name: "hall-of-light" }, [])),
    ]);
    expect(registry.viewTypeWithId("outliner")?.title).toBe("outliner");
    expect(registry.viewTypeWithId("rocket-assembly")).toBeNull();
    expect(registry.studioViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["outliner"]);
    expect(registry.workspaceViewTypes().map((viewType) => viewType.view_type_id)).toEqual(["venue-3d"]);
  });

  it("draws a view on the settings its area saved, on its defaults where they no longer fit, and keeps the next ones with the area", () => {
    const connections: StudioViewHostConnection<number>[] = [];
    const kept: JsonValue[] = [];
    const viewType = registeredStudioViewType(countingViewType("counter", { kind: "built_in" }, connections));
    viewType.renderInAnArea(7, HOST_SERVICES, (next) => kept.push(next));
    viewType.renderInAnArea("seven", HOST_SERVICES, (next) => kept.push(next));
    viewType.renderInAnArea(undefined, HOST_SERVICES, (next) => kept.push(next));
    connections[0]?.rememberSettings(8);

    expect(connections.map((connection) => connection.settings)).toEqual([7, 1, 1]);
    expect(kept).toEqual([8]);
  });
});
