// The rows the palette and the outliner show of a project's node types, derived from what
// `list_project_node_types` lists: each source's node types by category, its graph generators, and
// each module of it that does not parse, with why in the parser's own words.

import type { TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import type { ProjectGraphGenerator, ProjectNodeModuleNotReadable, ProjectNodeType, ProjectNodeTypeSource, ProjectNodeTypeSourceOrigin } from "../view_host/studio_view_contract";

/** What a node type, graph generator or unreadable module row stands for, with its file as an absolute path when it is the project's own source. */
export type DeclarationRowMeaning =
  | { kind: "node_type_declaration"; node_type: ProjectNodeType; source_title: string; file: string | null }
  | { kind: "graph_generator_declaration"; graph_generator: ProjectGraphGenerator; source_title: string; file: string | null }
  | { kind: "unreadable_module"; unreadable_module: ProjectNodeModuleNotReadable; source_title: string; file: string | null };

/** A row that stands for nothing to choose, as a heading. */
export type NothingToChooseRowMeaning = { kind: "nothing_to_select" };

/** A row before the tree decides whether it shows: its own fields, what it stands for, its children, and whether it opens by default. */
export interface StudioTreeNode<RowMeaning> {
  row: Omit<TreeViewRow, "depth" | "expansion">;
  meaning: RowMeaning;
  isOpenByDefault: boolean;
  children: StudioTreeNode<RowMeaning>[];
}

/** A row of a tree as it shows, and what it stands for. */
export interface ShownStudioTreeRow<RowMeaning> {
  row: TreeViewRow;
  meaning: RowMeaning;
}

/** The rows of `roots` that show, top to bottom: a row shows when every row above it is open, as `expansionChoices` or its default has it. */
export function shownStudioTreeRows<RowMeaning>(
  roots: readonly StudioTreeNode<RowMeaning>[],
  expansionChoices: Readonly<Record<string, boolean>>,
): ShownStudioTreeRow<RowMeaning>[] {
  const shownRows: ShownStudioTreeRow<RowMeaning>[] = [];
  const walk = (node: StudioTreeNode<RowMeaning>, depth: number) => {
    const isOpen = node.children.length > 0 && (expansionChoices[node.row.row_id] ?? node.isOpenByDefault);
    shownRows.push({ row: { ...node.row, depth, expansion: node.children.length === 0 ? "leaf" : isOpen ? "expanded" : "collapsed" }, meaning: node.meaning });
    if (isOpen) for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return shownRows;
}

/** The words a source is titled with: the project's name for its own code, a linked dependency's UUID and pin, or a distribution's name and version. */
export function nodeTypeSourceTitle(origin: ProjectNodeTypeSourceOrigin, projectName: string): string {
  switch (origin.source) {
    case "project":
      return projectName;
    case "dependency":
      return `${origin.project} at ${origin.revision}`;
    case "installed_distribution":
      return `${origin.distribution} ${origin.distribution_version}`;
    case "newer_than_this_app":
      return origin.source_name;
  }
}

/** A stable key for the source `origin`, unique within one listing. */
export function nodeTypeSourceKey(origin: ProjectNodeTypeSourceOrigin): string {
  switch (origin.source) {
    case "project":
      return "project";
    case "dependency":
      return `dependency:${origin.project}`;
    case "installed_distribution":
      return `distribution:${origin.distribution}`;
    case "newer_than_this_app":
      return `source:${origin.source_name}`;
  }
}

/** The name a node type is shown by: the qualified name after its module. */
export function nodeTypeShortName(importPath: string): string {
  const separatorAt = importPath.lastIndexOf(":");
  return separatorAt === -1 ? importPath : importPath.slice(separatorAt + 1);
}

/** Where a module stopped the parser, as `path:line:column`, as far as the runtime says. */
export function whereTheModuleStoppedTheParser(unreadableModule: ProjectNodeModuleNotReadable): string {
  const line = unreadableModule.line === null ? "" : `:${unreadableModule.line}`;
  const column = unreadableModule.line === null || unreadableModule.column === null ? "" : `:${unreadableModule.column}`;
  return `${unreadableModule.path}${line}${column}`;
}

/** `relativePath` under `projectDirectory`, for the project's own source; `null` for any other, whose files are not the project's to open. */
function declaringFileOf(origin: ProjectNodeTypeSourceOrigin, projectDirectory: string, relativePath: string | null): string | null {
  if (origin.source !== "project" || relativePath === null) return null;
  return `${projectDirectory.replace(/\/+$/, "")}/${relativePath}`;
}

function compareByText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The rows under a source's row `sourceRowId`: each category with its node types, its graph generators, then each module that does not parse. */
export function nodeTypeSourceChildren(
  source: ProjectNodeTypeSource,
  sourceRowId: string,
  sourceTitle: string,
  projectDirectory: string,
): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] {
  const nodeTypesByCategory = new Map<string, ProjectNodeType[]>();
  for (const nodeType of [...source.node_types].sort((left, right) => compareByText(left.type, right.type))) {
    nodeTypesByCategory.set(nodeType.category, [...(nodeTypesByCategory.get(nodeType.category) ?? []), nodeType]);
  }
  const categoryNodes = [...nodeTypesByCategory.entries()]
    .sort(([leftCategory], [rightCategory]) => compareByText(leftCategory, rightCategory))
    .map(([category, nodeTypes]): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning> => {
      const categoryRowId = `${sourceRowId}/category:${category}`;
      return {
        row: { row_id: categoryRowId, label: category, icon: "node_category", isHeading: true },
        meaning: { kind: "nothing_to_select" },
        isOpenByDefault: true,
        children: nodeTypes.map((nodeType) => ({
          row: { row_id: `${categoryRowId}/node_type:${nodeType.type}`, label: nodeTypeShortName(nodeType.type), icon: "node_type", isMachineWords: true },
          meaning: { kind: "node_type_declaration", node_type: nodeType, source_title: sourceTitle, file: declaringFileOf(source.origin, projectDirectory, nodeType.path) },
          isOpenByDefault: false,
          children: [],
        })),
      };
    });
  const graphGeneratorsRowId = `${sourceRowId}/graph_generators`;
  const graphGeneratorNodes: StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] =
    source.graph_generators.length === 0
      ? []
      : [
          {
            row: { row_id: graphGeneratorsRowId, label: "Graph generators", icon: "node_category", isHeading: true },
            meaning: { kind: "nothing_to_select" },
            isOpenByDefault: true,
            children: [...source.graph_generators]
              .sort((left, right) => compareByText(left.generator, right.generator))
              .map((graphGenerator) => ({
                row: { row_id: `${graphGeneratorsRowId}/${graphGenerator.generator}`, label: nodeTypeShortName(graphGenerator.generator), icon: "graph_generator", isMachineWords: true },
                meaning: { kind: "graph_generator_declaration", graph_generator: graphGenerator, source_title: sourceTitle, file: declaringFileOf(source.origin, projectDirectory, graphGenerator.path) },
                isOpenByDefault: false,
                children: [],
              })),
          },
        ];
  const unreadableModuleNodes = source.unreadable_modules.map(
    (unreadableModule): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning> => ({
      row: {
        row_id: `${sourceRowId}/unreadable:${unreadableModule.module}`,
        label: `${whereTheModuleStoppedTheParser(unreadableModule)}: ${unreadableModule.why}`,
        icon: "unreadable",
        tone: "unreadable",
        isMachineWords: true,
      },
      meaning: { kind: "unreadable_module", unreadable_module: unreadableModule, source_title: sourceTitle, file: declaringFileOf(source.origin, projectDirectory, unreadableModule.path) },
      isOpenByDefault: false,
      children: [],
    }),
  );
  return [...categoryNodes, ...graphGeneratorNodes, ...unreadableModuleNodes];
}
