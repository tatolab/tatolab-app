// What the Add node search offers over a stream's graph: each node type its stream's catalog lists and each its
// project's sources declare, titled in words, filed under the category the runtime serves and named for the project or
// package it comes from, then each graph generator the project's own source declares, placed as a subgraph; for a wire
// dragged off a pin, only the node types that can take it.

import type { SearchPopoverNarrowing } from "@tatolab/tato-app-view-sdk/design_system/search_popover";
import type { SearchPopoverItem } from "@tatolab/tato-app-view-sdk/design_system/support/search_popover_rows";
import type { NodeCatalogEntry, OpenProject, ProjectNodeType, ProjectNodeTypeListing, ProjectNodeTypeSourceOrigin } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTypeCategoryPath } from "../shared/node_type_category_path";
import { nameInWords, nodeTypeClassName } from "../shared/node_words";
import { portALooseWireLinksTo, type LooseWire } from "../shared/stream_graph_edits";

/** The entry above the search's categories that lists what the project's own source declares. */
export const THIS_PROJECT_SEARCH_ENTRY = "This project";

/** The heading the search lists the project's graph generators under. */
export const GRAPH_GENERATORS_SEARCH_HEADING = "Subgraphs from code";

/** The project or package a source's node code comes from, as the runtime names it: the open project, an import by the name `list_dependencies` gives it, or an installed distribution; `null` where the runtime names none, as for a kind of source this app does not know. */
function nodeTypeSourceOriginWords(origin: ProjectNodeTypeSourceOrigin, openProject: OpenProject | null): string | null {
  switch (origin.source) {
    case "project":
      return openProject?.project.name ?? null;
    case "dependency":
      return openProject?.imports.find((imported) => imported.project === origin.project)?.name ?? null;
    case "installed_distribution":
      return origin.distribution;
    case "newer_than_this_app":
      return null;
  }
}

/** Where each node type the project's listing offers comes from, by its type, for those the runtime names an origin of. */
export function nodeTypeOriginWordsByType(projectNodeTypes: ProjectNodeTypeListing | null, openProject: OpenProject | null): ReadonlyMap<string, string> {
  const originWordsByType = new Map<string, string>();
  for (const source of projectNodeTypes?.sources ?? []) {
    const originWords = nodeTypeSourceOriginWords(source.origin, openProject);
    if (originWords === null) continue;
    for (const declared of source.node_types) originWordsByType.set(declared.type, originWords);
  }
  return originWordsByType;
}

/** Each node type of `catalog` the search offers, keyed by its type; with a loose wire, only those with a port of the wire's family on the other side. */
export function nodeTypeSearchItems(
  catalog: readonly NodeCatalogEntry[],
  looseWire: Pick<LooseWire, "side" | "family"> | null,
  typesTheProjectDeclares: ReadonlySet<string> = new Set(),
  originWordsByType: ReadonlyMap<string, string> = new Map(),
): SearchPopoverItem[] {
  return catalog.flatMap((nodeType) => {
    if (looseWire !== null && portALooseWireLinksTo(nodeType, looseWire) === null) return [];
    return [
      {
        item_id: nodeType.type,
        title: nameInWords(nodeTypeClassName(nodeType.type)),
        summary: nodeType.description,
        origin_words: originWordsByType.get(nodeType.type) ?? null,
        category_path: nodeTypeCategoryPath(nodeType.category),
        listed_above_the_categories: typesTheProjectDeclares.has(nodeType.type) ? { entry: THIS_PROJECT_SEARCH_ENTRY, heading: THIS_PROJECT_SEARCH_ENTRY } : null,
      },
    ];
  });
}

/** The node types the open project's own source declares, which the search lists under This project. */
export function nodeTypesTheProjectDeclares(projectNodeTypes: ProjectNodeTypeListing | null): ReadonlySet<string> {
  return new Set((projectNodeTypes?.sources ?? []).filter(({ origin }) => origin.source === "project").flatMap((source) => source.node_types.map((declared) => declared.type)));
}

function catalogEntryOfTheDeclaration(declared: ProjectNodeType): NodeCatalogEntry {
  const portsDeclared = (ports: ProjectNodeType["inputs"]) => (ports ?? []).map(({ name, description, family }) => ({ name, description, family }));
  return { type: declared.type, description: declared.description, category: declared.category, config_schema: null, inputs: portsDeclared(declared.inputs), outputs: portsDeclared(declared.outputs) };
}

/** The stream's catalog, then each node type the project's listing offers that the catalog does not list yet: the runtime lists the project's and its imports' types only once a node of them is in the graph, and a distribution installed after the stream loaded only once it loads again. */
export function nodeTypesTheSearchOffers(catalog: readonly NodeCatalogEntry[], projectNodeTypes: ProjectNodeTypeListing | null): NodeCatalogEntry[] {
  const offeredByType = new Map(catalog.map((entry) => [entry.type, entry]));
  for (const declared of (projectNodeTypes?.sources ?? []).flatMap((source) => source.node_types)) {
    if (!offeredByType.has(declared.type)) offeredByType.set(declared.type, catalogEntryOfTheDeclaration(declared));
  }
  return [...offeredByType.values()];
}

const GRAPH_GENERATOR_SEARCH_ITEM_PREFIX = "graph_generator:";

/** Each graph generator the project's own source declares, offered under This project to place as a subgraph; none for a loose wire, since a generator's ports are known only once it runs. */
export function graphGeneratorSearchItems(projectNodeTypes: ProjectNodeTypeListing | null, looseWire: Pick<LooseWire, "side" | "family"> | null, openProject: OpenProject | null = null): SearchPopoverItem[] {
  if (looseWire !== null) return [];
  return (projectNodeTypes?.sources ?? [])
    .filter(({ origin }) => origin.source === "project")
    .flatMap((source) => source.graph_generators)
    .map((graphGenerator) => ({
      item_id: `${GRAPH_GENERATOR_SEARCH_ITEM_PREFIX}${graphGenerator.generator}`,
      title: nameInWords(nodeTypeClassName(graphGenerator.generator)),
      summary: graphGenerator.description,
      origin_words: openProject?.project.name ?? null,
      category_path: null,
      listed_above_the_categories: { entry: THIS_PROJECT_SEARCH_ENTRY, heading: GRAPH_GENERATORS_SEARCH_HEADING },
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

/** The card the search previews for the node type `searchItemId` names, as the graph draws that node once placed; `null` for an item that is no node type of `catalog`, as a graph generator. */
export function nodeTypeSearchPreviewCard(catalog: readonly NodeCatalogEntry[], searchItemId: string): { title: string; inputPins: NodeCatalogEntry["inputs"]; outputPins: NodeCatalogEntry["outputs"] } | null {
  const nodeTypeSearched = catalog.find((entry) => entry.type === searchItemId);
  if (nodeTypeSearched === undefined) return null;
  return { title: nameInWords(nodeTypeClassName(nodeTypeSearched.type)), inputPins: nodeTypeSearched.inputs, outputPins: nodeTypeSearched.outputs };
}
