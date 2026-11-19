// What the Add node search offers from the Marketplace while text is searched for: each node of a package the stream's
// project has not added, under "Not in <project>", whose choice adds the package to the project as a module, and each
// sample project, whose choice opens it in the Marketplace. The catalog names each entry's nodes, so nothing is
// downloaded until a package is added; one that brings nothing on this machine offers no node. The view reads the
// catalog and adds packages through `use_marketplace_of_the_node_search`.

import { isAMarketplaceDownloadOf, isTheDistributionOfTheMarketplaceEntry, isTheModuleNamedLikeTheMarketplaceEntry } from "@tatolab/tato-app-view-sdk/marketplace_modules";
import type { MarketplaceEntry, MarketplaceReading, NodeTypeSourceListed, OpenProject } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { SearchPopoverItem, SearchPopoverItemEndWords } from "@tatolab/tato-app-view-sdk/design_system/support/search_popover_rows";
import { nameInWords } from "../shared/node_words";

/** The word at the end of the headings of what the search offers from the Marketplace. */
export const MARKETPLACE_SEARCH_HEADING_ASIDE = "Marketplace";

/** The heading the search lists the Marketplace's sample projects under. */
export const MARKETPLACE_SAMPLES_SEARCH_HEADING = "Sample projects";

const MARKETPLACE_NODE_ITEM_PREFIX = "marketplace_node:";
const MARKETPLACE_SAMPLE_ITEM_PREFIX = "marketplace_sample:";

/**
 * How adding a Marketplace package from the search stands: under way; added, until the project lists it, its wheel installed and
 * its nodes listed; or refused, the view saying why where it says its refusals.
 */
export type MarketplaceAddFromTheSearch = { kind: "under_way" } | { kind: "added" } | { kind: "refused" };

/** What choosing a search item the Marketplace offers does: add its package to the project, or open its sample project in the Marketplace, by the catalog's name for it. */
export type MarketplaceSearchChoice = { kind: "add_the_package"; entry_name: string } | { kind: "open_the_sample"; entry_name: string };

/** The heading the search lists the nodes of packages `projectName` has not added under. */
export function marketplaceNodesSearchHeading(projectName: string): string {
  return `Not in ${projectName}`;
}

/** Whether the project has `entry`: an import downloaded for it or named like it, or its wheel installed, as a module added from the Marketplace brings its nodes in its wheel. */
function isInTheProject(entry: MarketplaceEntry, openProject: OpenProject, nodeTypeSources: readonly NodeTypeSourceListed[]): boolean {
  return (
    openProject.imports.some((importedProject) => isAMarketplaceDownloadOf(entry.name, importedProject.copied_from) || isTheModuleNamedLikeTheMarketplaceEntry(entry.name, importedProject)) ||
    nodeTypeSources.some((source) => source.source === "installed_distribution" && isTheDistributionOfTheMarketplaceEntry(entry.name, source.distribution))
  );
}

/** The catalog's names of the packages in `marketplace` the project has, by its imports and the wheels `nodeTypeSources` lists. */
export function marketplacePackagesInTheProject(marketplace: MarketplaceReading | null, openProject: OpenProject, nodeTypeSources: readonly NodeTypeSourceListed[]): Set<string> {
  if (marketplace?.kind !== "read") return new Set();
  return new Set(marketplace.entries.filter((entry) => entry.kind === "package" && isInTheProject(entry, openProject, nodeTypeSources)).map((entry) => entry.name));
}

/** Whether choosing a node of the package whose add stands at `add` adds it: not while an add of it is under way, or added and not yet listed. */
export function doesChoosingThePackageAddIt(add: MarketplaceAddFromTheSearch | undefined): boolean {
  return add?.kind !== "under_way" && add?.kind !== "added";
}

function endWordsOfThePackage(add: MarketplaceAddFromTheSearch | undefined): SearchPopoverItemEndWords {
  if (add?.kind === "under_way" || add?.kind === "added") return { kind: "under_way", words: "Adding module…" };
  if (add?.kind === "refused") return { kind: "refused", words: "Not added" };
  return { kind: "what_choosing_does", words: "Add module" };
}

/**
 * What the search offers from `marketplace` for a stream of `openProject`, whose node types come from `nodeTypeSources`: each
 * node of each package it does not have that brings anything on this machine, its add as `addsByEntryName` holds it, then each
 * sample project; nothing while the catalog is not read. No package is offered while the project's imports or node types are
 * not listed (`nodeTypeSources` `null`), since what it has is not known yet.
 */
export function marketplaceSearchItems(
  marketplace: MarketplaceReading | null,
  openProject: OpenProject,
  nodeTypeSources: readonly NodeTypeSourceListed[] | null,
  addsByEntryName: Readonly<Record<string, MarketplaceAddFromTheSearch>>,
): SearchPopoverItem[] {
  if (marketplace?.kind !== "read") return [];
  const isWhatTheProjectHasKnown = nodeTypeSources !== null && openProject.imports_not_listed_because === null;
  const packagesNotAdded = isWhatTheProjectHasKnown
    ? marketplace.entries.filter((entry) => entry.kind === "package" && entry.runs_on_this_machine && !isInTheProject(entry, openProject, nodeTypeSources))
    : [];
  const nodeItems = packagesNotAdded.flatMap((entry) =>
    entry.nodes.map(
      (node): SearchPopoverItem => ({
        item_id: `${MARKETPLACE_NODE_ITEM_PREFIX}${entry.name}/${node.name}`,
        title: nameInWords(node.name),
        summary: node.summary,
        origin_words: `In the ${entry.title} module`,
        category_path: null,
        listed_above_the_categories: null,
        listed_after_the_categories: { heading: marketplaceNodesSearchHeading(openProject.project.name), aside: MARKETPLACE_SEARCH_HEADING_ASIDE },
        end_words: endWordsOfThePackage(addsByEntryName[entry.name]),
      }),
    ),
  );
  const sampleItems = marketplace.entries
    .filter((entry) => entry.kind === "sample")
    .map(
      (entry): SearchPopoverItem => ({
        item_id: `${MARKETPLACE_SAMPLE_ITEM_PREFIX}${entry.name}`,
        title: entry.title,
        summary: [entry.summary, ...entry.nodes.map((node) => node.name)].join(" "),
        origin_words: "Sample project in the Marketplace",
        category_path: null,
        listed_above_the_categories: null,
        listed_after_the_categories: { heading: MARKETPLACE_SAMPLES_SEARCH_HEADING, aside: MARKETPLACE_SEARCH_HEADING_ASIDE },
        end_words: { kind: "what_choosing_does", words: "See it" },
      }),
    );
  return [...nodeItems, ...sampleItems];
}

/** What choosing the search item `itemId` does when the Marketplace offers it; `null` for any other item. */
export function marketplaceChoiceOfTheSearchItem(itemId: string): MarketplaceSearchChoice | null {
  if (itemId.startsWith(MARKETPLACE_SAMPLE_ITEM_PREFIX)) return { kind: "open_the_sample", entry_name: itemId.slice(MARKETPLACE_SAMPLE_ITEM_PREFIX.length) };
  if (!itemId.startsWith(MARKETPLACE_NODE_ITEM_PREFIX)) return null;
  const entryAndNode = itemId.slice(MARKETPLACE_NODE_ITEM_PREFIX.length);
  const nodeAt = entryAndNode.indexOf("/");
  return nodeAt === -1 ? null : { kind: "add_the_package", entry_name: entryAndNode.slice(0, nodeAt) };
}
