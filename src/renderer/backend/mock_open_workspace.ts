// The mock's open workspace: the pattern project the mock runtime lists streams from, importing the
// camera and lobby-recorder projects by folder, one folder import whose pyproject does not parse,
// and a package from the index. `?workspace=none|unreadable` opens none, or one that cannot be read.

import type { OpenWorkspaceReading, ProjectOnDisk } from "../../shared/tatolab_backend_contract";

/** What `?workspace=` names. */
export type MockOpenWorkspaceScenario = "read" | "none" | "unreadable";

/** The scenario `?workspace=` names: `read` unless it names `none` or `unreadable`. */
export function mockOpenWorkspaceScenarioNamed(workspaceInTheQuery: string | null): MockOpenWorkspaceScenario {
  return workspaceInTheQuery === "none" || workspaceInTheQuery === "unreadable" ? workspaceInTheQuery : "read";
}

function mockProject(folder: string, name: string, requirements: string[]): ProjectOnDisk {
  return { folder, name, requirements };
}

/** The mock's workspace in `homeDirectory`'s `streams/pattern`, as `scenario` has it. */
export function mockOpenWorkspaceReading(scenario: MockOpenWorkspaceScenario, homeDirectory: string): OpenWorkspaceReading {
  const streamsFolder = `${homeDirectory}/streams`;
  const workspaceFolder = `${streamsFolder}/pattern`;
  switch (scenario) {
    case "none":
      return { kind: "none_open" };
    case "unreadable":
      return {
        kind: "unreadable",
        folder: workspaceFolder,
        refusal: `${workspaceFolder}/pyproject.toml is not TOML: Invalid TOML document: unexpected end of line at line 4, column 14`,
      };
    case "read":
      return {
        kind: "read",
        workspace: {
          workspace_project: mockProject(workspaceFolder, "pattern", ["tatolab-stream>=0.55", "camera", "lobby-recorder", "stage-lights", "tatolab-testpattern>=0.3"]),
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
                folder: `${workspaceFolder}/imports/stage-lights`,
                refusal: `${workspaceFolder}/imports/stage-lights has no pyproject.toml.`,
              },
            },
            { name: "tatolab-testpattern", requirement: "tatolab-testpattern>=0.3", source: { kind: "package_index" } },
          ],
        },
      };
  }
}
