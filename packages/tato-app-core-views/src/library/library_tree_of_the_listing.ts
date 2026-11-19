// The Library's tree of node types or of graph generators, derived from the open project's node
// types as `list_node_types` lists them: a heading per source, the project's own code first, the
// runtime's built-in node types left out. Node types sit under their categories beside the modules
// that do not parse; generators sit straight under their source, and a source that declares none is
// left out.

import type { NodeTypeDescribedOrWhyNot, ProjectNodeTypesDescribed } from "@tatolab/tato-app-view-sdk/studio_readings";
import {
  nodeTypeSourceChildren,
  nodeTypeSourceKey,
  nodeTypeSourceTitle,
  shownStudioTreeRows,
  type DeclarationRowMeaning,
  type NothingToChooseRowMeaning,
  type ShownStudioTreeRow,
  type StudioTreeNode,
} from "../shared/node_type_listing_tree";

/** What a row of the Library's tree stands for. */
export type LibraryRowMeaning = DeclarationRowMeaning | NothingToChooseRowMeaning;

/** Which declarations the Library's tree lists. */
export type LibraryDeclarationsShown = "node_types" | "graph_generators";

/** The Library's rows that show for `nodeTypes`' `declarationsShown`, with what each stands for; every source opens by default but the installed distributions. */
export function libraryTreeOfTheListing(
  nodeTypes: ProjectNodeTypesDescribed,
  expansionChoices: Readonly<Record<string, boolean>>,
  declarationsShown: LibraryDeclarationsShown,
): ShownStudioTreeRow<LibraryRowMeaning>[] {
  const { listing } = nodeTypes;
  const describedByType = new Map<string, NodeTypeDescribedOrWhyNot>(nodeTypes.described.map((described) => [described.node_type, described]));
  const sourceNodes = listing.sources.flatMap((source): StudioTreeNode<LibraryRowMeaning>[] => {
    if (source.source === "built_in") return [];
    const sourceRowId = `source:${nodeTypeSourceKey(source)}`;
    const sourceTitle = nodeTypeSourceTitle(source);
    const children = nodeTypeSourceChildren(source, describedByType, sourceRowId, sourceTitle, listing.project_directory, declarationsShown);
    if (children.length === 0 && declarationsShown === "graph_generators") return [];
    return [
      {
        row: {
          row_id: sourceRowId,
          label: sourceTitle,
          icon: source.source === "project" ? "project" : "imports",
          tone: source.source === "project" ? undefined : "imports",
          isHeading: true,
          isReadOnly: source.source !== "project",
        },
        meaning: { kind: "nothing_to_select" },
        isOpenByDefault: source.source !== "installed_distribution",
        children:
          children.length > 0
            ? children
            : [{ row: { row_id: `${sourceRowId}/none`, label: "Declares no node types", icon: "waiting", tone: "waiting" }, meaning: { kind: "nothing_to_select" }, isOpenByDefault: false, children: [] }],
      },
    ];
  });
  return shownStudioTreeRows(sourceNodes, expansionChoices);
}
