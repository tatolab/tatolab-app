// The node types the Add node search offers over a stream's graph: each type its stream's catalog lists, titled
// in words and listed under its module, and, for a wire dragged off a pin, only those that can take the wire.

import type { SearchPopoverItem } from "@tatolab/tato-app-view-sdk/design_system/support/search_popover_rows";
import type { NodeCatalogEntry } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nameInWords, nodeTypeClassName } from "../shared/node_words";
import { canANodeTypeTakeTheLooseWire, type LooseWire } from "./stream_graph_edits";

/** The module a node type is declared in, the part before its class: `nodes.blur` of `nodes.blur:GaussianBlur`. */
function moduleOfTheNodeType(nodeType: string): string {
  const classStartsAfter = Math.max(nodeType.lastIndexOf(":"), nodeType.lastIndexOf("."));
  return classStartsAfter <= 0 ? nodeType : nodeType.slice(0, classStartsAfter);
}

/** Each node type of `catalog` the search offers, keyed by its type; with a loose wire, only those with a port of the wire's family on the other side. */
export function nodeTypeSearchItems(catalog: readonly NodeCatalogEntry[], looseWire: Pick<LooseWire, "side" | "family"> | null): SearchPopoverItem[] {
  return catalog
    .filter((nodeType) => looseWire === null || canANodeTypeTakeTheLooseWire(nodeType, looseWire))
    .map((nodeType) => ({ item_id: nodeType.type, title: nameInWords(nodeTypeClassName(nodeType.type)), summary: nodeType.description, category: moduleOfTheNodeType(nodeType.type) }));
}
