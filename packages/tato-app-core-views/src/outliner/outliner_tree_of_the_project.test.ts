import { describe, expect, it } from "vitest";
import { NODE_STUDIO_FIELDS_NONE_SET, type ListedStream, type OpenProject, type StreamGraphNode, type StreamGraphReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { outlinerRowIdOfTheSelection, outlinerTreeOfTheProject, streamsTheOutlinerShows } from "./outliner_tree_of_the_project";

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

function graphNode(name: string, type: string, group: string | null, failedBecause: string | null = null): StreamGraphNode {
  return {
    id: `${name}-uuid`,
    name,
    type,
    state: failedBecause === null ? "Running" : "Error",
    failed_because: failedBecause,
    process_raising_because: null,
    config: {},
    pins: {},
    input_ports: [],
    output_ports: [],
    dropped_bags_by_link: {},
    refused_bags_by_output_port: {},
    studio: { ...NODE_STUDIO_FIELDS_NONE_SET, group },
    fragment: null,
  };
}

const INPUTS_GROUP = "9b1e4c2a-1111-4d55-9a57-1f1b8f6f0a11";
const LOOK_GROUP = "9b1e4c2a-2222-4d55-9a57-1f1b8f6f0a11";

const LOBBY_WALL_GRAPH: StreamGraphReading = {
  kind: "read",
  graph: {
    stream: "lobby_wall-id",
    stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68",
    groups: [
      { id: INPUTS_GROUP, title: "Inputs", description: null, colour: null },
      { id: LOOK_GROUP, title: "The look", description: null, colour: null },
    ],
    notes: [],
    nodes: [
      graphNode("camerasource", "tatolab.stream:CameraSource", INPUTS_GROUP),
      graphNode("Halftone", "lens.nodes:HalftoneLensEffect", LOOK_GROUP, "the shader did not compile"),
      graphNode("display", "tatolab.stream:Display", null),
      graphNode("stray", "tatolab.stream:Display", "a-group-the-graph-no-longer-has"),
    ],
    links: [],
    graph_document_text: "{}",
  },
};

function tree(streams: ListedStream[], graphs: Record<string, StreamGraphReading>, openStream: string | null, expansion: Record<string, boolean> = {}, searchWords = ""): string[] {
  return outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, graphs, openStream, expansion, searchWords).map(
    ({ row }) => `${"  ".repeat(row.depth)}${row.label}${row.aside === undefined ? "" : ` · ${row.aside}`} ${row.expansion}`,
  );
}

describe("searching the outliner", () => {
  const streams = [listedStream("/w/studio", "lobby_wall"), listedStream("/w/studio", "door")];

  it("keeps the rows whose name or type matches, ignoring case, with the rows above them open, marked with the search", () => {
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, { "lobby_wall-id": false }, "HALF")).toEqual(["lobby_wall expanded", "  The look · group expanded", "    Halftone · HalftoneLensEffect leaf"]);
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, {}, "display")).toEqual(["lobby_wall expanded", "  Display · Display leaf", "  stray · Display leaf"]);
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, {}, "half");
    expect(rows.every(({ row }) => row.searchWords === "half")).toBe(true);
  });

  it("keeps a stream whose name matches, and nothing when no row does", () => {
    expect(tree(streams, {}, null, {}, "door")).toEqual(["door leaf"]);
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, {}, "zzz")).toEqual([]);
  });

  it("shows the whole tree again for a blank search", () => {
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", {}, "  ")).toEqual(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id"));
  });
});

describe("the outliner's tree", () => {
  it("lists only the open project's streams at its top, the active tab's stream open on its groups, their nodes, then the nodes in no group", () => {
    const streams = [listedStream("/w/studio", "lobby_wall"), listedStream("/w/studio", "door"), listedStream("/elsewhere", "other")];
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id")).toEqual([
      "lobby_wall expanded",
      "  Inputs · group expanded",
      "    Camera Source · CameraSource leaf",
      "  The look · group expanded",
      "    Halftone · HalftoneLensEffect leaf",
      "  Display · Display leaf",
      "  stray · Display leaf",
      "door collapsed",
    ]);
  });

  it("marks the active tab's stream as the current row, and only it", () => {
    const streams = [listedStream("/w/studio", "lobby_wall"), listedStream("/w/studio", "door")];
    const currentRows = (openStream: string | null) =>
      outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, {}, openStream, {})
        .filter(({ row }) => row.isCurrent === true)
        .map(({ row }) => row.label);
    expect(currentRows("door-id")).toEqual(["door"]);
    expect(currentRows(null)).toEqual([]);
  });

  it("marks a running node whose process() keeps raising as failed", () => {
    const raising = { ...graphNode("Halftone", "tatolab.stream:HalftoneLensEffect", null), process_raising_because: "process() raised ValueError: no lens (nodes/halftone.py, line 12)" };
    if (LOBBY_WALL_GRAPH.kind !== "read") throw new Error("LOBBY_WALL_GRAPH is a read graph");
    const graph: StreamGraphReading = { kind: "read", graph: { ...LOBBY_WALL_GRAPH.graph, nodes: [raising] } };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall")] }, { "lobby_wall-id": graph }, "lobby_wall-id", {});
    const halftone = rows.find(({ row }) => row.label === "Halftone");
    expect([halftone?.row.icon, halftone?.row.tone]).toEqual(["failed", "failed"]);
  });

  it("marks a failed node and selects each node by its stream and name", () => {
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall")] }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", {});
    const halftone = rows.find(({ row }) => row.label === "Halftone");
    expect([halftone?.row.icon, halftone?.row.tone]).toEqual(["failed", "failed"]);
    expect(halftone?.row.row_id).toBe("node:lobby_wall-id/Halftone");
    expect(halftone?.meaning).toEqual({ kind: "node", stream: "lobby_wall-id", node: "Halftone", display_name: "lobby_wall", project_name: "studio" });
    expect(rows[0]?.meaning).toEqual({ kind: "stream", stream: "lobby_wall-id", display_name: "lobby_wall", project_name: "studio", project_folder: "/w/studio" });
    expect(outlinerRowIdOfTheSelection({ kind: "node", stream: "lobby_wall-id", node: "Halftone" })).toBe("node:lobby_wall-id/Halftone");
    expect(outlinerRowIdOfTheSelection({ kind: "stream", stream: "s", project_folder: "/w" })).toBe("stream:s");
    expect(outlinerRowIdOfTheSelection({ kind: "project", project_name: "studio", project_folder: "/w/studio" })).toBeNull();
    expect(outlinerRowIdOfTheSelection({ kind: "nothing" })).toBeNull();
  });

  it("keeps the rows the person opened or closed over the active tab's default", () => {
    const streams = [listedStream("/w/studio", "lobby_wall")];
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", { "stream:lobby_wall-id": false })).toEqual(["lobby_wall collapsed"]);
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, { "stream:lobby_wall-id": true, [`group:lobby_wall-id/${INPUTS_GROUP}`]: false }).slice(0, 3)).toEqual([
      "lobby_wall expanded",
      "  Inputs · group collapsed",
      "  The look · group expanded",
    ]);
  });

  it("says why a stream shows no nodes: not read yet, the runtime's refusal, none yet, or why it failed", () => {
    const failedStream: ListedStream = { ...listedStream("/w/studio", "Lobby Wall"), stream: "studio-main-ff588e", state: "failed", node_count: null, failed_because: "`uv sync` did not make /w/studio/.venv" };
    const streams = [listedStream("/w/studio", "waiting"), listedStream("/w/studio", "refused"), listedStream("/w/studio", "empty"), failedStream];
    const graphs: Record<string, StreamGraphReading> = {
      "refused-id": { kind: "not_read", because: "graph failed: no stream refused-id" },
      "empty-id": { kind: "read", graph: { stream: "empty-id", stream_asset: null, groups: [], notes: [], nodes: [], links: [], graph_document_text: "{}" } },
    };
    const expansion = { "stream:waiting-id": true, "stream:refused-id": true, "stream:empty-id": true, "stream:studio-main-ff588e": true };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, graphs, null, expansion);
    expect(rows.map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["waiting", "stream", "plain"],
      ["Nodes not read yet", "waiting", "waiting"],
      ["refused", "stream", "plain"],
      ["graph failed: no stream refused-id", "unreadable", "unreadable"],
      ["empty", "stream", "plain"],
      ["No nodes yet", "waiting", "waiting"],
      ["Lobby Wall", "failed", "failed"],
      ["`uv sync` did not make /w/studio/.venv", "unreadable", "failed"],
    ]);
  });

  it("says when the project has no streams, while they wait on the runtime, or why listing them failed, in the failure's own words", () => {
    expect(tree([listedStream("/elsewhere", "other")], {}, null)).toEqual(["No streams yet leaf"]);
    expect(outlinerTreeOfTheProject(PROJECT, { kind: "not_listed", because: "Stopped" }, {}, null, {}).map(({ row }) => row.label)).toEqual(["Streams not read yet"]);
    const because = "the runtime's list_streams result could not be read: missing field `stream_asset`";
    expect(outlinerTreeOfTheProject(PROJECT, { kind: "listing_failed", because }, {}, null, {}).map(({ row }) => [row.label, row.tone])).toEqual([[because, "unreadable"]]);
  });

  it("says a group holds no nodes", () => {
    const emptyGroupGraph: StreamGraphReading = {
      kind: "read",
      graph: { stream: "lobby_wall-id", stream_asset: null, groups: [{ id: INPUTS_GROUP, title: "Inputs", description: null, colour: null }], notes: [], nodes: [], links: [], graph_document_text: "{}" },
    };
    expect(tree([listedStream("/w/studio", "lobby_wall")], { "lobby_wall-id": emptyGroupGraph }, "lobby_wall-id")).toEqual(["lobby_wall expanded", "  Inputs · group expanded", "    No nodes leaf"]);
  });

  it("reads the graphs of the open project's streams only", () => {
    const streams = [listedStream("/w/studio", "lobby_wall"), listedStream("/elsewhere", "other")];
    expect(streamsTheOutlinerShows(PROJECT, { kind: "listed", streams })).toEqual(["lobby_wall-id"]);
    expect(streamsTheOutlinerShows(PROJECT, { kind: "not_listed", because: "Stopped" })).toEqual([]);
  });
});
