import { expect, test } from "vitest";
import type { OpenProjectReading } from "../../shared/tatolab_backend_contract";
import type { ListedNodeUiElement, NodeUiElementsReading } from "@tatolab/tato-app-view-sdk/node_ui_host";
import { listForEachOpenProject } from "./list_for_each_open_project";
import { NodeUiElementsListedForViews } from "./node_ui_elements_listed_for_views";
import { WatchedStudioValue } from "./watched_studio_value";

/** A project read open in the window, named `name`. */
function readOpen(name: string): OpenProjectReading {
  return { kind: "read", open_project: { project: { name, folder: `/home/sam/projects/${name}`, project: "5b2e8f14-7c3a-4d90-a6e1-0f9c3b7d2e58" }, imports: [], imports_not_listed_because: null } };
}

/** A listing whose answers the test gives, one per listing asked, in any order. */
function listingInTheTestsHands<Listed>() {
  const asked: { answer: (listed: Listed) => void; refuse: (rejection: unknown) => void }[] = [];
  const list = () =>
    new Promise<Listed>((answer, refuse) => {
      asked.push({ answer, refuse });
    });
  return { list, asked };
}

const settled = async () => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

test("each project read open asks the listing again, the latest answer winning and a late answer to an earlier one dropped", async () => {
  const openProject = new WatchedStudioValue<OpenProjectReading>({ kind: "none_open" });
  const { list, asked } = listingInTheTestsHands<string>();
  const outcomes: string[] = [];
  listForEachOpenProject(openProject.watch, { list, listed: (listed) => outcomes.push(`listed ${listed}`), notListed: (rejection) => outcomes.push(`not listed ${String(rejection)}`), noneOpen: () => outcomes.push("none open") });
  expect(outcomes).toEqual(["none open"]);

  openProject.publish(readOpen("hallways"));
  openProject.publish(readOpen("lobby-wall"));
  expect(asked).toHaveLength(2);
  asked[1]?.answer("lobby-wall's");
  asked[0]?.answer("hallways'");
  await settled();
  expect(outcomes).toEqual(["none open", "listed lobby-wall's"]);

  openProject.publish(readOpen("hallways"));
  asked[2]?.refuse("no runtime answers");
  await settled();
  expect(outcomes.at(-1)).toBe("not listed no runtime answers");
});

test("a project closed while its listing is asked tells none open, and its late answer is dropped", async () => {
  const openProject = new WatchedStudioValue<OpenProjectReading>(readOpen("hallways"));
  const { list, asked } = listingInTheTestsHands<string>();
  const outcomes: string[] = [];
  listForEachOpenProject(openProject.watch, { list, listed: (listed) => outcomes.push(`listed ${listed}`), notListed: () => outcomes.push("not listed"), noneOpen: () => outcomes.push("none open") });
  openProject.publish({ kind: "none_open" });
  asked[0]?.answer("hallways'");
  await settled();
  expect(outcomes).toEqual(["none open"]);
});

test("the window's node UI elements are published as listed, and published empty once the project closes or a later listing is refused", async () => {
  const openProject = new WatchedStudioValue<OpenProjectReading>({ kind: "none_open" });
  const { list, asked } = listingInTheTestsHands<readonly ListedNodeUiElement[]>();
  const listed = new NodeUiElementsListedForViews();
  listed.listForEachOpenProject({ listNodeUiElements: list }, openProject.watch);
  const readings: NodeUiElementsReading[] = [];
  listed.watch((reading) => readings.push(reading));
  expect(readings).toEqual([]);

  const element = { module: "studio", brought_by: "studio", script: "float_number.ts", folder_version: "0.45.0", registration: { kind: "control", type: "float", control: null }, script_serving: { kind: "served", script_url: "tatolab-app://app/core_node_ui/float_number.ts" } } satisfies ListedNodeUiElement;
  openProject.publish(readOpen("hallways"));
  asked[0]?.answer([element]);
  await settled();
  expect(readings).toEqual([{ elements: [element] }]);

  openProject.publish({ kind: "none_open" });
  expect(readings.at(-1)).toEqual({ elements: [] });

  openProject.publish(readOpen("hallways"));
  asked[1]?.answer([element]);
  await settled();
  openProject.publish(readOpen("lobby-wall"));
  asked[2]?.refuse("refused");
  await settled();
  expect(readings).toEqual([{ elements: [element] }, { elements: [] }, { elements: [element] }, { elements: [] }]);
});
