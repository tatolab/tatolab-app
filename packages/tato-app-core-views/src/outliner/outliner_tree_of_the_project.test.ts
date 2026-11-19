import { describe, expect, it } from "vitest";
import type { ListedStream, OpenProject, StreamCondition, StreamGraphNode, StreamGraphNodeKind, StreamGraphReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { aGraphNode, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { groupOfTheSelectedNodes, outlinerRowIdsOfTheSelection, outlinerTreeOfTheProject, selectionAfterTheOutlinerPick, streamsTheOutlinerShows } from "./outliner_tree_of_the_project";

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
    capture_devices_whose_access_was_never_asked_for: [], condition: null,
    action: null,
    step: null,
  };
}

function graphNode(name: string, type: string, group: string | null, failedBecause: string | null = null, kind: StreamGraphNodeKind | null = "process"): StreamGraphNode {
  return aGraphNode(name, {
    id: `${name}-uuid`,
    type,
    kind,
    studio: { contract: 1, group },
    components: { state: failedBecause === null ? "Running" : "Error", failed_because: failedBecause },
  });
}

/** `node` with `components` set beside the ones it holds. */
function withComponents(node: StreamGraphNode, components: Partial<StreamGraphNode["components"]>): StreamGraphNode {
  return { ...node, components: { ...node.components, ...components } };
}

const INPUTS_GROUP = "9b1e4c2a-1111-4d55-9a57-1f1b8f6f0a11";
const LOOK_GROUP = "9b1e4c2a-2222-4d55-9a57-1f1b8f6f0a11";

const LOBBY_WALL_GRAPH: StreamGraphReading = {
  kind: "read",
  graph: aStreamGraph(
    [
      graphNode("camerasource", "tatolab.stream:CameraSource", INPUTS_GROUP),
      graphNode("Halftone", "lens.nodes:HalftoneLensEffect", LOOK_GROUP, "the shader did not compile", "shader"),
      graphNode("display", "tatolab.stream:Display", null, null, "function"),
      graphNode("stray", "tatolab.stream:Display", "a-group-the-graph-no-longer-has", null, null),
    ],
    [],
    {
      stream: "lobby_wall-id",
      asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68",
      groups: [
        { id: INPUTS_GROUP, title: "Inputs" },
        { id: LOOK_GROUP, title: "The look" },
      ],
    },
  ),
};

function tree(streams: ListedStream[], graphs: Record<string, StreamGraphReading>, openStream: string | null, expansion: Record<string, boolean> = {}, searchWords = ""): string[] {
  return outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, graphs, openStream, expansion, searchWords).map(
    ({ row }) => `${"  ".repeat(row.depth)}${row.label}${row.aside === undefined ? "" : ` · ${row.aside}`} ${row.expansion}`,
  );
}

describe("searching the outliner", () => {
  const streams = [listedStream("/w/studio", "lobby_wall"), listedStream("/w/studio", "door")];

  it("keeps the rows whose name or type matches, ignoring case, with the rows above them open, marked with the search", () => {
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, { "lobby_wall-id": false }, "HALF")).toEqual(["lobby_wall · stream expanded", "  The look · group expanded", "    Halftone · shader leaf"]);
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, {}, "display")).toEqual(["lobby_wall · stream expanded", "  Display · function leaf"]);
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, {}, "Shader")).toEqual(["lobby_wall · stream expanded", "  The look · group expanded", "    Halftone · shader leaf"]);
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, {}, "half");
    expect(rows.every(({ row }) => row.searchWords === "half")).toBe(true);
  });

  it("keeps a stream whose name matches, and nothing when no row does", () => {
    expect(tree(streams, {}, null, {}, "door")).toEqual(["door · stream leaf"]);
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
      "lobby_wall · stream expanded",
      "  Inputs · group expanded",
      "    Camera Source · process leaf",
      "  The look · group expanded",
      "    Halftone · shader leaf",
      "  Display · function leaf",
      "  stray · node leaf",
      "door · stream collapsed",
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
    const raising = withComponents(graphNode("Halftone", "tatolab.stream:HalftoneLensEffect", null), { process_raising_because: "process() raised ValueError: no lens (nodes/halftone.py, line 12)" });
    if (LOBBY_WALL_GRAPH.kind !== "read") throw new Error("LOBBY_WALL_GRAPH is a read graph");
    const graph: StreamGraphReading = { kind: "read", graph: { ...LOBBY_WALL_GRAPH.graph, nodes: [raising] } };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall")] }, { "lobby_wall-id": graph }, "lobby_wall-id", {});
    const halftone = rows.find(({ row }) => row.label === "Halftone");
    expect([halftone?.row.icon, halftone?.row.tone]).toEqual(["failed", "failed"]);
  });

  it("marks a running node that is not ready as not ready, and one whose process() also keeps raising as failed", () => {
    const notReady = withComponents(graphNode("Poster", "core_nodes.image_file:ImageFile", null), { not_ready_because: "ImageFile names no image asset" });
    const notReadyAndRaising = withComponents(graphNode("Halftone", "tatolab.stream:HalftoneLensEffect", null), { not_ready_because: "no lens yet", process_raising_because: "process() raised ValueError: no lens" });
    if (LOBBY_WALL_GRAPH.kind !== "read") throw new Error("LOBBY_WALL_GRAPH is a read graph");
    const graph: StreamGraphReading = { kind: "read", graph: { ...LOBBY_WALL_GRAPH.graph, nodes: [notReady, notReadyAndRaising] } };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall")] }, { "lobby_wall-id": graph }, "lobby_wall-id", {});
    const rowLook = (label: string) => {
      const row = rows.find((treeNode) => treeNode.row.label === label)?.row;
      return [row?.icon, row?.tone];
    };
    expect(rowLook("Poster")).toEqual(["not_ready", "not_ready"]);
    expect(rowLook("Halftone")).toEqual(["failed", "failed"]);
  });

  it("marks a failed node and selects each node by its stream and name", () => {
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [listedStream("/w/studio", "lobby_wall")] }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", {});
    const halftone = rows.find(({ row }) => row.label === "Halftone");
    expect([halftone?.row.icon, halftone?.row.tone]).toEqual(["failed", "failed"]);
    expect(halftone?.row.row_id).toBe("node:lobby_wall-id/Halftone");
    expect(halftone?.meaning).toEqual({ kind: "node", stream: "lobby_wall-id", node: "Halftone", display_name: "lobby_wall", project_name: "studio" });
    expect(rows[0]?.meaning).toEqual({ kind: "stream", stream: "lobby_wall-id", display_name: "lobby_wall", project_name: "studio", project_folder: "/w/studio" });
    expect(outlinerRowIdsOfTheSelection({ kind: "node", stream: "lobby_wall-id", node: "Halftone" })).toEqual({ picked_last: "node:lobby_wall-id/Halftone", all: new Set(["node:lobby_wall-id/Halftone"]) });
    expect(outlinerRowIdsOfTheSelection({ kind: "nodes", stream: "lobby_wall-id", nodes: ["display", "Halftone"] })).toEqual({
      picked_last: "node:lobby_wall-id/Halftone",
      all: new Set(["node:lobby_wall-id/display", "node:lobby_wall-id/Halftone"]),
    });
    expect(outlinerRowIdsOfTheSelection({ kind: "stream", stream: "s", project_folder: "/w" }).picked_last).toBe("stream:s");
    expect(outlinerRowIdsOfTheSelection({ kind: "project", project_name: "studio", project_folder: "/w/studio" })).toEqual({ picked_last: null, all: new Set() });
    expect(outlinerRowIdsOfTheSelection({ kind: "nothing" })).toEqual({ picked_last: null, all: new Set() });
  });

  it("keeps the rows the person opened or closed over the active tab's default", () => {
    const streams = [listedStream("/w/studio", "lobby_wall")];
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", { "stream:lobby_wall-id": false })).toEqual(["lobby_wall · stream collapsed"]);
    expect(tree(streams, { "lobby_wall-id": LOBBY_WALL_GRAPH }, null, { "stream:lobby_wall-id": true, [`group:lobby_wall-id/${INPUTS_GROUP}`]: false }).slice(0, 3)).toEqual([
      "lobby_wall · stream expanded",
      "  Inputs · group collapsed",
      "  The look · group expanded",
    ]);
  });

  it("says why a stream shows no nodes: not read yet, the runtime's refusal, none yet, or why it failed", () => {
    const failedStream: ListedStream = { ...listedStream("/w/studio", "Lobby Wall"), stream: "studio-main-ff588e", state: "failed", node_count: null, failed_because: "`uv sync` did not make /w/studio/.venv" };
    const streams = [listedStream("/w/studio", "waiting"), listedStream("/w/studio", "refused"), listedStream("/w/studio", "empty"), failedStream];
    const graphs: Record<string, StreamGraphReading> = {
      "refused-id": { kind: "not_read", because: "graph failed: no stream refused-id" },
      "empty-id": { kind: "read", graph: aStreamGraph([], [], { stream: "empty-id" }) },
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
      ["Nodes not read yet", "waiting", "waiting"],
    ]);
  });

  it("shows the nodes of a failed stream whose graph the runtime serves, under why it failed, each selectable as on a stopped stream", () => {
    const failedBecause = "Invalid link: link `Lkrgygd6qubqrj4jviamzuzfw` feeds a function node island into `display-uuid`, which runs in the app process";
    const failedLobbyWall: ListedStream = { ...listedStream("/w/studio", "lobby_wall"), state: "failed", failed_because: failedBecause };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [failedLobbyWall] }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", {});
    expect(rows.map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["lobby_wall", "failed", "failed"],
      [failedBecause, "unreadable", "failed"],
      ["Inputs", "graph_group", "plain"],
      ["Camera Source", "graph_node", "plain"],
      ["The look", "graph_group", "plain"],
      ["Halftone", "failed", "failed"],
      ["Display", "graph_node", "plain"],
      ["stray", "graph_node", "plain"],
    ]);
    expect(rows.find(({ row }) => row.label === "Display")?.meaning).toEqual({ kind: "node", stream: "lobby_wall-id", node: "display", display_name: "lobby_wall", project_name: "studio" });
  });

  it("says what a preparing stream is doing in place of the graph read the runtime refuses while it loads", () => {
    const preparingStream: ListedStream = { ...listedStream("/w/studio", "preparing"), state: "preparing", node_count: null, step: "making_the_venv" };
    const graphs: Record<string, StreamGraphReading> = { "preparing-id": { kind: "not_read", because: "graph failed: no stream with the id `preparing-id` is loaded in this runtime" } };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [preparingStream] }, graphs, null, { "stream:preparing-id": true });
    expect(rows.map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["preparing", "stream", "plain"],
      ["Installing the project's Python packages…", "waiting", "waiting"],
    ]);
  });

  it("shows the nodes of a stopped stream as of a playing one, and the runtime's refusal of a graph whatever the stream is doing", () => {
    const stoppedLobbyWall: ListedStream = { ...listedStream("/w/studio", "lobby_wall"), state: "stopped", node_count: null };
    const stoppedRows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [stoppedLobbyWall] }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", {});
    expect(stoppedRows.map(({ row }) => row.label)).toEqual(["lobby_wall", "Inputs", "Camera Source", "The look", "Halftone", "Display", "stray"]);
    const stoppedStream: ListedStream = { ...listedStream("/w/studio", "stopped"), state: "stopped", node_count: null };
    const graphs: Record<string, StreamGraphReading> = { "stopped-id": { kind: "not_read", because: "graph failed: the graph document could not be read" } };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [stoppedStream] }, graphs, null, { "stream:stopped-id": true });
    expect(rows.map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["stopped", "stream", "plain"],
      ["graph failed: the graph document could not be read", "unreadable", "unreadable"],
    ]);
  });

  it("shows each diagnostic of the stream's condition on the row it names, and the stream's health on its row", () => {
    const condition: StreamCondition = {
      load: "loaded",
      playback: "playing",
      health: "degraded",
      diagnostics: [
        { kind: "link_refused", place: { on: "link", from_node: "camerasource", from_port: "video", to_node: "display", to_port: "video" }, words: "the ports take different frames", recovery: "fix_the_link" },
        { kind: "node_type_not_described", place: { on: "node", node_id: "display-uuid", node_name: "display" }, words: "Display's code describes no node type", recovery: "fix_the_code" },
        { kind: "recorded_by_an_earlier_runtime", place: { on: "stream" }, words: "an earlier runtime recorded it", recovery: "restart_the_playback" },
      ],
    };
    const lobbyWall: ListedStream = { ...listedStream("/w/studio", "lobby_wall"), condition };
    const graph = LOBBY_WALL_GRAPH.kind === "read" ? LOBBY_WALL_GRAPH.graph : null;
    if (graph === null) throw new Error("the lobby wall's graph is read");
    const graphWithAStrayNotLive: StreamGraphReading = { kind: "read", graph: { ...graph, nodes: graph.nodes.map((node) => (node.name === "stray" ? { ...node, live: false } : node)) } };
    const rows = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [lobbyWall] }, { "lobby_wall-id": graphWithAStrayNotLive }, "lobby_wall-id", {});
    expect(rows.map(({ row }) => [row.label, row.icon, row.tone ?? "plain"])).toEqual([
      ["lobby_wall", "not_ready", "not_ready"],
      ["camerasource.video → display.video: the ports take different frames", "failed", "failed"],
      ["an earlier runtime recorded it", "not_ready", "not_ready"],
      ["Inputs", "graph_group", "plain"],
      ["Camera Source", "graph_node", "plain"],
      ["The look", "graph_group", "plain"],
      ["Halftone", "failed", "failed"],
      ["Display", "failed", "failed"],
      ["stray", "not_ready", "not_ready"],
    ]);
    const failedLobbyWall: ListedStream = { ...lobbyWall, condition: { ...condition, health: "failed", diagnostics: [] } };
    expect(outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams: [failedLobbyWall] }, {}, null, {}).map(({ row }) => [row.label, row.icon])).toEqual([["lobby_wall", "failed"]]);
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
      graph: aStreamGraph([], [], { stream: "lobby_wall-id", groups: [{ id: INPUTS_GROUP, title: "Inputs" }] }),
    };
    expect(tree([listedStream("/w/studio", "lobby_wall")], { "lobby_wall-id": emptyGroupGraph }, "lobby_wall-id")).toEqual(["lobby_wall · stream expanded", "  Inputs · group expanded", "    No nodes leaf"]);
  });

  it("reads the graphs of the open project's streams only", () => {
    const streams = [listedStream("/w/studio", "lobby_wall"), listedStream("/elsewhere", "other")];
    expect(streamsTheOutlinerShows(PROJECT, { kind: "listed", streams })).toEqual(["lobby_wall-id"]);
    expect(streamsTheOutlinerShows(PROJECT, { kind: "not_listed", because: "Stopped" })).toEqual([]);
  });
});

describe("selecting nodes together in the outliner", () => {
  const streams = [listedStream("/w/studio", "lobby_wall")];
  const rowsShown = outlinerTreeOfTheProject(PROJECT, { kind: "listed", streams }, { "lobby_wall-id": LOBBY_WALL_GRAPH }, "lobby_wall-id", {});
  const lobbyWall = (node: string) => ({ stream: "lobby_wall-id", node });

  it("selects a node on its own, and toggles a node in or out of the nodes of its stream selected with ⌘", () => {
    expect(selectionAfterTheOutlinerPick({ kind: "nodes", stream: "lobby_wall-id", nodes: ["display", "stray"] }, lobbyWall("Halftone"), "alone", rowsShown)).toEqual({ kind: "node", stream: "lobby_wall-id", node: "Halftone" });
    expect(selectionAfterTheOutlinerPick({ kind: "node", stream: "lobby_wall-id", node: "display" }, lobbyWall("Halftone"), "toggled", rowsShown)).toEqual({ kind: "nodes", stream: "lobby_wall-id", nodes: ["display", "Halftone"] });
    expect(selectionAfterTheOutlinerPick({ kind: "nodes", stream: "lobby_wall-id", nodes: ["display", "Halftone"] }, lobbyWall("display"), "toggled", rowsShown)).toEqual({ kind: "node", stream: "lobby_wall-id", node: "Halftone" });
    expect(selectionAfterTheOutlinerPick({ kind: "node", stream: "lobby_wall-id", node: "display" }, lobbyWall("display"), "toggled", rowsShown)).toEqual({ kind: "nothing" });
    expect(selectionAfterTheOutlinerPick({ kind: "node", stream: "door-id", node: "display" }, lobbyWall("Halftone"), "toggled", rowsShown)).toEqual({ kind: "node", stream: "lobby_wall-id", node: "Halftone" });
  });

  it("extends with ⇧ from the node picked last to the one picked, across groups in the order the rows show", () => {
    expect(selectionAfterTheOutlinerPick({ kind: "node", stream: "lobby_wall-id", node: "camerasource" }, lobbyWall("display"), "extended", rowsShown)).toEqual({
      kind: "nodes",
      stream: "lobby_wall-id",
      nodes: ["camerasource", "Halftone", "display"],
    });
    expect(selectionAfterTheOutlinerPick({ kind: "node", stream: "lobby_wall-id", node: "display" }, lobbyWall("camerasource"), "extended", rowsShown)).toEqual({
      kind: "nodes",
      stream: "lobby_wall-id",
      nodes: ["display", "Halftone", "camerasource"],
    });
    expect(selectionAfterTheOutlinerPick({ kind: "nothing" }, lobbyWall("display"), "extended", rowsShown)).toEqual({ kind: "node", stream: "lobby_wall-id", node: "display" });
  });

  it("keeps the nodes already selected when ⇧ extends again from the one picked last", () => {
    expect(selectionAfterTheOutlinerPick({ kind: "nodes", stream: "lobby_wall-id", nodes: ["camerasource", "Halftone"] }, lobbyWall("display"), "extended", rowsShown)).toEqual({
      kind: "nodes",
      stream: "lobby_wall-id",
      nodes: ["camerasource", "Halftone", "display"],
    });
  });

  it("groups the selected nodes with the edit the Stream graph's F sends, and says why it can't", () => {
    expect(groupOfTheSelectedNodes({ kind: "nodes", stream: "lobby_wall-id", nodes: ["display", "stray"] }, { "lobby_wall-id": LOBBY_WALL_GRAPH })).toEqual({
      kind: "groups",
      actions: [{ operation: "add_group", stream: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68", title: expect.any(String), nodes: ["display-uuid", "stray-uuid"] }],
    });
    expect(groupOfTheSelectedNodes({ kind: "stream", stream: "lobby_wall-id", project_folder: "/w/studio" }, { "lobby_wall-id": LOBBY_WALL_GRAPH })).toEqual({ kind: "cannot_group", because: "Select the nodes to group first." });
    expect(groupOfTheSelectedNodes(null, { "lobby_wall-id": LOBBY_WALL_GRAPH })).toEqual({ kind: "cannot_group", because: "Select the nodes to group first." });
    expect(groupOfTheSelectedNodes({ kind: "node", stream: "lobby_wall-id", node: "display" }, {})).toEqual({ kind: "cannot_group", because: "The stream's graph isn't read yet." });
    expect(groupOfTheSelectedNodes({ kind: "node", stream: "lobby_wall-id", node: "display" }, { "lobby_wall-id": { kind: "not_read", because: "graph failed: no stream" } })).toEqual({ kind: "cannot_group", because: "graph failed: no stream" });
  });
});
