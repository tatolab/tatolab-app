import type { TatoAppViewConnection, ViewAskDone } from "@tatolab/tato-app-view-sdk";
import type { MarketplaceModuleAdding, MarketplaceReading, NodeTypeSourceListed, OpenProject } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import type { MarketplaceAddFromTheSearch } from "./stream_graph_marketplace_search";
import { useMarketplaceOfTheNodeSearch } from "./use_marketplace_of_the_node_search";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const MARKETPLACE: MarketplaceReading = {
  kind: "read",
  entries: [{ kind: "package", name: "tatolab-camera", title: "Camera", summary: "", nodes: [{ name: "CameraSource", summary: "" }], runs_on_this_machine: true, needs_a_newer_runtime: false }],
};
const NIGHT_SHOW: OpenProject = { project: { folder: "/home/sam/night-show", project: "night-show-uuid", name: "night-show" }, imports: [], imports_not_listed_because: null };
const NIGHT_SHOW_WITH_THE_CAMERA: OpenProject = {
  ...NIGHT_SHOW,
  imports: [
    {
      project: "camera-uuid",
      name: "Camera",
      folder: "camera",
      copied_from: "/home/sam/.config/Tato Studio/module-downloads/tatolab-camera-0.68.85.zip",
      source: { kind: "folder", project: { folder: "/home/sam/night-show/imports/camera", project: "camera-uuid", name: "Camera" } },
    },
  ],
};
const NO_SOURCES: readonly NodeTypeSourceListed[] = [];

function drawTheSearchsMarketplace() {
  let answerTheAdd: (adding: MarketplaceModuleAdding) => void = () => undefined;
  const connection: Pick<TatoAppViewConnection, "readTheMarketplace" | "addFromTheMarketplace"> = {
    readTheMarketplace: async () => MARKETPLACE,
    addFromTheMarketplace: () =>
      new Promise((resolve) => {
        answerTheAdd = resolve;
      }),
  };
  const drawn: { adds: Readonly<Record<string, MarketplaceAddFromTheSearch>>; addThePackage: (entryName: string) => Promise<ViewAskDone> } = { adds: {}, addThePackage: async () => ({ kind: "done" }) };
  function MarketplaceReader({ openProject }: { openProject: OpenProject }) {
    const { addsByEntryName, addThePackage } = useMarketplaceOfTheNodeSearch(connection, true, openProject, NO_SOURCES);
    drawn.adds = addsByEntryName;
    drawn.addThePackage = addThePackage;
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const projectReads = async (openProject: OpenProject) => act(async () => root.render(<MarketplaceReader openProject={openProject} />));
  return { drawn, projectReads, answerTheAdd: (adding: MarketplaceModuleAdding) => act(async () => answerTheAdd(adding)) };
}

test("forgets an added package once the project lists it, even when the listing comes before the add's answer, so once removed it can be added again", async () => {
  const { drawn, projectReads, answerTheAdd } = drawTheSearchsMarketplace();
  await projectReads(NIGHT_SHOW);
  let added: Promise<ViewAskDone> = Promise.resolve({ kind: "done" });
  act(() => {
    added = drawn.addThePackage("tatolab-camera");
  });
  expect(drawn.adds).toEqual({ "tatolab-camera": { kind: "under_way" } });

  await projectReads(NIGHT_SHOW_WITH_THE_CAMERA);
  await answerTheAdd({ kind: "added", folder: "camera" });
  expect(await added).toEqual({ kind: "done" });
  expect(drawn.adds).toEqual({});

  await projectReads(NIGHT_SHOW);
  expect(drawn.adds).toEqual({});
});

test("keeps an added package adding while the project does not list it yet, and a refused one refused", async () => {
  const { drawn, projectReads, answerTheAdd } = drawTheSearchsMarketplace();
  await projectReads(NIGHT_SHOW);
  act(() => void drawn.addThePackage("tatolab-camera"));
  await answerTheAdd({ kind: "added", folder: "camera" });
  expect(drawn.adds).toEqual({ "tatolab-camera": { kind: "added" } });
  await projectReads(NIGHT_SHOW_WITH_THE_CAMERA);
  expect(drawn.adds).toEqual({});

  await projectReads(NIGHT_SHOW);
  act(() => void drawn.addThePackage("tatolab-camera"));
  await answerTheAdd({ kind: "not_added", because: "the SHA-256 did not match" });
  expect(drawn.adds).toEqual({ "tatolab-camera": { kind: "refused" } });
});
