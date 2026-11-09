// The mock's open project: the pattern project the mock runtime lists streams from, importing the
// camera and lobby-recorder projects, and one import whose copy the runtime cannot read.
// `?project=none|unreadable` opens none, or one that cannot be read.
// The Projects window lists the recent projects: the pattern, camera and lobby-recorder projects and three more,
// one gone from disk; `?recent=none` lists none, as on first run. Documents/Tato Studio already
// holds an `Untitled project`, so New project suggests `Untitled project 2`, and Browse… answers ~/Shows.

import { untitledProjectNameNumbered } from "../src/shared/new_project_folder_name";
import type { NewProjectDefaults, OpenProjectReading, ProjectTheRuntimeNames, RecentProject } from "../src/shared/tatolab_backend_contract";
import { MOCK_CAMERA_IMPORT_PROJECT, MOCK_LOBBY_RECORDER_IMPORT_PROJECT } from "./mock_project_node_types";

/** What `?project=` names. */
export type MockOpenProjectScenario = "read" | "none" | "unreadable";

/** The scenario `?project=` names: `read` unless it names `none` or `unreadable`. */
export function mockOpenProjectScenarioNamed(projectInTheQuery: string | null): MockOpenProjectScenario {
  return projectInTheQuery === "none" || projectInTheQuery === "unreadable" ? projectInTheQuery : "read";
}

const MOCK_PATTERN_PROJECT = "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90";
const MOCK_STAGE_LIGHTS_IMPORT_PROJECT = "c05e2b9a-4f61-4d3e-9a7b-1e8d6c2f4a07";

function mockProject(folder: string, project: string, name: string): ProjectTheRuntimeNames {
  return { folder, project, name };
}

/** The mock's project in `homeDirectory`'s `streams/pattern`, as `scenario` has it. */
export function mockOpenProjectReading(scenario: MockOpenProjectScenario, homeDirectory: string): OpenProjectReading {
  const streamsFolder = `${homeDirectory}/streams`;
  const projectFolder = `${streamsFolder}/pattern`;
  switch (scenario) {
    case "none":
      return { kind: "none_open" };
    case "unreadable":
      return {
        kind: "unreadable",
        folder: projectFolder,
        refusal: `list_assets failed: ${projectFolder} holds no project: it has no tatolab-project.json`,
      };
    case "read":
      return {
        kind: "read",
        open_project: {
          project: mockProject(projectFolder, MOCK_PATTERN_PROJECT, "pattern"),
          imports: [
            {
              project: MOCK_CAMERA_IMPORT_PROJECT,
              name: "camera",
              folder: "camera",
              source: { kind: "folder", project: mockProject(`${streamsFolder}/camera`, MOCK_CAMERA_IMPORT_PROJECT, "camera") },
            },
            {
              project: MOCK_LOBBY_RECORDER_IMPORT_PROJECT,
              name: "lobby-recorder",
              folder: "lobby-recorder",
              source: { kind: "folder", project: mockProject(`${streamsFolder}/lobby-recorder`, MOCK_LOBBY_RECORDER_IMPORT_PROJECT, "lobby-recorder") },
            },
            {
              project: MOCK_STAGE_LIGHTS_IMPORT_PROJECT,
              name: "stage-lights",
              folder: "stage-lights",
              source: {
                kind: "folder_unreadable",
                folder: `${projectFolder}/imports/stage-lights`,
                refusal: `list_assets failed: ${projectFolder}/imports/stage-lights holds no project: it has no tatolab-project.json`,
              },
            },
          ],
          imports_not_listed_because: null,
        },
      };
  }
}

const MILLISECONDS_IN_AN_HOUR = 60 * 60 * 1000;

/** The mock's recent projects, recent first, as last opened before `wallClockNowMs`; none with `?recent=none`. */
export function mockRecentProjects(recentInTheQuery: string | null, homeDirectory: string, wallClockNowMs: number): RecentProject[] {
  if (recentInTheQuery === "none") return [];
  const streamsFolder = `${homeDirectory}/streams`;
  const openedHoursAgo = (hours: number) => wallClockNowMs - hours * MILLISECONDS_IN_AN_HOUR;
  return [
    { folder: `${streamsFolder}/pattern`, project_name: "pattern", last_opened_at_wall_clock_ms: openedHoursAgo(2) },
    { folder: `${streamsFolder}/night-market-visuals`, project_name: "night-market-visuals", last_opened_at_wall_clock_ms: openedHoursAgo(26) },
    { folder: `${streamsFolder}/camera`, project_name: "camera", last_opened_at_wall_clock_ms: openedHoursAgo(75) },
    { folder: `${streamsFolder}/lobby-recorder`, project_name: "lobby-recorder", last_opened_at_wall_clock_ms: openedHoursAgo(170) },
    { folder: `${streamsFolder}/gallery-wall`, project_name: "gallery-wall", last_opened_at_wall_clock_ms: openedHoursAgo(400) },
    { folder: `${homeDirectory}/Desktop/old-sketch`, project_name: null, last_opened_at_wall_clock_ms: openedHoursAgo(900) },
  ];
}

/** The project a recent `folder` reads as when it opens: the pattern project for its folder, one importing nothing for another that reads, unreadable for one gone from disk. */
export function mockRecentProjectReading(recentProject: RecentProject, homeDirectory: string): OpenProjectReading {
  const patternReading = mockOpenProjectReading("read", homeDirectory);
  if (patternReading.kind === "read" && patternReading.open_project.project.folder === recentProject.folder) return patternReading;
  if (recentProject.project_name === null) return { kind: "unreadable", folder: recentProject.folder, refusal: `list_assets failed: ${recentProject.folder} holds no project: it has no tatolab-project.json` };
  return {
    kind: "read",
    open_project: {
      project: mockProject(recentProject.folder, crypto.randomUUID(), recentProject.project_name),
      imports: [],
      imports_not_listed_because: null,
    },
  };
}

/** The mock's `Documents/Tato Studio` under `homeDirectory`, where New project suggests a project goes. */
function mockNewProjectsFolder(homeDirectory: string): string {
  return `${homeDirectory}/Documents/Tato Studio`;
}

/** The folders the mock's `Documents/Tato Studio` already holds. */
export function mockFoldersInDocumentsTatoStudio(homeDirectory: string): string[] {
  return [`${mockNewProjectsFolder(homeDirectory)}/${untitledProjectNameNumbered(1)}`];
}

/** `Documents/Tato Studio` and the first untitled name no folder in `foldersOnDisk` holds there. */
export function mockNewProjectDefaults(homeDirectory: string, foldersOnDisk: readonly string[]): NewProjectDefaults {
  const location = mockNewProjectsFolder(homeDirectory);
  for (let number = 1; ; number += 1) {
    const name = untitledProjectNameNumbered(number);
    if (!foldersOnDisk.includes(`${location}/${name}`)) return { location, name };
  }
}

/** The folder the mock's location dialog answers. */
export function mockNewProjectLocationTheDialogAnswers(homeDirectory: string): string {
  return `${homeDirectory}/Shows`;
}

/** A project just made in `folder` as `name`, named after its folder as the runtime names a new project, and importing nothing. */
export function mockNewProjectReading(folder: string, name: string): OpenProjectReading {
  return {
    kind: "read",
    open_project: {
      project: mockProject(folder, crypto.randomUUID(), name.trim()),
      imports: [],
      imports_not_listed_because: null,
    },
  };
}
