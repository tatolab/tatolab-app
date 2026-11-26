import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk/studio_host";
import { aGraphNode, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import { describe, expect, it } from "vitest";
import type { ListedStudioView } from "../../shared/tatolab_backend_contract";
import type { JsonValue } from "./studio_view_contract";
import { AUDIO_VIDEO_PREVIEW_VIEW_TYPE, streamViewNodesOf } from "./stream_preview_view_type";
import { StudioViewTypeRegistry, type RegisteredStudioViewType } from "./studio_view_type_registry";
import { tatolabFrameViewType } from "./tatolab_frame_view_type";

const CORE_NODES = "ba5fc2b1-df25-4e86-bec3-aba1564d6233";
const PAINT_PULSE = "4f8a2d61-9c3e-4b75-a0d8-6e1f3b9c2a74";
const AUDIO_VIDEO_PREVIEW = "3c8e1f47-9a2d-4b65-8e07-d14f6a2b9c58";
const STAGE = "6a1d4e92-7b3f-4c08-a5e6-2f9c8b1d7e43";

function listedView(viewTypeId: string, project: string, projectName: string, viewFolder: string, title: string, placement: "node" | "area"): ListedStudioView {
  const manifestJson: JsonValue = { contract: "1.0", title, entry: "index.html", placement };
  return { view_type_id: viewTypeId, project, project_name: projectName, view_folder: viewFolder, import_folder: null, opens: true, not_opened_because: null, manifest_json: manifestJson, folder_url: `https://views.example/${viewFolder}/`, newer_version_blocked_because: null };
}

function outlinerViewType(): RegisteredStudioViewType {
  const manifestJson: JsonValue = { contract: "1.0", title: "Outliner", entry: "index.html", placement: "area" };
  const manifestReading = readTatolabViewManifest(manifestJson);
  if (manifestReading.kind === "not_read") return expect.unreachable(manifestReading.because);
  return tatolabFrameViewType({ ...listedView("outliner", CORE_NODES, "Tato Studio", "outliner", "Outliner", "area"), project: null }, manifestReading.manifest, { kind: "tato_studio" });
}

/** A registry listing Paint Pulse's stage, Core Nodes' Audio Video Preview and a deck placed in an area, as Paint Pulse lists them. */
function paintPulseRegistry(): StudioViewTypeRegistry {
  const registry = new StudioViewTypeRegistry([outlinerViewType()], (listed, manifest) => tatolabFrameViewType(listed, manifest, { kind: "project", project_name: listed.project_name }));
  registry.projectStudioViews.publish({
    kind: "listed",
    studio_views: [
      listedView(STAGE, PAINT_PULSE, "Paint Pulse", "stage", "Paint Pulse stage", "node"),
      listedView(AUDIO_VIDEO_PREVIEW, CORE_NODES, "Core Nodes", "audio_video_preview", "Audio Video Preview", "node"),
      listedView("e1f0c2d4-8b6a-4c37-9d15-2a7e3f9b0c68", PAINT_PULSE, "Paint Pulse", "deck", "Deck", "area"),
    ],
  });
  return registry;
}

const node = (name: string, type: string) => aGraphNode(name, { id: `id-${name}`, type, kind: "process" });

describe("the nodes the Preview shows a stream through", () => {
  it("are the nodes a node view shows, the Audio Video Preview's first and the others in the graph's order", () => {
    const graph = aStreamGraph([node("clock", "core_nodes.animation:Timer"), node("stage", STAGE), node("outliner", "outliner"), node("program", AUDIO_VIDEO_PREVIEW), node("second_stage", STAGE)], [], { stream: "main" });
    const viewNodes = streamViewNodesOf(graph, paintPulseRegistry());
    expect(viewNodes.map(({ node: viewNode, view_type }) => [viewNode.name, view_type.title])).toEqual([
      ["program", "Audio Video Preview"],
      ["stage", "Paint Pulse stage"],
      ["second_stage", "Paint Pulse stage"],
    ]);
  });

  it("are the stream's own view's nodes alone where it holds no Audio Video Preview, as Gulf Stream Neon's stage", () => {
    const graph = aStreamGraph([node("neon_horizon", "nodes.neon_horizon_renderer:NeonHorizonRenderer"), node("stage", STAGE)], [], { stream: "main" });
    expect(streamViewNodesOf(graph, paintPulseRegistry()).map(({ node: viewNode }) => viewNode.name)).toEqual(["stage"]);
  });

  it("are none where the graph holds no node a node view shows, nor while the project's views are not listed", () => {
    const graph = aStreamGraph([node("camera", "tatolab.camera.camera_source:CameraSource")], [], { stream: "main" });
    expect(streamViewNodesOf(graph, paintPulseRegistry())).toEqual([]);
    const unlisted = new StudioViewTypeRegistry([outlinerViewType()]);
    expect(streamViewNodesOf(aStreamGraph([node("stage", STAGE)], [], { stream: "main" }), unlisted)).toEqual([]);
  });

  it("finds the Audio Video Preview by Core Nodes' UUID and its folder, whatever type the runtime lists it as", () => {
    expect(paintPulseRegistry().viewTypeIdOf(AUDIO_VIDEO_PREVIEW_VIEW_TYPE)).toBe(AUDIO_VIDEO_PREVIEW);
  });
});
