import { describe, expect, it } from "vitest";
import type { ListedStream, OpenWorkspace } from "../../view_host/studio_view_contract";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheWorkspace } from "./outliner_tree_of_the_workspace";

const WORKSPACE: OpenWorkspace = {
  workspace_project: { folder: "/w/studio", name: "studio", requirements: ["tatolab-stream", "hall-of-light", "broken"] },
  imports: [
    { name: "tatolab-stream", requirement: "tatolab-stream", source: { kind: "package_index" } },
    { name: "hall-of-light", requirement: "hall-of-light", source: { kind: "folder", project: { folder: "/w/studio/imports/hall-of-light", name: "hall-of-light", requirements: [] } } },
    { name: "broken", requirement: "broken", source: { kind: "folder_unreadable", folder: "/w/studio/imports/broken", refusal: "/w/studio/imports/broken has no pyproject.toml." } },
  ],
};

function listedStream(projectFolder: string, streamFunction: string): ListedStream {
  return {
    stream: `${streamFunction}-id`,
    display_name: streamFunction,
    location: { project_directory: projectFolder, stream_function: `stream:${streamFunction}` },
    state: "running",
    node_count: 2,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
}

describe("the outliner's tree", () => {
  it("opens on the workspace project and its listed streams, with Imports closed", () => {
    const rows = outlinerTreeOfTheWorkspace(WORKSPACE, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall"), listedStream("/elsewhere", "other")] }, {});
    expect(rows.map(({ row }) => `${"  ".repeat(row.depth)}${row.label} ${row.expansion}`)).toEqual([
      "studio expanded",
      "  studio expanded",
      "    pyproject.toml leaf",
      "    lobby_wall leaf",
      "  Imports collapsed",
    ]);
    expect(rows[3]?.meaning).toEqual({ kind: "stream", stream: "lobby_wall-id", display_name: "lobby_wall", project_name: "studio", project_folder: "/w/studio" });
  });

  it("opens the rows the person opened: each import read-only, its streams or why they wait", () => {
    const rows = outlinerTreeOfTheWorkspace(WORKSPACE, { kind: "not_listed", because: "Stopped" }, {
      imports: true,
      "project:tatolab-stream": true,
      "project:/w/studio/imports/hall-of-light": true,
      "project:/w/studio/imports/broken": true,
    });
    expect(rows.map(({ row }) => [row.row_id, row.label, row.isReadOnly === true])).toEqual([
      ["workspace", "studio", false],
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
    expect(outlinerTreeOfTheWorkspace(WORKSPACE, { kind: "listed", streams: [] }, { workspace: false }).map(({ row }) => row.row_id)).toEqual(["workspace"]);
    expect(outlinerRowIdOfTheSelection({ kind: "stream", stream: "s", project_folder: "/w" })).toBe("stream:s");
    expect(outlinerRowIdOfTheSelection({ kind: "project", project_name: "tatolab-stream", project_folder: null })).toBe("project:tatolab-stream");
    expect(outlinerRowIdOfTheSelection({ kind: "nothing" })).toBeNull();
  });
});
