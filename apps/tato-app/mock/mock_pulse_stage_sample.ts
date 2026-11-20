// Who streamlib's sample project Pulse Stage is, read from its files as `mock_pulse_stage_project/` mirrors them: its name,
// its project UUID and its streams' asset UUIDs, which the mock's open project, its assets and its streams' locations name.

import pulseStageMainGraph from "./mock_pulse_stage_project/streams/main.graph.json?raw";
import pulseStageTitleCardGraph from "./mock_pulse_stage_project/streams/title_card.graph.json?raw";
import pulseStageTatolabProjectJson from "./mock_pulse_stage_project/tatolab-project.json?raw";

/** The string member `member` of the JSON object `text` holds; a mirrored file without it no longer reads as Pulse Stage's. */
function stringMemberOf(text: string, member: string, file: string): string {
  const parsed: unknown = JSON.parse(text);
  const value: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, member) : undefined;
  if (typeof value !== "string") throw new Error(`mock_pulse_stage_project/${file} holds no string \`${member}\``);
  return value;
}

/** The folder name Pulse Stage is run from in the mock, under the person's `streams` folder. */
export const PULSE_STAGE_FOLDER_NAME = "pulse-stage";

/** Pulse Stage's name, as its `tatolab-project.json` gives it. */
export const PULSE_STAGE_PROJECT_NAME = stringMemberOf(pulseStageTatolabProjectJson, "name", "tatolab-project.json");

/** Pulse Stage's description, as its `tatolab-project.json` gives it. */
export const PULSE_STAGE_PROJECT_DESCRIPTION = stringMemberOf(pulseStageTatolabProjectJson, "description", "tatolab-project.json");

/** Pulse Stage's project UUID, as its `tatolab-project.json` gives it. */
export const PULSE_STAGE_PROJECT = stringMemberOf(pulseStageTatolabProjectJson, "project", "tatolab-project.json");

/** Pulse Stage's stream assets' UUIDs, by stream name, as their graph documents give them. */
export const PULSE_STAGE_STREAM_ASSETS: Readonly<Record<string, string>> = {
  main: stringMemberOf(pulseStageMainGraph, "asset", "streams/main.graph.json"),
  title_card: stringMemberOf(pulseStageTitleCardGraph, "asset", "streams/title_card.graph.json"),
};
