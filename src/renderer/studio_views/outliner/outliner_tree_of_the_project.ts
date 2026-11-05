// The outliner's tree, derived from what the view is handed: the project's shape as its
// pyproject.toml files describe it, and each project's streams as the runtime lists them.

import type { TreeViewRow } from "../../design_system/tree_view";
import type { ImportedProject, ListedStream, ListedStreamsReading, OpenProject, ProjectOnDisk, StudioSelection } from "../../view_host/studio_view_contract";

/** What a row stands for, so choosing it selects or opens the right thing. */
export type OutlinerRowMeaning =
  | { kind: "project"; project_name: string; project_folder: string | null }
  | { kind: "stream"; stream: string; display_name: string; project_name: string; project_folder: string }
  | { kind: "nothing_to_select" };

/** A row of the outliner and what it stands for. */
export interface OutlinerRow {
  row: TreeViewRow;
  meaning: OutlinerRowMeaning;
}

/** Rows the person opened or closed, by row id; every other row opens as the outliner opens it by default. */
export type OutlinerRowExpansionChoices = Readonly<Record<string, boolean>>;

/** A row before the tree decides whether it shows: its own fields, its children, and whether it opens by default. */
interface OutlinerTreeNode {
  row: Omit<TreeViewRow, "depth" | "expansion">;
  meaning: OutlinerRowMeaning;
  isOpenByDefault: boolean;
  children: OutlinerTreeNode[];
}

/** The id of the row that stands for `selection`, or `null` when no row does. */
export function outlinerRowIdOfTheSelection(selection: StudioSelection): string | null {
  switch (selection.kind) {
    case "nothing":
      return null;
    case "project":
      return `project:${selection.project_folder ?? selection.project_name}`;
    case "stream":
    case "node":
      return `stream:${selection.stream}`;
  }
}

function leafNode(row: OutlinerTreeNode["row"]): OutlinerTreeNode {
  return { row, meaning: { kind: "nothing_to_select" }, isOpenByDefault: false, children: [] };
}

function waitingNodeUnder(parentRowId: string): OutlinerTreeNode {
  return leafNode({
    row_id: `${parentRowId}/waiting`,
    label: "Streams and nodes not read yet",
    icon: "waiting",
    tone: "waiting",
  });
}

/** `project`'s rows: its `pyproject.toml`, then the streams the runtime lists from its folder, or a row saying they wait on the runtime. */
function projectChildren(project: ProjectOnDisk, projectRowId: string, listedStreams: ListedStreamsReading): OutlinerTreeNode[] {
  const descriptionNode = leafNode({
    row_id: `${projectRowId}/pyproject`,
    label: "pyproject.toml",
    icon: "file",
    isMachineWords: true,
  });
  const streamsOfTheProject: ListedStream[] =
    listedStreams.kind === "listed" ? listedStreams.streams.filter((stream) => stream.location?.project_directory === project.folder) : [];
  if (streamsOfTheProject.length === 0) return [descriptionNode, waitingNodeUnder(projectRowId)];
  return [
    descriptionNode,
    ...streamsOfTheProject.map(
      (stream): OutlinerTreeNode => ({
        row: { row_id: `stream:${stream.stream}`, label: streamFunctionName(stream), icon: "stream", isMachineWords: true },
        meaning: { kind: "stream", stream: stream.stream, display_name: stream.display_name, project_name: project.name, project_folder: project.folder },
        isOpenByDefault: false,
        children: [],
      }),
    ),
  ];
}

/** The function a stream runs, without its module: `main` for `stream:main`; its display name for a record that names none. */
function streamFunctionName(stream: ListedStream): string {
  const streamFunction = stream.location?.stream_function;
  return streamFunction === undefined ? stream.display_name : (streamFunction.split(":").at(-1) ?? streamFunction);
}

function importNode(importedProject: ImportedProject, listedStreams: ListedStreamsReading): OutlinerTreeNode {
  const source = importedProject.source;
  const projectFolder = source.kind === "folder" ? source.project.folder : source.kind === "folder_unreadable" ? source.folder : null;
  const rowId = `project:${projectFolder ?? importedProject.name}`;
  const children = (() => {
    switch (source.kind) {
      case "folder":
        return projectChildren(source.project, rowId, listedStreams);
      case "folder_unreadable":
        return [leafNode({ row_id: `${rowId}/refusal`, label: source.refusal, icon: "unreadable", tone: "unreadable" })];
      case "package_index":
        return [waitingNodeUnder(rowId)];
    }
  })();
  return {
    row: {
      row_id: rowId,
      label: importedProject.name,
      icon: source.kind === "folder_unreadable" ? "unreadable" : "project",
      isHeading: true,
      isReadOnly: true,
    },
    meaning: { kind: "project", project_name: importedProject.name, project_folder: projectFolder },
    isOpenByDefault: false,
    children,
  };
}

/** The base name of `folder`, the project's name in the tree. */
function folderBaseName(folder: string): string {
  return folder.split(/[\\/]/).filter((pathPart) => pathPart !== "").at(-1) ?? folder;
}

function projectTree(project: OpenProject, listedStreams: ListedStreamsReading): OutlinerTreeNode {
  const openProject = project.project;
  const openProjectRowId = `project:${openProject.folder}`;
  return {
    row: { row_id: "open_project_folder", label: folderBaseName(openProject.folder), icon: "project_folder", isHeading: true },
    meaning: { kind: "nothing_to_select" },
    isOpenByDefault: true,
    children: [
      {
        row: { row_id: openProjectRowId, label: openProject.name, icon: "project", isHeading: true },
        meaning: { kind: "project", project_name: openProject.name, project_folder: openProject.folder },
        isOpenByDefault: true,
        children: projectChildren(openProject, openProjectRowId, listedStreams),
      },
      {
        row: {
          row_id: "imports",
          label: "Imports",
          icon: "imports",
          tone: "imports",
          isHeading: true,
          isReadOnly: true,
        },
        meaning: { kind: "nothing_to_select" },
        isOpenByDefault: false,
        children: project.imports.map((importedProject) => importNode(importedProject, listedStreams)),
      },
    ],
  };
}

/** The outliner's rows that show for `project`, with what each stands for: a row shows when every row above it is open. */
export function outlinerTreeOfTheProject(
  project: OpenProject,
  listedStreams: ListedStreamsReading,
  expansionChoices: OutlinerRowExpansionChoices,
): OutlinerRow[] {
  const shownRows: OutlinerRow[] = [];
  const walk = (node: OutlinerTreeNode, depth: number) => {
    const isOpen = node.children.length > 0 && (expansionChoices[node.row.row_id] ?? node.isOpenByDefault);
    shownRows.push({
      row: { ...node.row, depth, expansion: node.children.length === 0 ? "leaf" : isOpen ? "expanded" : "collapsed" },
      meaning: node.meaning,
    });
    if (isOpen) for (const child of node.children) walk(child, depth + 1);
  };
  walk(projectTree(project, listedStreams), 0);
  return shownRows;
}
