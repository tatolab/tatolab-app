/** The `tatolab` CLI at `path`: the one in the app's bundle on macOS, the installer's link on Linux; `not_offered` with why in a build that carries none. */
export type TatolabCommandLineTool = { kind: "at"; path: string } | { kind: "not_offered"; reason: string };

/** Why a build without a `tatolab` CLI has no version of it to read. */
export const NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL = "This build of Spudnik Studio carries no tatolab command.";

/** The CLI at `path`, or not offered when there is none. */
export function tatolabCommandLineToolAt(path: string | null): TatolabCommandLineTool {
  return path === null ? { kind: "not_offered", reason: NO_TATOLAB_COMMAND_LINE_TOOL_REFUSAL } : { kind: "at", path };
}
