// The mock's open project: the pattern project the mock runtime lists streams from, importing the
// camera and lobby-recorder projects, and one import whose copy the runtime cannot read.
// `?project=none|unreadable` opens none, or one that cannot be read.
// The Projects window lists the recent projects: the pattern, camera and lobby-recorder projects and three more,
// one gone from disk, four described and four with a last edit; `?recent=none` lists none, as on first run. Documents/Tato Studio already
// holds an `Untitled project`, so New project suggests `Untitled project 2`, and Browse… answers ~/Shows.

import { projectNameNumbered, untitledProjectNameNumbered } from "../src/shared/new_project_folder_name";
import type { NewProjectDefaults, OpenProjectReading, ProjectArchiveChosenToImport, ProjectTheRuntimeNames, RecentProject } from "../src/shared/tatolab_backend_contract";
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
  const recentProject = (
    folder: string,
    projectName: string | null,
    projectDescription: string | null,
    editedHoursAgo: number | null,
    openedHours: number,
    hasAChosenCover = false,
  ): RecentProject => ({
    folder,
    project_name: projectName,
    project_description: projectDescription,
    last_edited_at_wall_clock_ms: editedHoursAgo === null ? null : openedHoursAgo(editedHoursAgo),
    has_a_chosen_cover: hasAChosenCover,
    last_opened_at_wall_clock_ms: openedHoursAgo(openedHours),
  });
  return [
    recentProject(`${streamsFolder}/pattern`, "pattern", "The project tatolab new makes: a test pattern through a halftone effect into a brightness meter.", 0.1, 2, true),
    recentProject(`${streamsFolder}/night-market-visuals`, "night-market-visuals", "Projection loops for the night market's north wall.", 20, 26, true),
    recentProject(`${streamsFolder}/camera`, "camera", "Camera test bench for the new capture cards.", 75, 75),
    recentProject(`${streamsFolder}/lobby-recorder`, "lobby-recorder", null, 170, 170),
    recentProject(`${streamsFolder}/gallery-wall`, "gallery-wall", null, null, 400),
    recentProject(`${homeDirectory}/Desktop/old-sketch`, null, null, null, 900),
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
export function mockNewProjectsFolder(homeDirectory: string): string {
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

/** The `.zip` the mock's import dialog answers, in Downloads, and where the Import project sheet starts for it among `foldersOnDisk`. */
export function mockProjectArchiveTheDialogAnswers(homeDirectory: string, foldersOnDisk: readonly string[]): ProjectArchiveChosenToImport {
  const location = mockNewProjectsFolder(homeDirectory);
  return { archive: `${homeDirectory}/Downloads/halftone-webcam-main.zip`, location, name: mockFirstNameNothingHolds(location, "halftone-webcam-main", foldersOnDisk) };
}

/** The first of `name`, `name 2`, … that no folder in `foldersOnDisk` holds in `location`. */
export function mockFirstNameNothingHolds(location: string, name: string, foldersOnDisk: readonly string[]): string {
  for (let number = 1; ; number += 1) {
    const numberedName = projectNameNumbered(name, number);
    if (!foldersOnDisk.includes(`${location}/${numberedName}`)) return numberedName;
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

/** A cover image the mock serves for a project shown by a chosen image: sweeping arcs on a dark ground, in one of two colourings. */
export function mockProjectCoverImageUrl(colouring: "arcs" | "stripes"): string {
  const coverPicture =
    colouring === "arcs"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><rect width="480" height="270" fill="#10131c"/><path d="M-40 150 Q240 60 520 120" stroke="#6f9bff" stroke-width="5" fill="none" opacity=".85"/><path d="M-20 190 Q240 120 500 200" stroke="#3fcf8e" stroke-width="5" fill="none" opacity=".7"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><defs><pattern id="s" width="22" height="270" patternUnits="userSpaceOnUse"><rect width="2" height="270" fill="#e07a5f" opacity=".3"/></pattern></defs><rect width="480" height="270" fill="#2a1b17"/><rect width="480" height="270" fill="url(#s)"/><text x="28" y="240" font-family="sans-serif" font-size="34" font-weight="700" fill="#f2b9a6">NIGHT MARKET</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(coverPicture)}`;
}
