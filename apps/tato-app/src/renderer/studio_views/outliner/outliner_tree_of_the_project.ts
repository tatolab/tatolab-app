// The outliner's tree, derived from what the view is handed: the project's shape as its
// pyproject.toml files describe it, each project's streams as the runtime lists them, and the node
// types the open project and each import declare, as the runtime reads them from source.

import type { TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import type {
  ImportedProject,
  ListedStream,
  ListedStreamsReading,
  OpenProject,
  ProjectNodeTypeSource,
  ProjectNodeTypesReading,
  ProjectOnDisk,
  StudioSelection,
} from "../../view_host/studio_view_contract";
import { nodeTypeSourceChildren, nodeTypeSourceTitle, shownStudioTreeRows, type DeclarationRowMeaning, type StudioTreeNode } from "../node_type_listing_tree";

/** What a row stands for, so choosing it selects or opens the right thing. */
export type OutlinerRowMeaning =
  | { kind: "project"; project_name: string; project_folder: string | null }
  | { kind: "stream"; stream: string; display_name: string; project_name: string; project_folder: string }
  | DeclarationRowMeaning
  | { kind: "nothing_to_select" };

/** A row of the outliner and what it stands for. */
export interface OutlinerRow {
  row: TreeViewRow;
  meaning: OutlinerRowMeaning;
}

/** Rows the person opened or closed, by row id; every other row opens as the outliner opens it by default. */
export type OutlinerRowExpansionChoices = Readonly<Record<string, boolean>>;

type OutlinerTreeNode = StudioTreeNode<OutlinerRowMeaning>;

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

/** The PEP 503 form of a distribution's name, as an import's name is spelled. */
function normalizedDistributionName(distribution: string): string {
  return distribution.toLowerCase().replace(/[-_.]+/g, "-");
}

/** The source of the open project's listing that is the import `importName`'s distribution, `null` while none is listed. */
function installedDistributionSourceOf(importName: string, projectNodeTypes: ProjectNodeTypesReading | null): ProjectNodeTypeSource | null {
  if (projectNodeTypes?.kind !== "listed") return null;
  return (
    projectNodeTypes.listing.sources.find(
      (source) => source.origin.source === "installed_distribution" && normalizedDistributionName(source.origin.distribution) === importName,
    ) ?? null
  );
}

/** A "Node types" row under `parentRowId` holding `source`'s node types, generators and unreadable modules. */
function nodeTypesNode(parentRowId: string, source: ProjectNodeTypeSource, sourceTitle: string, projectDirectory: string): OutlinerTreeNode {
  const nodeTypesRowId = `${parentRowId}/node_types`;
  const children = nodeTypeSourceChildren(source, nodeTypesRowId, sourceTitle, projectDirectory);
  return {
    row: { row_id: nodeTypesRowId, label: "Node types", icon: "node_type", isHeading: true },
    meaning: { kind: "nothing_to_select" },
    isOpenByDefault: false,
    children: children.length > 0 ? children : [leafNode({ row_id: `${nodeTypesRowId}/none`, label: "Declares no node types", icon: "waiting", tone: "waiting" })],
  };
}

/** The open project's own node types: listed, waiting on the runtime, or why the runtime lists none. */
function openProjectNodeTypesNode(projectRowId: string, projectNodeTypes: ProjectNodeTypesReading | null): OutlinerTreeNode {
  if (projectNodeTypes?.kind === "listed") {
    const { listing } = projectNodeTypes;
    const ownSource = listing.sources.find((source) => source.origin.source === "project") ?? { origin: { source: "project" as const }, node_types: [], graph_generators: [], unreadable_modules: [] };
    return nodeTypesNode(projectRowId, ownSource, nodeTypeSourceTitle(ownSource.origin, listing.project_name), listing.project_directory);
  }
  const nodeTypesRowId = `${projectRowId}/node_types`;
  return {
    row: { row_id: nodeTypesRowId, label: "Node types", icon: "node_type", isHeading: true },
    meaning: { kind: "nothing_to_select" },
    isOpenByDefault: false,
    children: [
      projectNodeTypes === null
        ? leafNode({ row_id: `${nodeTypesRowId}/waiting`, label: "Node types not read yet", icon: "waiting", tone: "waiting" })
        : leafNode({ row_id: `${nodeTypesRowId}/not-listed`, label: projectNodeTypes.because, icon: "unreadable", tone: "unreadable" }),
    ],
  };
}

/** `project`'s rows: its `pyproject.toml`, then the streams the runtime lists from its folder, a row saying they wait on the runtime, or why listing them failed. */
function projectChildren(project: ProjectOnDisk, projectRowId: string, listedStreams: ListedStreamsReading): OutlinerTreeNode[] {
  const descriptionNode = leafNode({
    row_id: `${projectRowId}/pyproject`,
    label: "pyproject.toml",
    icon: "file",
    isMachineWords: true,
  });
  if (listedStreams.kind === "listing_failed") {
    return [descriptionNode, leafNode({ row_id: `${projectRowId}/streams-not-listed`, label: listedStreams.because, icon: "unreadable", tone: "unreadable" })];
  }
  const streamsOfTheProject: ListedStream[] =
    listedStreams.kind === "listed" ? listedStreams.streams.filter((stream) => stream.location?.project_directory === project.folder) : [];
  if (streamsOfTheProject.length === 0) return [descriptionNode, waitingNodeUnder(projectRowId)];
  return [
    descriptionNode,
    ...streamsOfTheProject.map(
      (stream): OutlinerTreeNode => ({
        row: {
          row_id: `stream:${stream.stream}`,
          label: stream.display_name,
          icon: stream.state === "failed" ? "failed" : "stream",
          tone: stream.state === "failed" ? "failed" : undefined,
        },
        meaning: { kind: "stream", stream: stream.stream, display_name: stream.display_name, project_name: project.name, project_folder: project.folder },
        isOpenByDefault: false,
        children: [],
      }),
    ),
  ];
}

function importNode(importedProject: ImportedProject, listedStreams: ListedStreamsReading, projectNodeTypes: ProjectNodeTypesReading | null): OutlinerTreeNode {
  const source = importedProject.source;
  const projectFolder = source.kind === "folder" ? source.project.folder : source.kind === "folder_unreadable" ? source.folder : null;
  const rowId = `project:${projectFolder ?? importedProject.name}`;
  const distributionSource = installedDistributionSourceOf(importedProject.name, projectNodeTypes);
  const importsNodeTypes =
    distributionSource === null || projectNodeTypes?.kind !== "listed"
      ? []
      : [nodeTypesNode(rowId, distributionSource, nodeTypeSourceTitle(distributionSource.origin, importedProject.name), projectNodeTypes.listing.project_directory)];
  const children = (() => {
    switch (source.kind) {
      case "folder":
        return [...projectChildren(source.project, rowId, listedStreams), ...importsNodeTypes];
      case "folder_unreadable":
        return [leafNode({ row_id: `${rowId}/refusal`, label: source.refusal, icon: "unreadable", tone: "unreadable" })];
      case "package_index":
        return importsNodeTypes.length > 0 ? importsNodeTypes : [waitingNodeUnder(rowId)];
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

function projectTree(project: OpenProject, listedStreams: ListedStreamsReading, projectNodeTypes: ProjectNodeTypesReading | null): OutlinerTreeNode {
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
        children: [...projectChildren(openProject, openProjectRowId, listedStreams), openProjectNodeTypesNode(openProjectRowId, projectNodeTypes)],
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
        children: project.imports.map((importedProject) => importNode(importedProject, listedStreams, projectNodeTypes)),
      },
    ],
  };
}

/** The outliner's rows that show for `project`, with what each stands for: a row shows when every row above it is open. `projectNodeTypes` is `null` until the open project's node types are first read. */
export function outlinerTreeOfTheProject(
  project: OpenProject,
  listedStreams: ListedStreamsReading,
  projectNodeTypes: ProjectNodeTypesReading | null,
  expansionChoices: OutlinerRowExpansionChoices,
): OutlinerRow[] {
  return shownStudioTreeRows([projectTree(project, listedStreams, projectNodeTypes)], expansionChoices);
}
