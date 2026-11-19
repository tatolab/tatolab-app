// What the Add node search offers over a stream's graph: each node type its project's listing names, from the project,
// its imports, its installed distributions and the runtime itself, titled in words, filed under the category the runtime
// serves and named for the project or package it comes from, then each graph generator the project's own source declares,
// placed as a subgraph; for a wire dragged off a pin, only the node types the runtime answered it fits.

import type { SearchPopoverNarrowing } from "@tatolab/tato-app-view-sdk/design_system/search_popover";
import type { SearchPopoverItem } from "@tatolab/tato-app-view-sdk/design_system/support/search_popover_rows";
import { exactPinOfTheDeclaredPort, type NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import {
  familyOfThePort,
  nodeTypeDescriptionsByType,
  type ListNodeTypesToolResult,
  type NodeTypeDescription,
  type NodeTypeListed,
  type NodeTypePortDescribed,
  type NodeTypeSourceListed,
  type OpenProject,
  type ProjectNodeTypesDescribed,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTypeCategoryPath } from "../shared/node_type_category_path";
import { descriptionWords } from "../shared/node_pins_of_the_graph";
import { nameInWords, nodeTypeClassName } from "../shared/node_words";
import { inputsAWireReaches, type LooseWire } from "../shared/stream_graph_edits";

/** The entry above the search's categories that lists what the project's own source declares. */
export const THIS_PROJECT_SEARCH_ENTRY = "This project";

/** The heading the search lists the project's graph generators under. */
export const GRAPH_GENERATORS_SEARCH_HEADING = "Subgraphs from code";

/** One node type the search offers: as its source lists it, the source, and its description, `null` where the runtime has none. */
export interface NodeTypeOffered {
  readonly listed: NodeTypeListed;
  readonly source: NodeTypeSourceListed;
  readonly described: NodeTypeDescription | null;
}

/** Each node type `nodeTypes` lists, in the listing's order, with its description; a type two sources list is the first's, as the runtime orders its sources. */
export function nodeTypesTheSearchOffers(nodeTypes: ProjectNodeTypesDescribed | null): NodeTypeOffered[] {
  if (nodeTypes === null) return [];
  const describedByType = nodeTypeDescriptionsByType(nodeTypes.described);
  const offeredByType = new Map<string, NodeTypeOffered>();
  for (const source of nodeTypes.listing.sources) {
    for (const listed of source.node_types) {
      if (!offeredByType.has(listed.node_type)) offeredByType.set(listed.node_type, { listed, source, described: describedByType.get(listed.node_type) ?? null });
    }
  }
  return [...offeredByType.values()];
}

/** The project or package a source's node code comes from, as the runtime names it: the open project, an import by the name its project file holds, or an installed distribution; `null` for the runtime's own, and for an import whose project file does not read. */
function nodeTypeSourceOriginWords(source: NodeTypeSourceListed, openProject: OpenProject | null): string | null {
  switch (source.source) {
    case "project":
      return openProject?.project.name ?? null;
    case "dependency":
      return source.project_name ?? null;
    case "installed_distribution":
      return source.distribution;
    case "built_in":
      return null;
  }
}

/** Each node type of `offered` the search offers, keyed by its type; for a loose wire the runtime answered for, only those `portsTheWireFits` names. */
export function nodeTypeSearchItems(offered: readonly NodeTypeOffered[], portsTheWireFits: ReadonlyMap<string, string> | null, openProject: OpenProject | null = null): SearchPopoverItem[] {
  return offered.flatMap(({ listed, source }) => {
    if (portsTheWireFits !== null && !portsTheWireFits.has(listed.node_type)) return [];
    return [
      {
        item_id: listed.node_type,
        title: nameInWords(nodeTypeClassName(listed.node_type)),
        summary: listed.documentation,
        origin_words: nodeTypeSourceOriginWords(source, openProject),
        category_path: nodeTypeCategoryPath(listed.category ?? null),
        listed_above_the_categories: source.source === "project" ? { entry: THIS_PROJECT_SEARCH_ENTRY, heading: THIS_PROJECT_SEARCH_ENTRY } : null,
      },
    ];
  });
}

const GRAPH_GENERATOR_SEARCH_ITEM_PREFIX = "graph_generator:";

/** Each graph generator the project's own source declares, offered under This project to place as a subgraph; none for a loose wire, since a generator's ports are known only once it runs. */
export function graphGeneratorSearchItems(listing: ListNodeTypesToolResult | null, looseWire: LooseWire | null, openProject: OpenProject | null = null): SearchPopoverItem[] {
  if (looseWire !== null) return [];
  return (listing?.sources ?? [])
    .filter((source) => source.source === "project")
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

/** What the search over a loose wire is narrowed to: the node types the runtime answered can take or feed the wire's pin, and that placing one links it in the same edit. */
export function nodeTypeSearchNarrowing(looseWire: LooseWire): SearchPopoverNarrowing {
  if (looseWire.side === "output") {
    return {
      heading: `Can take ${looseWire.pin}`,
      footnote: `Placing one adds it and links ${looseWire.pin} to the first input the runtime says it fits, in one edit. One undo takes both back.`,
    };
  }
  return {
    heading: `Can feed ${looseWire.pin}`,
    footnote: `Placing one adds it and links the first output the runtime says fits to ${looseWire.pin}, in one edit. One undo takes both back.`,
  };
}

/** A node type's port as a card placed now draws its pin: the type it states exactly, or none, and no stream yet. */
function nodePinOfTheDescribedPort(port: NodeTypePortDescribed): NodePin {
  return {
    name: port.name,
    pin: exactPinOfTheDeclaredPort(port),
    family: familyOfThePort(port),
    description: descriptionWords(port.documentation),
    annotations: port.annotations ?? {},
    stream_facts_words: [],
    value_address: null,
    setting: null,
  };
}

/** The card the search previews for the node type `searchItemId` names, as the graph draws that node once placed, with a pin for each input a wire reaches and no setting; `null` for an item that is no node type `offered` describes, as a graph generator. */
export function nodeTypeSearchPreviewCard(offered: readonly NodeTypeOffered[], searchItemId: string): { title: string; inputs: NodePin[]; outputs: NodePin[] } | null {
  const described = offered.find((nodeType) => nodeType.listed.node_type === searchItemId)?.described ?? null;
  if (described === null) return null;
  return { title: nameInWords(nodeTypeClassName(described.node_type)), inputs: inputsAWireReaches(described).map(nodePinOfTheDescribedPort), outputs: described.outputs.map(nodePinOfTheDescribedPort) };
}
