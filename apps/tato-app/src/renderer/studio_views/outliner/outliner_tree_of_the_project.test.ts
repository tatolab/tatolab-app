import { describe, expect, it } from "vitest";
import type { ListedStream, OpenProject, ProjectNodeTypesReading } from "../../view_host/studio_view_contract";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheProject } from "./outliner_tree_of_the_project";

const HALL_OF_LIGHT_PROJECT = "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11";

const PROJECT: OpenProject = {
  project: { folder: "/w/studio", project: "0b6f3c1e-2d4a-4e8b-9c7d-5a1f8e3b6d20", name: "studio" },
  imports: [
    {
      project: HALL_OF_LIGHT_PROJECT,
      name: "hall-of-light",
      folder: "hall-of-light",
      source: { kind: "folder", project: { folder: "/w/studio/imports/hall-of-light", project: HALL_OF_LIGHT_PROJECT, name: "hall-of-light" } },
    },
    {
      project: "e7c41a90-3b2d-4f5e-8a6c-9d0b1f2e3a47",
      name: "broken",
      folder: "broken",
      source: { kind: "folder_unreadable", folder: "/w/studio/imports/broken", refusal: "list_assets failed: /w/studio/imports/broken holds no project: it has no tatolab-project.json" },
    },
  ],
  imports_not_listed_because: null,
};

function listedStream(projectFolder: string, displayName: string): ListedStream {
  return {
    stream: `${displayName}-id`,
    display_name: displayName,
    location: { project_directory: projectFolder, project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
    state: "running",
    node_count: 2,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
}

describe("the outliner's tree", () => {
  it("opens on the open project and its listed streams, with Imports closed", () => {
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall"), listedStream("/elsewhere", "other")] }, null, {});
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual([
      "studio expanded",
      "  studio expanded",
      "    tatolab-project.json leaf",
      "    lobby_wall leaf",
      "    Node types collapsed",
      "  Imports collapsed",
    ]);
    expect(rows[3]?.meaning).toEqual({ kind: "stream", stream: "lobby_wall-id", display_name: "lobby_wall", project_name: "studio", project_folder: "/w/studio" });
  });

  it("labels each stream by its display name and marks a failed one", () => {
    const failedStream: ListedStream = { ...listedStream("/w/studio", "Lobby Wall"), stream: "studio-main-ff588e", state: "failed", node_count: null, failed_because: "`uv sync` did not make /w/studio/.venv" };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [failedStream, listedStream("/w/studio", "door")] }, null, {});
    expect(rows.slice(3, 5).map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["Lobby Wall", "failed", "failed"],
      ["door", "stream", "plain"],
    ]);
  });

  it("says in the failure's own words why the streams could not be listed, in place of waiting on them", () => {
    const because = "the runtime's list_streams result could not be read: missing field `stream_asset`";
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listing_failed", because }, null, {});
    expect(rows.slice(2, 4).map(({ row }) => [row.row_id, row.label, row.tone ?? "plain"])).toEqual([
      ["project:/w/studio/project_file", "tatolab-project.json", "plain"],
      ["project:/w/studio/streams-not-listed", because, "unreadable"],
    ]);
  });

  it("opens the rows the person opened: each import read-only, its streams or why they wait", () => {
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "not_listed", because: "Stopped" }, null, {
      imports: true,
      "project:/w/studio/imports/hall-of-light": true,
      "project:/w/studio/imports/broken": true,
    });
    expect(rows.map(({ row }) => [row.row_id, row.label, row.isReadOnly === true])).toEqual([
      ["open_project_folder", "studio", false],
      ["project:/w/studio", "studio", false],
      ["project:/w/studio/project_file", "tatolab-project.json", false],
      ["project:/w/studio/waiting", "Streams and nodes not read yet", false],
      ["project:/w/studio/node_types", "Node types", false],
      ["imports", "Imports", true],
      ["project:/w/studio/imports/hall-of-light", "hall-of-light", true],
      ["project:/w/studio/imports/hall-of-light/project_file", "tatolab-project.json", false],
      ["project:/w/studio/imports/hall-of-light/waiting", "Streams and nodes not read yet", false],
      ["project:/w/studio/imports/broken", "broken", true],
      ["project:/w/studio/imports/broken/refusal", "list_assets failed: /w/studio/imports/broken holds no project: it has no tatolab-project.json", false],
    ]);
  });

  it("closes a row the person closed, and names the row a selection stands for", () => {
    expect(outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [] }, null, { open_project_folder: false }).map(({ row }) => row.row_id)).toEqual(["open_project_folder"]);
    expect(outlinerRowIdOfTheSelection({ kind: "stream", stream: "s", project_folder: "/w" })).toBe("stream:s");
    expect(outlinerRowIdOfTheSelection({ kind: "project", project_name: "tatolab-stream", project_folder: null })).toBe("project:tatolab-stream");
    expect(outlinerRowIdOfTheSelection({ kind: "nothing" })).toBeNull();
  });

  it("lists the open project's own node types and each import's by its UUID, or why the runtime lists none", () => {
    const nodeTypes: ProjectNodeTypesReading = {
      kind: "listed",
      listing: {
        project_directory: "/w/studio",
        project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55",
        project_name: "studio",
        sources: [
          {
            origin: { source: "project" },
            node_types: [{ type: "nodes.glow:Glow", kind: "process", description: "", category: "Effects", inputs: [], outputs: [], path: "nodes/glow.py", line: 3 }],
            graph_generators: [],
            unreadable_modules: [{ module: "nodes.draft", path: "nodes/draft.py", line: 2, column: 1, why: "SyntaxError: invalid syntax" }],
          },
          {
            origin: { source: "dependency", project: HALL_OF_LIGHT_PROJECT, folder: "hall-of-light", version: "ab".repeat(32) },
            node_types: [{ type: "hall_of_light:Beam", kind: null, description: "", category: "hall_of_light", inputs: null, outputs: null, path: null, line: null }],
            graph_generators: [],
            unreadable_modules: [],
          },
          { origin: { source: "installed_distribution", distribution: "tatolab-stream", distribution_version: "0.68.40" }, node_types: [], graph_generators: [], unreadable_modules: [] },
        ],
      },
    };
    const expansion = {
      imports: true,
      "project:/w/studio/node_types": true,
      "project:/w/studio/imports/hall-of-light": true,
      "project:/w/studio/imports/hall-of-light/node_types": true,
    };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [] }, nodeTypes, expansion);
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label}`)).toEqual([
      "studio",
      "  studio",
      "    tatolab-project.json",
      "    Streams and nodes not read yet",
      "    Node types",
      "      Effects",
      "        Glow",
      "      nodes/draft.py:2:1: SyntaxError: invalid syntax",
      "  Imports",
      "    hall-of-light",
      "      tatolab-project.json",
      "      Streams and nodes not read yet",
      "      Node types",
      "        hall_of_light",
      "          Beam",
      "    broken",
    ]);
    expect(rows.find(({ row }) => row.label === "Glow")?.meaning).toMatchObject({ kind: "node_type_declaration", file: "/w/studio/nodes/glow.py" });

    const refused = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [] }, { kind: "not_listed", because: "list_project_node_types failed: no venv" }, expansion);
    expect(refused.slice(4, 6).map(({ row }) => [row.label, row.tone ?? "plain"])).toEqual([
      ["Node types", "plain"],
      ["list_project_node_types failed: no venv", "unreadable"],
    ]);
  });
});
