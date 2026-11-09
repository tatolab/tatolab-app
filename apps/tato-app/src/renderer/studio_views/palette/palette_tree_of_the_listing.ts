// The palette's tree, derived from the open project's node type listing: a heading per source, the
// project's own code first, each holding its node types by category, its graph generators and the
// modules of it that do not parse.

import type { ProjectNodeTypeListing } from "../../view_host/studio_view_contract";
import {
  nodeTypeSourceChildren,
  nodeTypeSourceKey,
  nodeTypeSourceTitle,
  shownStudioTreeRows,
  type DeclarationRowMeaning,
  type NothingToChooseRowMeaning,
  type ShownStudioTreeRow,
  type StudioTreeNode,
} from "../node_type_listing_tree";

/** What a palette row stands for. */
export type PaletteRowMeaning = DeclarationRowMeaning | NothingToChooseRowMeaning;

/** The palette's rows that show for `listing`, with what each stands for; every source opens by default but the installed distributions. */
export function paletteTreeOfTheListing(listing: ProjectNodeTypeListing, expansionChoices: Readonly<Record<string, boolean>>): ShownStudioTreeRow<PaletteRowMeaning>[] {
  const sourceNodes = listing.sources.map((source): StudioTreeNode<PaletteRowMeaning> => {
    const sourceRowId = `source:${nodeTypeSourceKey(source.origin)}`;
    const sourceTitle = nodeTypeSourceTitle(source.origin, listing.project_name);
    const children = nodeTypeSourceChildren(source, sourceRowId, sourceTitle, listing.project_directory);
    return {
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
    };
  });
  return shownStudioTreeRows(sourceNodes, expansionChoices);
}
