// The mock's open project: the pattern project the mock runtime lists streams from, importing the
// camera and lobby-recorder projects by folder, one folder import whose pyproject does not parse,
// and a package from the index. `?project=none|unreadable` opens none, or one that cannot be read.
// The Projects window lists the recent projects: the pattern, camera and lobby-recorder projects and three more,
// one gone from disk; `?recent=none` lists none, as on first run.

import type { OpenProjectReading, ProjectOnDisk, RecentProject } from "../../shared/tatolab_backend_contract";

/** What `?project=` names. */
export type MockOpenProjectScenario = "read" | "none" | "unreadable";

/** The scenario `?project=` names: `read` unless it names `none` or `unreadable`. */
export function mockOpenProjectScenarioNamed(projectInTheQuery: string | null): MockOpenProjectScenario {
  return projectInTheQuery === "none" || projectInTheQuery === "unreadable" ? projectInTheQuery : "read";
}

function mockProject(folder: string, name: string, requirements: string[]): ProjectOnDisk {
  return { folder, name, requirements };
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
        refusal: `${projectFolder}/pyproject.toml is not TOML: Invalid TOML document: unexpected end of line at line 4, column 14`,
      };
    case "read":
      return {
        kind: "read",
        open_project: {
          project: mockProject(projectFolder, "pattern", ["tatolab-stream>=0.55", "camera", "lobby-recorder", "stage-lights", "tatolab-testpattern>=0.3"]),
          imports: [
            { name: "tatolab-stream", requirement: "tatolab-stream>=0.55", source: { kind: "package_index" } },
            { name: "camera", requirement: "camera", source: { kind: "folder", project: mockProject(`${streamsFolder}/camera`, "camera", ["tatolab-stream>=0.55"]) } },
            {
              name: "lobby-recorder",
              requirement: "lobby-recorder",
              source: { kind: "folder", project: mockProject(`${streamsFolder}/lobby-recorder`, "lobby-recorder", ["tatolab-stream>=0.55"]) },
            },
            {
              name: "stage-lights",
              requirement: "stage-lights",
              source: {
                kind: "folder_unreadable",
                folder: `${projectFolder}/imports/stage-lights`,
                refusal: `${projectFolder}/imports/stage-lights has no pyproject.toml.`,
              },
            },
            { name: "tatolab-testpattern", requirement: "tatolab-testpattern>=0.3", source: { kind: "package_index" } },
          ],
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
  if (recentProject.project_name === null) return { kind: "unreadable", folder: recentProject.folder, refusal: `${recentProject.folder} has no pyproject.toml.` };
  return {
    kind: "read",
    open_project: {
      project: mockProject(recentProject.folder, recentProject.project_name, ["tatolab-stream>=0.55"]),
      imports: [{ name: "tatolab-stream", requirement: "tatolab-stream>=0.55", source: { kind: "package_index" } }],
    },
  };
}
