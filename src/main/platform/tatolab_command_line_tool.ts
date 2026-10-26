/** The `tatolab` CLI at `path`: the one in the app's bundle on macOS, the installer's link on Linux; `not_offered` with why in a build that carries none. */
export type TatolabCommandLineTool = { kind: "at"; path: string } | { kind: "not_offered"; reason: string };

/** Why a build without a `tatolab` CLI cannot create a project. */
export const NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL = "This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead.";

/** The CLI at `path`, or not offered when there is none. */
export function tatolabCommandLineToolAt(path: string | null): TatolabCommandLineTool {
  return path === null ? { kind: "not_offered", reason: NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL } : { kind: "at", path };
}
