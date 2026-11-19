// The rows the Library shows of a project's node types, derived from what `list_node_types` lists:
// each source's node types by category, a category inside another under it, each with its description
// from `describe_node_types`, its graph generators, and each module of it that does not parse, with
// why in the parser's own words.

import type { TreeViewRow } from "@tatolab/tato-app-view-sdk/design_system/tree_view";
import { whereTheSearchMatches } from "@tatolab/tato-app-view-sdk/design_system/matched_words";
import { NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS, nodeTypeCategoryPath } from "./node_type_category_path";
import type { GraphGeneratorListed, NodeModuleNotReadable, NodeTypeDescribedOrWhyNot, NodeTypeListed, NodeTypeSourceListed } from "@tatolab/tato-app-view-sdk/studio_readings";

/**
 * What a node type, graph generator or unreadable module row stands for, with its file as an absolute path when it is the project's
 * own source; a node type with its description, or why the runtime has none, and `null` before the runtime has described it.
 */
export type DeclarationRowMeaning =
  | { kind: "node_type_declaration"; node_type: NodeTypeListed; described: NodeTypeDescribedOrWhyNot | null; source_title: string; file: string | null }
  | { kind: "graph_generator_declaration"; graph_generator: GraphGeneratorListed; source_title: string; file: string | null }
  | { kind: "unreadable_module"; unreadable_module: NodeModuleNotReadable; source_title: string; file: string | null };

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

/**
 * The nodes of `roots` a search for `searchWords` keeps: each whose label or aside matches, ignoring case, with the rows
 * above it so it stays in its place, each kept row open and marked with the search; every node for a blank search.
 */
export function studioTreeNodesMatching<RowMeaning>(roots: readonly StudioTreeNode<RowMeaning>[], searchWords: string): StudioTreeNode<RowMeaning>[] {
  if (searchWords.trim() === "") return [...roots];
  const rowMatches = (row: StudioTreeNode<RowMeaning>["row"]) => whereTheSearchMatches(row.label, searchWords) !== null || (row.aside !== undefined && whereTheSearchMatches(row.aside, searchWords) !== null);
  const kept = (node: StudioTreeNode<RowMeaning>): StudioTreeNode<RowMeaning>[] => {
    const childrenKept = node.children.flatMap(kept);
    if (childrenKept.length === 0 && !rowMatches(node.row)) return [];
    return [{ ...node, row: { ...node.row, searchWords }, isOpenByDefault: true, children: childrenKept }];
  };
  return roots.flatMap(kept);
}

/** The words a source is titled with: "This project" for its own code, an import's folder, a distribution's name and version, or "Built in" for the runtime's own. */
export function nodeTypeSourceTitle(source: NodeTypeSourceListed): string {
  switch (source.source) {
    case "project":
      return "This project";
    case "dependency":
      return `imports/${source.folder}`;
    case "installed_distribution":
      return `${source.distribution} ${source.distribution_version}`;
    case "built_in":
      return "Built in";
  }
}

/** A stable key for `source`, unique within one listing. */
export function nodeTypeSourceKey(source: NodeTypeSourceListed): string {
  switch (source.source) {
    case "project":
      return "project";
    case "dependency":
      return `dependency:${source.project}`;
    case "installed_distribution":
      return `distribution:${source.distribution}`;
    case "built_in":
      return "built_in";
  }
}

/** The name a node type is shown by: the qualified name after its module. */
export function nodeTypeShortName(importPath: string): string {
  const separatorAt = importPath.lastIndexOf(":");
  return separatorAt === -1 ? importPath : importPath.slice(separatorAt + 1);
}

/** Where a module stopped the parser, as `path:line:column`, as far as the runtime says. */
export function whereTheModuleStoppedTheParser(unreadableModule: NodeModuleNotReadable): string {
  const { line: lineStopped = null, column: columnStopped = null } = unreadableModule;
  const line = lineStopped === null ? "" : `:${lineStopped}`;
  const column = lineStopped === null || columnStopped === null ? "" : `:${columnStopped}`;
  return `${unreadableModule.path}${line}${column}`;
}

/** `relativePath` under the folder `folder`, as one absolute path. */
export function fileUnderTheFolder(folder: string, relativePath: string): string {
  return `${folder.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

/** `relativePath` under `projectDirectory`, for the project's own source; `null` for any other, whose files are not the project's to open. */
function declaringFileOf(source: NodeTypeSourceListed, projectDirectory: string, relativePath: string | null): string | null {
  if (source.source !== "project" || relativePath === null) return null;
  return fileUnderTheFolder(projectDirectory, relativePath);
}

function compareByText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The node types filed under one category, and the categories filed inside it by name. */
interface NodeTypesOfOneCategory {
  nodeTypes: NodeTypeListed[];
  categoriesInside: Map<string, NodeTypesOfOneCategory>;
}

/** Which of a source's declarations its rows show: all of them; its node types and the modules that do not parse; or only its graph generators, with no heading over them. */
export type SourceDeclarationsShown = "every_declaration" | "node_types" | "graph_generators";

/**
 * The rows under a source's row `sourceRowId`: each category with the categories inside it and its node types, each with its entry
 * of `describedByType`, the node types served with no category, its graph generators, then each module that does not parse, as far
 * as `declarationsShown` has them.
 */
export function nodeTypeSourceChildren(
  source: NodeTypeSourceListed,
  describedByType: ReadonlyMap<string, NodeTypeDescribedOrWhyNot>,
  sourceRowId: string,
  sourceTitle: string,
  projectDirectory: string,
  declarationsShown: SourceDeclarationsShown = "every_declaration",
): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] {
  const everyCategory: NodeTypesOfOneCategory = { nodeTypes: [], categoriesInside: new Map() };
  for (const nodeType of [...source.node_types].sort((left, right) => compareByText(left.node_type, right.node_type))) {
    let category = everyCategory;
    for (const group of nodeTypeCategoryPath(nodeType.category ?? null)) {
      const categoryInside = category.categoriesInside.get(group) ?? { nodeTypes: [], categoriesInside: new Map() };
      category.categoriesInside.set(group, categoryInside);
      category = categoryInside;
    }
    category.nodeTypes.push(nodeType);
  }
  const nodeTypeLeaves = (nodeTypes: readonly NodeTypeListed[], categoryRowId: string): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] =>
    nodeTypes.map((nodeType) => {
      const described = describedByType.get(nodeType.node_type) ?? null;
      const declaredAt = described === null || "not_described_because" in described ? null : (described.declared_at ?? null);
      return {
        row: { row_id: `${categoryRowId}/node_type:${nodeType.node_type}`, label: nodeTypeShortName(nodeType.node_type), icon: "node_type", isMachineWords: true },
        meaning: { kind: "node_type_declaration", node_type: nodeType, described, source_title: sourceTitle, file: declaringFileOf(source, projectDirectory, declaredAt?.path ?? null) },
        isOpenByDefault: false,
        children: [],
      };
    });
  const categoryRows = (categoriesInside: NodeTypesOfOneCategory["categoriesInside"], rowIdTheyAreUnder: string): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] =>
    [...categoriesInside.entries()]
      .sort(([leftGroup], [rightGroup]) => compareByText(leftGroup, rightGroup))
      .map(([group, category]): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning> => {
        const categoryRowId = `${rowIdTheyAreUnder}${group}`;
        return {
          row: { row_id: categoryRowId, label: group, icon: "node_category", isHeading: true },
          meaning: { kind: "nothing_to_select" },
          isOpenByDefault: true,
          children: [...categoryRows(category.categoriesInside, `${categoryRowId}/`), ...nodeTypeLeaves(category.nodeTypes, categoryRowId)],
        };
      });
  const rowIdOfNoCategory = `${sourceRowId}/no_category`;
  const categoryNodes: StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] = [
    ...categoryRows(everyCategory.categoriesInside, `${sourceRowId}/category:`),
    ...(everyCategory.nodeTypes.length === 0
      ? []
      : [
          {
            row: { row_id: rowIdOfNoCategory, label: NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS, icon: "node_category" as const, isHeading: true },
            meaning: { kind: "nothing_to_select" as const },
            isOpenByDefault: true,
            children: nodeTypeLeaves(everyCategory.nodeTypes, rowIdOfNoCategory),
          },
        ]),
  ];
  const graphGeneratorsRowId = `${sourceRowId}/graph_generators`;
  const graphGeneratorLeaves = [...source.graph_generators]
    .sort((left, right) => compareByText(left.generator, right.generator))
    .map(
      (graphGenerator): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning> => ({
        row: { row_id: `${graphGeneratorsRowId}/${graphGenerator.generator}`, label: nodeTypeShortName(graphGenerator.generator), icon: "graph_generator", isMachineWords: true },
        meaning: { kind: "graph_generator_declaration", graph_generator: graphGenerator, source_title: sourceTitle, file: declaringFileOf(source, projectDirectory, graphGenerator.path) },
        isOpenByDefault: false,
        children: [],
      }),
    );
  if (declarationsShown === "graph_generators") return graphGeneratorLeaves;
  const graphGeneratorNodes: StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning>[] =
    graphGeneratorLeaves.length === 0 || declarationsShown === "node_types"
      ? []
      : [{ row: { row_id: graphGeneratorsRowId, label: "Graph generators", icon: "node_category", isHeading: true }, meaning: { kind: "nothing_to_select" }, isOpenByDefault: true, children: graphGeneratorLeaves }];
  const unreadableModuleNodes = source.unreadable_modules.map(
    (unreadableModule): StudioTreeNode<DeclarationRowMeaning | NothingToChooseRowMeaning> => ({
      row: {
        row_id: `${sourceRowId}/unreadable:${unreadableModule.module}`,
        label: `${whereTheModuleStoppedTheParser(unreadableModule)}: ${unreadableModule.why}`,
        icon: "unreadable",
        tone: "unreadable",
        isMachineWords: true,
      },
      meaning: { kind: "unreadable_module", unreadable_module: unreadableModule, source_title: sourceTitle, file: declaringFileOf(source, projectDirectory, unreadableModule.path) },
      isOpenByDefault: false,
      children: [],
    }),
  );
  return [...categoryNodes, ...graphGeneratorNodes, ...unreadableModuleNodes];
}
