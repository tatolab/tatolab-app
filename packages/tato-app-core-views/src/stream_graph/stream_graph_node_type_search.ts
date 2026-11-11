// What the Add node search offers over a stream's graph: each node type its stream's catalog lists and each its
// project's sources declare, titled in words and listed under its module, then each graph generator the project's
// own source declares, placed as a subgraph; for a wire dragged off a pin, only the node types that can take it.

import type { SearchPopoverNarrowing } from "@tatolab/tato-app-view-sdk/design_system/search_popover";
import type { SearchPopoverItem } from "@tatolab/tato-app-view-sdk/design_system/support/search_popover_rows";
import type { NodeCatalogEntry, ProjectNodeType, ProjectNodeTypeListing } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nameInWords, nodeTypeClassName } from "../shared/node_words";
import { portALooseWireLinksTo, type LooseWire } from "./stream_graph_edits";

/** The module a node type is declared in, the part before its class: `nodes.blur` of `nodes.blur:GaussianBlur`. */
function moduleOfTheNodeType(nodeType: string): string {
  const classStartsAfter = Math.max(nodeType.lastIndexOf(":"), nodeType.lastIndexOf("."));
  return classStartsAfter <= 0 ? nodeType : nodeType.slice(0, classStartsAfter);
}

/** A node type's ports as the search's details list them, as "in: frames, level · out: image"; `null` for one with none. */
function portsInWords(nodeType: NodeCatalogEntry): string | null {
  const sides = [
    nodeType.inputs.length === 0 ? null : `in: ${nodeType.inputs.map((port) => port.name).join(", ")}`,
    nodeType.outputs.length === 0 ? null : `out: ${nodeType.outputs.map((port) => port.name).join(", ")}`,
  ].filter((side) => side !== null);
  return sides.length === 0 ? null : sides.join(" · ");
}

/** The tag of a node type's row: for a loose wire, the port it links to; else whether the project's own source declares it. */
function nodeTypeSearchTag(nodeType: NodeCatalogEntry, linkedPort: string | null, looseWire: Pick<LooseWire, "side" | "family"> | null, typesTheProjectDeclares: ReadonlySet<string>): string | null {
  if (looseWire !== null && linkedPort !== null) return looseWire.side === "output" ? `→ ${linkedPort}` : `${linkedPort} →`;
  return typesTheProjectDeclares.has(nodeType.type) ? "this project" : null;
}

/** Each node type of `catalog` the search offers, keyed by its type; with a loose wire, only those with a port of the wire's family on the other side. */
export function nodeTypeSearchItems(
  catalog: readonly NodeCatalogEntry[],
  looseWire: Pick<LooseWire, "side" | "family"> | null,
  typesTheProjectDeclares: ReadonlySet<string> = new Set(),
): SearchPopoverItem[] {
  return catalog.flatMap((nodeType) => {
    const linkedPort = looseWire === null ? null : portALooseWireLinksTo(nodeType, looseWire);
    if (looseWire !== null && linkedPort === null) return [];
    return [
      {
        item_id: nodeType.type,
        title: nameInWords(nodeTypeClassName(nodeType.type)),
        summary: nodeType.description,
        category: moduleOfTheNodeType(nodeType.type),
        details: portsInWords(nodeType),
        tag: nodeTypeSearchTag(nodeType, linkedPort, looseWire, typesTheProjectDeclares),
      },
    ];
  });
}

/** The node types the open project's own source declares, as the search tags them. */
export function nodeTypesTheProjectDeclares(projectNodeTypes: ProjectNodeTypeListing | null): ReadonlySet<string> {
  return new Set((projectNodeTypes?.sources ?? []).filter(({ origin }) => origin.source === "project").flatMap((source) => source.node_types.map((declared) => declared.type)));
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

const GRAPH_GENERATOR_SEARCH_ITEM_PREFIX = "graph_generator:";

/** The category the search lists graph generators under. */
export const GRAPH_GENERATORS_SEARCH_CATEGORY = "Subgraphs from code";

/** Each graph generator the project's own source declares, offered to place as a subgraph; none for a loose wire, since a generator's ports are known only once it runs. */
export function graphGeneratorSearchItems(projectNodeTypes: ProjectNodeTypeListing | null, looseWire: Pick<LooseWire, "side" | "family"> | null): SearchPopoverItem[] {
  if (looseWire !== null) return [];
  return (projectNodeTypes?.sources ?? [])
    .filter(({ origin }) => origin.source === "project")
    .flatMap((source) => source.graph_generators)
    .map((graphGenerator) => ({
      item_id: `${GRAPH_GENERATOR_SEARCH_ITEM_PREFIX}${graphGenerator.generator}`,
      title: nameInWords(nodeTypeClassName(graphGenerator.generator)),
      summary: graphGenerator.description,
      category: GRAPH_GENERATORS_SEARCH_CATEGORY,
      details: "Placed as a subgraph",
      tag: null,
    }));
}

/** The `<module>:<function>` a search item places, or `null` for a node type's item. */
export function graphGeneratorOfTheSearchItem(itemId: string): string | null {
  return itemId.startsWith(GRAPH_GENERATOR_SEARCH_ITEM_PREFIX) ? itemId.slice(GRAPH_GENERATOR_SEARCH_ITEM_PREFIX.length) : null;
}

/** What the search over a loose wire is narrowed to: what every node type offered takes or gives, and that placing one links it in the same edit. */
export function nodeTypeSearchNarrowing(looseWire: LooseWire): SearchPopoverNarrowing {
  const familyWords = looseWire.family === null ? null : `${looseWire.family.charAt(0).toUpperCase()}${looseWire.family.slice(1)}`;
  if (looseWire.side === "output") {
    return {
      heading: familyWords === null ? `Can take ${looseWire.pin}` : `Takes ${familyWords}`,
      footnote: `Placing one adds it and links ${looseWire.pin} to its first ${familyWords ?? "matching"} input, in one edit. One undo takes both back.`,
    };
  }
  return {
    heading: familyWords === null ? `Can feed ${looseWire.pin}` : `Gives ${familyWords}`,
    footnote: `Placing one adds it and links its first ${familyWords ?? "matching"} output to ${looseWire.pin}, in one edit. One undo takes both back.`,
  };
}
