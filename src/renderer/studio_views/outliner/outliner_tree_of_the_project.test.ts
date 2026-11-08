import { describe, expect, it } from "vitest";
import type { ListedStream, OpenProject } from "../../view_host/studio_view_contract";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheProject } from "./outliner_tree_of_the_project";

const PROJECT: OpenProject = {
  project: { folder: "/w/studio", name: "studio", requirements: ["tatolab-stream", "hall-of-light", "broken"] },
  imports: [
    { name: "tatolab-stream", requirement: "tatolab-stream", source: { kind: "package_index" } },
    { name: "hall-of-light", requirement: "hall-of-light", source: { kind: "folder", project: { folder: "/w/studio/imports/hall-of-light", name: "hall-of-light", requirements: [] } } },
    { name: "broken", requirement: "broken", source: { kind: "folder_unreadable", folder: "/w/studio/imports/broken", refusal: "/w/studio/imports/broken has no pyproject.toml." } },
  ],
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
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall"), listedStream("/elsewhere", "other")] }, {});
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual([
      "studio expanded",
      "  studio expanded",
      "    pyproject.toml leaf",
      "    lobby_wall leaf",
      "  Imports collapsed",
    ]);
    expect(rows[3]?.meaning).toEqual({ kind: "stream", stream: "lobby_wall-id", display_name: "lobby_wall", project_name: "studio", project_folder: "/w/studio" });
  });

  it("labels each stream by its display name and marks a failed one", () => {
    const failedStream: ListedStream = { ...listedStream("/w/studio", "Lobby Wall"), stream: "studio-main-ff588e", state: "failed", node_count: null, failed_because: "`uv sync` did not make /w/studio/.venv" };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [failedStream, listedStream("/w/studio", "door")] }, {});
    expect(rows.slice(3, 5).map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["Lobby Wall", "failed", "failed"],
      ["door", "stream", "plain"],
    ]);
  });

  it("says in the failure's own words why the streams could not be listed, in place of waiting on them", () => {
    const because = "the runtime's list_streams result could not be read: missing field `stream_asset`";
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listing_failed", because }, {});
    expect(rows.slice(2, 4).map(({ row }) => [row.row_id, row.label, row.tone ?? "plain"])).toEqual([
      ["project:/w/studio/pyproject", "pyproject.toml", "plain"],
      ["project:/w/studio/streams-not-listed", because, "unreadable"],
    ]);
  });

  it("opens the rows the person opened: each import read-only, its streams or why they wait", () => {
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "not_listed", because: "Stopped" }, {
      imports: true,
      "project:tatolab-stream": true,
      "project:/w/studio/imports/hall-of-light": true,
      "project:/w/studio/imports/broken": true,
    });
    expect(rows.map(({ row }) => [row.row_id, row.label, row.isReadOnly === true])).toEqual([
      ["open_project_folder", "studio", false],
      ["project:/w/studio", "studio", false],
      ["project:/w/studio/pyproject", "pyproject.toml", false],
      ["project:/w/studio/waiting", "Streams and nodes not read yet", false],
      ["imports", "Imports", true],
      ["project:tatolab-stream", "tatolab-stream", true],
      ["project:tatolab-stream/waiting", "Streams and nodes not read yet", false],
      ["project:/w/studio/imports/hall-of-light", "hall-of-light", true],
      ["project:/w/studio/imports/hall-of-light/pyproject", "pyproject.toml", false],
      ["project:/w/studio/imports/hall-of-light/waiting", "Streams and nodes not read yet", false],
      ["project:/w/studio/imports/broken", "broken", true],
      ["project:/w/studio/imports/broken/refusal", "/w/studio/imports/broken has no pyproject.toml.", false],
    ]);
  });

  it("closes a row the person closed, and names the row a selection stands for", () => {
    expect(outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [] }, { open_project_folder: false }).map(({ row }) => row.row_id)).toEqual(["open_project_folder"]);
    expect(outlinerRowIdOfTheSelection({ kind: "stream", stream: "s", project_folder: "/w" })).toBe("stream:s");
    expect(outlinerRowIdOfTheSelection({ kind: "project", project_name: "tatolab-stream", project_folder: null })).toBe("project:tatolab-stream");
    expect(outlinerRowIdOfTheSelection({ kind: "nothing" })).toBeNull();
  });
});
