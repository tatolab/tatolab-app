import { expect, test } from "vitest";
import type { MarketplaceEntry, MarketplaceReading, NodeTypeSourceListed, OpenProject } from "@tatolab/tato-app-view-sdk/studio_readings";
import { doesChoosingThePackageAddIt, marketplaceChoiceOfTheSearchItem, marketplacePackagesInTheProject, marketplaceSearchItems } from "./stream_graph_marketplace_search";

const NIGHT_SHOW: OpenProject = {
  project: { folder: "/home/sam/night-show", project: "night-show-uuid", name: "night-show" },
  imports: [{ project: "lights-uuid", name: "Stage Lights", folder: "tatolab-stage-lights", copied_from: "/home/sam/sources/tatolab-stage-lights", source: { kind: "folder", project: { folder: "/home/sam/night-show/imports/tatolab-stage-lights", project: "lights-uuid", name: "Stage Lights" } } }],
  imports_not_listed_because: null,
};

const aPackage = (name: string, title: string, nodes: [string, string][], runsOnThisMachine = true, needsANewerRuntime = false): MarketplaceEntry => ({
  kind: "package",
  name,
  title,
  summary: `${title} for a show.`,
  nodes: nodes.map(([nodeName, summary]) => ({ name: nodeName, summary })),
  runs_on_this_machine: runsOnThisMachine,
  needs_a_newer_runtime: needsANewerRuntime,
});

const MARKETPLACE: MarketplaceReading = {
  kind: "read",
  entries: [
    aPackage("tatolab-camera", "Camera", [["CameraSource", "Frames from one camera."]]),
    aPackage("tatolab-stage-lights", "Stage Lights", [["Dimmer", "Dims a light."]]),
    aPackage("tatolab-compositor", "Compositor", [
      ["Compositor", "Stacks its inputs."],
      ["LowerThird", "Draws a name over the frame."],
    ]),
    aPackage("tatolab-browser", "Web page", [["BrowserSource", "A web page's frames."]], false),
    aPackage("tatolab-speaker", "Speaker", [["SpeakerSink", "Plays channels out loud."]], true, true),
    { kind: "sample", name: "camera-halftone", title: "Camera halftone", summary: "A camera through a halftone lens.", nodes: [{ name: "HalftoneLensEffect", summary: "Halftone dots." }], runs_on_this_machine: true, needs_a_newer_runtime: false },
  ],
};

/** The compositor's wheel, installed in the project's environment, as `list_node_types` lists it. */
const COMPOSITOR_INSTALLED: NodeTypeSourceListed = { source: "installed_distribution", distribution: "tatolab-compositor", distribution_version: "0.68.82", node_types: [], graph_generators: [], unreadable_modules: [] };

test("offers each node of a package the project neither imports nor has installed and the runtime can resolve, then each sample, after every category", () => {
  const items = marketplaceSearchItems(MARKETPLACE, NIGHT_SHOW, [COMPOSITOR_INSTALLED], {});
  expect(items.map(({ item_id, title, origin_words, listed_after_the_categories, end_words }) => [item_id, title, origin_words, listed_after_the_categories, end_words])).toEqual([
    ["marketplace_node:tatolab-camera/CameraSource", "Camera Source", "In the Camera module", { heading: "Not in night-show", aside: "Marketplace" }, { kind: "what_choosing_does", words: "Add module" }],
    ["marketplace_sample:camera-halftone", "Camera halftone", "Sample project in the Marketplace", { heading: "Sample projects", aside: "Marketplace" }, { kind: "what_choosing_does", words: "See it" }],
  ]);
  expect(items.every((item) => item.category_path === null && item.listed_above_the_categories === null)).toBe(true);
  expect(items[1]?.summary).toBe("A camera through a halftone lens. HalftoneLensEffect");
});

test("says how a package's add stands on each of its nodes, an added one still adding until the project lists it", () => {
  const items = marketplaceSearchItems(MARKETPLACE, NIGHT_SHOW, [], { "tatolab-compositor": { kind: "under_way" }, "tatolab-camera": { kind: "refused" }, "tatolab-browser": { kind: "added" } });
  expect(items.filter((item) => item.item_id.startsWith("marketplace_node:")).map((item) => [item.item_id, item.end_words])).toEqual([
    ["marketplace_node:tatolab-camera/CameraSource", { kind: "refused", words: "Not added" }],
    ["marketplace_node:tatolab-compositor/Compositor", { kind: "under_way", words: "Adding module…" }],
    ["marketplace_node:tatolab-compositor/LowerThird", { kind: "under_way", words: "Adding module…" }],
  ]);
  expect([undefined, { kind: "refused" as const }].map(doesChoosingThePackageAddIt)).toEqual([true, true]);
  expect([{ kind: "under_way" as const }, { kind: "added" as const }].map(doesChoosingThePackageAddIt)).toEqual([false, false]);
});

test("tells a package the project has by the download its import was copied from, or by its wheel named as packaging names it", () => {
  const cameraDownloaded: OpenProject = {
    ...NIGHT_SHOW,
    imports: [
      ...NIGHT_SHOW.imports,
      { project: "camera-uuid", name: "Camera", folder: "camera", copied_from: "/home/sam/.config/Tato Studio/module-downloads/tatolab-camera-0.68.85.zip", source: { kind: "folder", project: { folder: "/home/sam/night-show/imports/camera", project: "camera-uuid", name: "Camera" } } },
    ],
  };
  const compositorWheel: NodeTypeSourceListed = { ...COMPOSITOR_INSTALLED, distribution: "Tatolab_Compositor" };
  expect([...marketplacePackagesInTheProject(MARKETPLACE, cameraDownloaded, [compositorWheel])].sort()).toEqual(["tatolab-camera", "tatolab-compositor", "tatolab-stage-lights"]);
  expect(marketplaceSearchItems(MARKETPLACE, cameraDownloaded, [compositorWheel], {}).filter((item) => item.item_id.startsWith("marketplace_node:"))).toEqual([]);
});

test("offers no package while the project's node types or imports are not listed, as what it has is not known, but still its samples", () => {
  const sampleOnly = ["marketplace_sample:camera-halftone"];
  expect(marketplaceSearchItems(MARKETPLACE, NIGHT_SHOW, null, {}).map((item) => item.item_id)).toEqual(sampleOnly);
  expect(marketplaceSearchItems(MARKETPLACE, { ...NIGHT_SHOW, imports_not_listed_because: "no runtime answered" }, [], {}).map((item) => item.item_id)).toEqual(sampleOnly);
});

test("offers nothing while the catalog is not read", () => {
  expect(marketplaceSearchItems(null, NIGHT_SHOW, [], {})).toEqual([]);
  expect(marketplaceSearchItems({ kind: "not_read", because: "HTTP 404 Not Found" }, NIGHT_SHOW, [], {})).toEqual([]);
});

test("tells what choosing an item the Marketplace offers does, and nothing of any other item", () => {
  expect(marketplaceChoiceOfTheSearchItem("marketplace_node:tatolab-compositor/LowerThird")).toEqual({ kind: "add_the_package", entry_name: "tatolab-compositor" });
  expect(marketplaceChoiceOfTheSearchItem("marketplace_sample:camera-halftone")).toEqual({ kind: "open_the_sample", entry_name: "camera-halftone" });
  expect(marketplaceChoiceOfTheSearchItem("nodes.beat:Beat")).toBeNull();
  expect(marketplaceChoiceOfTheSearchItem("graph_generator:nodes.mics:mics")).toBeNull();
  expect(marketplaceChoiceOfTheSearchItem("marketplace_node:tatolab-compositor")).toBeNull();
});
