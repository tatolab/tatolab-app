// The views a project and its imports bring, as the runtime's `list_project_views` answers them: one
// entry for each `views/<folder>/`, read from its `tatolab_view.json` without running anything, with
// whether it opens and, when not, why in the runtime's own words. Every key the window does not
// draw from is ignored.

import type { JsonValue, StudioViewOpening } from "../shared/tatolab_backend_contract.js";
import { everyOneRead, isAJsonValue, jsonObject, optionalText, parseJsonOnTheWire, requiredArray, requiredText, requiredTrueOrFalse } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** One view `list_project_views` listed: `opens`, and `not_opened_because` in the runtime's own words when it does not. */
export type ProjectViewTheRuntimeListed = ProjectViewFactsTheRuntimeListed & StudioViewOpening;

/** Whether `listedView` opens, as the window's contract carries it. */
export function studioViewOpeningOf(listedView: ProjectViewTheRuntimeListed): StudioViewOpening {
  return listedView.opens ? { opens: true, not_opened_because: null } : { opens: false, not_opened_because: listedView.not_opened_because };
}

/** What `list_project_views` lists of one view, beside whether it opens. */
export interface ProjectViewFactsTheRuntimeListed {
  /** `<project name>:<view folder>`, the node type a node of the view is. */
  view_type: string;
  /** The name of the project whose `views/` holds it. */
  project_name: string;
  /** That project's folder under `imports/`; `null` for the listed project's own view. */
  import_folder: string | null;
  /** The view's folder relative to the listed project, as `views/deck` or `imports/levels/views/meter`. */
  view_folder_in_the_project: string;
  /** Its `tatolab_view.json` as written, `null` when it is not JSON. */
  manifest: JsonValue | null;
}

/** The views `list_project_views` answered with `toolResultText`, or why they could not be read. */
export function projectViewsFromTheListProjectViewsToolResult(toolResultText: string): Result<ProjectViewTheRuntimeListed[], string> {
  const listed = viewsFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return listed.ok ? listed : failedWith(`the runtime's list_project_views result could not be read: ${listed.failure}`);
}

function viewsFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ProjectViewTheRuntimeListed[], string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the listing");
  if (!toolResult.ok) return toolResult;
  const views = requiredArray(toolResult.value, "views");
  if (!views.ok) return views;
  return everyOneRead(views.value, (listedView) => {
    const viewFields = jsonObject(listedView, "a listed view");
    if (!viewFields.ok) return viewFields;
    const viewType = requiredText(viewFields.value, "view_type");
    if (!viewType.ok) return viewType;
    const projectName = requiredText(viewFields.value, "project_name");
    if (!projectName.ok) return projectName;
    const importFolder = optionalText(viewFields.value, "import_folder");
    if (!importFolder.ok) return importFolder;
    const viewFolder = requiredText(viewFields.value, "view_folder_in_the_project");
    if (!viewFolder.ok) return viewFolder;
    const opens = requiredTrueOrFalse(viewFields.value, "opens");
    if (!opens.ok) return opens;
    const notOpenedBecause = optionalText(viewFields.value, "not_opened_because");
    if (!notOpenedBecause.ok) return notOpenedBecause;
    const manifest = viewFields.value["manifest"];
    if (manifest !== undefined && !isAJsonValue(manifest)) return failedWith("`manifest` is not JSON");
    const opening: Result<StudioViewOpening, string> = opens.value
      ? succeeded({ opens: true, not_opened_because: null })
      : notOpenedBecause.value === null
        ? failedWith(`${viewType.value} does not open and \`not_opened_because\` says no why`)
        : succeeded({ opens: false, not_opened_because: notOpenedBecause.value });
    if (!opening.ok) return opening;
    return succeeded({
      view_type: viewType.value,
      project_name: projectName.value,
      import_folder: importFolder.value,
      view_folder_in_the_project: viewFolder.value,
      manifest: manifest ?? null,
      ...opening.value,
    });
  });
}

/** The output `write_studio_view_output` published a value on: the stream, the view node's UUID and its port. */
export interface StudioViewOutputWritten {
  stream: string;
  node: string;
  port: string;
}

/** The output `write_studio_view_output` answered with `toolResultText`, or why it could not be read. */
export function studioViewOutputFromTheWriteStudioViewOutputToolResult(toolResultText: string): Result<StudioViewOutputWritten, string> {
  const written = outputFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return written.ok ? written : failedWith(`the runtime's write_studio_view_output result could not be read: ${written.failure}`);
}

function outputFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<StudioViewOutputWritten, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the output written");
  if (!toolResult.ok) return toolResult;
  const stream = requiredText(toolResult.value, "stream");
  if (!stream.ok) return stream;
  const node = requiredText(toolResult.value, "node");
  if (!node.ok) return node;
  const port = requiredText(toolResult.value, "port");
  if (!port.ok) return port;
  return succeeded({ stream: stream.value, node: node.value, port: port.value });
}
