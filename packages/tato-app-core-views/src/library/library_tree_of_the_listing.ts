// The Library's tree of node types or of graph generators, derived from the open project's node
// type listing: a heading per source, the project's own code first. Node types sit under their
// categories beside the modules that do not parse; generators sit straight under their source, and
// a source that declares none is left out.

import type { ProjectNodeTypeListing } from "@tatolab/tato-app-view-sdk/studio_readings";
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

/** The Library's rows that show for `listing`'s `declarationsShown`, with what each stands for; every source opens by default but the installed distributions. */
export function libraryTreeOfTheListing(
  listing: ProjectNodeTypeListing,
  expansionChoices: Readonly<Record<string, boolean>>,
  declarationsShown: LibraryDeclarationsShown,
): ShownStudioTreeRow<LibraryRowMeaning>[] {
  const sourceNodes = listing.sources.flatMap((source): StudioTreeNode<LibraryRowMeaning>[] => {
    const sourceRowId = `source:${nodeTypeSourceKey(source.origin)}`;
    const sourceTitle = nodeTypeSourceTitle(source.origin, listing.project_name);
    const children = nodeTypeSourceChildren(source, sourceRowId, sourceTitle, listing.project_directory, declarationsShown);
    if (children.length === 0 && declarationsShown === "graph_generators") return [];
    return [
      {
        row: {
          row_id: sourceRowId,
          label: sourceTitle,
          icon: source.origin.source === "project" ? "project" : "imports",
          tone: source.origin.source === "project" ? undefined : "imports",
          isHeading: true,
          isReadOnly: source.origin.source !== "project",
        },
        meaning: { kind: "nothing_to_select" },
        isOpenByDefault: source.origin.source !== "installed_distribution",
        children:
          children.length > 0
            ? children
            : [{ row: { row_id: `${sourceRowId}/none`, label: "Declares no node types", icon: "waiting", tone: "waiting" }, meaning: { kind: "nothing_to_select" }, isOpenByDefault: false, children: [] }],
      },
    ];
  });
  return shownStudioTreeRows(sourceNodes, expansionChoices);
}
