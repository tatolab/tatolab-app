// The node types the Add node search offers over a stream's graph: each type its stream's catalog lists and each
// its project's sources declare, titled in words and listed under its module, and, for a wire dragged off a pin,
// only those that can take the wire.

import type { SearchPopoverItem } from "@tatolab/tato-app-view-sdk/design_system/support/search_popover_rows";
import type { NodeCatalogEntry, ProjectNodeType, ProjectNodeTypeListing } from "@tatolab/tato-app-view-sdk/studio_readings";
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

function catalogEntryOfTheDeclaration(declared: ProjectNodeType): NodeCatalogEntry {
  const portsDeclared = (ports: ProjectNodeType["inputs"]) => (ports ?? []).map(({ name, description, family }) => ({ name, description, family }));
  return { type: declared.type, description: declared.description, config_schema: null, inputs: portsDeclared(declared.inputs), outputs: portsDeclared(declared.outputs) };
}

/** The stream's catalog, then each node type the project and its imports declare that the catalog does not list yet, as the runtime lists those only once a node of them is in the graph; an installed distribution's types the catalog lists already. */
export function nodeTypesTheSearchOffers(catalog: readonly NodeCatalogEntry[], projectNodeTypes: ProjectNodeTypeListing | null): NodeCatalogEntry[] {
  const offeredByType = new Map(catalog.map((entry) => [entry.type, entry]));
  const sourcesTheCatalogLagsBehind = (projectNodeTypes?.sources ?? []).filter(({ origin }) => origin.source === "project" || origin.source === "dependency");
  for (const declared of sourcesTheCatalogLagsBehind.flatMap((source) => source.node_types)) {
    if (!offeredByType.has(declared.type)) offeredByType.set(declared.type, catalogEntryOfTheDeclaration(declared));
  }
  return [...offeredByType.values()];
}
