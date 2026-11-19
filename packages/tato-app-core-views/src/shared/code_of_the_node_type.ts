// Where a node type's code is, read from what `list_node_types` and `describe_node_types` answer: the file
// that declares it and the line it is declared at, which the Code view opens on, or why it has no file to
// open, in words a person reads.

import type { ImportedProject, ProjectNodeTypesDescribedReading, TatoAppViewConnection, ViewAskDone, ViewOpeningTarget } from "@tatolab/tato-app-view-sdk";
import { CODE_VIEW_TYPE_ID } from "./files_the_code_view_opens";
import { fileUnderTheFolder, nodeTypeSourceTitle } from "./node_type_listing_tree";

/** A node type's code as the Code view opens it, which it shows read-only when it is an import's; or why it has none to open. */
export type CodeOfTheNodeType = { kind: "opens"; on: Extract<ViewOpeningTarget, { kind: "file" }> } | { kind: "does_not_open"; because: string };

/**
 * The code of `nodeType` as the project's listing `nodeTypes` has it: the project's own file, or the file of the import
 * `imports` holds by the UUID the listing gives, at the line the type is declared at; a built-in's or an installed
 * distribution's has none Studio opens.
 */
export function codeOfTheNodeType(nodeTypes: ProjectNodeTypesDescribedReading | null, imports: readonly ImportedProject[], nodeType: string): CodeOfTheNodeType {
  if (nodeTypes === null) return { kind: "does_not_open", because: "Studio is still reading the project's node types." };
  if (nodeTypes.kind === "not_listed") return { kind: "does_not_open", because: `The runtime lists no node types: ${nodeTypes.because}` };
  const source = nodeTypes.node_types.listing.sources.find((listedSource) => listedSource.node_types.some((listed) => listed.node_type === nodeType));
  if (source === undefined) return { kind: "does_not_open", because: `The runtime lists no node type ${nodeType} for this project.` };
  if (source.source === "built_in") return { kind: "does_not_open", because: `${nodeType} is built into the runtime, which ships no file of its code.` };
  if (source.source === "installed_distribution") return { kind: "does_not_open", because: `${nodeType} comes from ${nodeTypeSourceTitle(source)}, installed with the runtime, not from a file of the project.` };
  const described = nodeTypes.node_types.described.find((describedType) => describedType.node_type === nodeType);
  if (described === undefined) return { kind: "does_not_open", because: `The runtime has not described ${nodeType} yet.` };
  if ("not_described_because" in described) return { kind: "does_not_open", because: `The runtime couldn't describe ${nodeType}: ${described.not_described_because.runtime_words}` };
  const declaredAt = described.declared_at ?? null;
  if (declaredAt === null) return { kind: "does_not_open", because: `The runtime doesn't say which file declares ${nodeType}.` };
  const line = declaredAt.line ?? null;
  const on = (folder: string): Extract<ViewOpeningTarget, { kind: "file" }> =>
    line === null ? { kind: "file", file: fileUnderTheFolder(folder, declaredAt.path) } : { kind: "file", file: fileUnderTheFolder(folder, declaredAt.path), line };
  if (source.source === "project") return { kind: "opens", on: on(nodeTypes.node_types.listing.project_directory) };
  const importedProject = imports.find((imported) => imported.project === source.project);
  if (importedProject === undefined) return { kind: "does_not_open", because: `${nodeType} comes from ${nodeTypeSourceTitle(source)}, which the open project doesn't import.` };
  if (importedProject.source.kind === "folder_unreadable") return { kind: "does_not_open", because: `${nodeTypeSourceTitle(source)} can't be read: ${importedProject.source.refusal}` };
  return { kind: "opens", on: on(importedProject.source.project.folder) };
}

/** Open the Code view on `code`, a node type's code, or answer why it has none to open as Studio answers a refused ask. */
export function openTheCodeOfTheNodeType(connection: Pick<TatoAppViewConnection, "openView">, code: CodeOfTheNodeType): Promise<ViewAskDone> {
  return code.kind === "opens" ? connection.openView(CODE_VIEW_TYPE_ID, code.on) : Promise.resolve({ kind: "refused", because: code.because });
}
