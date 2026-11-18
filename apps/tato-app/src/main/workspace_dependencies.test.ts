import { readFile } from "node:fs/promises";
import { Effect, ManagedRuntime, Result } from "effect";
import { expect, test } from "vitest";
import type { ListedProjectDependency } from "./project_dependencies_on_the_wire.js";
import { projectViewsFromTheListProjectViewsToolResult } from "./project_views_on_the_wire.js";
import { tatolabAppLogAsEffectsLogger } from "./studio_runtime.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { workspaceDependenciesOf } from "./workspace_dependencies.js";

const NIGHT_SHOW = "/private/tmp/tl-rec053/projects/night-show";

const LOBBY_WALL_AND_DOORWAYS: ListedProjectDependency[] = ["lobby-wall", "doorways"].map((folder) => ({
  dependency: { project: `uuid-of-${folder}`, folder, source: `/private/tmp/tl-rec053/projects/${folder}`, version: "9f2c" },
  edited_files: [],
  newer_version_exists: null,
  check_refused_because: null,
}));

async function toolResultTextRecordedIn(fixtureFileName: string): Promise<string> {
  const recorded: { result: { content: { text: string }[] } } = JSON.parse(await readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8"));
  return recorded.result.content.map((content) => content.text).join("");
}

const namedByItsFolder = (projectFolder: string) => Effect.succeed({ folder: projectFolder, project: "uuid", name: projectFolder.split("/").pop() ?? "" });

test("each import carries the views the runtime lists under its folder, and none of the workspace's own or another import's", async () => {
  const listedViews = projectViewsFromTheListProjectViewsToolResult(JSON.parse(await toolResultTextRecordedIn("local-api-list-project-views-tool-result-of-night-show-importing-lobby-wall.json")));
  if (!listedViews.ok) return expect.unreachable(listedViews.failure);

  const dependencies = await Effect.runPromise(workspaceDependenciesOf(NIGHT_SHOW, LOBBY_WALL_AND_DOORWAYS, Result.succeed(listedViews.value), namedByItsFolder));

  expect(dependencies.map(({ folder, views }) => ({ folder, views }))).toEqual([
    { folder: "lobby-wall", views: { kind: "listed", views: [{ view_type_id: "lobby-wall:meter", manifest_json: expect.objectContaining({ contract: "1.0" }), opens: true, not_opened_because: null }] } },
    { folder: "doorways", views: { kind: "listed", views: [] } },
  ]);
});

test("every import says why its views were not listed, in the runtime's words, when the listing is refused", async () => {
  const refusal = await toolResultTextRecordedIn("local-api-list-project-views-refusal-for-a-folder-that-is-not-a-project.json");

  const dependencies = await Effect.runPromise(workspaceDependenciesOf(NIGHT_SHOW, LOBBY_WALL_AND_DOORWAYS, Result.fail({ words: refusal }), namedByItsFolder));

  expect(dependencies.map(({ views }) => views)).toEqual([
    { kind: "not_listed", because: "list_project_views failed: /private/tmp/tl-rec053/not-a-project holds no project: it has no tatolab-project.json" },
    { kind: "not_listed", because: "list_project_views failed: /private/tmp/tl-rec053/not-a-project holds no project: it has no tatolab-project.json" },
  ]);
});

test("an import the runtime gives no name for is listed without one, and why is written to the app's log", async () => {
  const loggedLines: string[] = [];
  const studioRuntime = ManagedRuntime.make(tatolabAppLogAsEffectsLogger(createTatolabAppLog("debug", (logLine) => loggedLines.push(logLine))));
  const doorwaysUnnamed = (projectFolder: string) =>
    projectFolder.endsWith("doorways") ? Effect.fail({ words: "list_assets failed: imports/doorways holds no project" }) : namedByItsFolder(projectFolder);

  const dependencies = await studioRuntime.runPromise(workspaceDependenciesOf(NIGHT_SHOW, LOBBY_WALL_AND_DOORWAYS, Result.succeed([]), doorwaysUnnamed));
  await studioRuntime.dispose();

  expect(dependencies.map(({ folder, name }) => ({ folder, name }))).toEqual([
    { folder: "lobby-wall", name: "lobby-wall" },
    { folder: "doorways", name: null },
  ]);
  expect(loggedLines).toEqual([
    ` WARN the runtime gave no name for an import of the workspace folder_path=${NIGHT_SHOW}/imports/doorways because="list_assets failed: imports/doorways holds no project"`,
  ]);
});
