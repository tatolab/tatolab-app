// The Marketplace as the Add node search reads it, and each package added from the search, through the view's connection.

import { useCallback, useEffect, useState } from "react";
import type { TatoAppViewConnection, ViewAskDone } from "@tatolab/tato-app-view-sdk";
import type { MarketplaceReading, NodeTypeSourceListed, OpenProject } from "@tatolab/tato-app-view-sdk/studio_readings";
import { marketplacePackagesInTheProject, type MarketplaceAddFromTheSearch } from "./stream_graph_marketplace_search";

/**
 * The Marketplace as the Add node search reads it: read when the search opens, and kept once read; and how each package added
 * from the search stands, by the catalog's name for it, an added one forgotten once the project, `openProject` with the node types
 * of `nodeTypeSources` (`null` while either is not read), lists it.
 */
export function useMarketplaceOfTheNodeSearch(
  connection: Pick<TatoAppViewConnection, "readTheMarketplace" | "addFromTheMarketplace">,
  isTheSearchOpen: boolean,
  openProject: OpenProject | null,
  nodeTypeSources: readonly NodeTypeSourceListed[] | null,
): {
  marketplace: MarketplaceReading | null;
  addsByEntryName: Readonly<Record<string, MarketplaceAddFromTheSearch>>;
  addThePackage: (entryName: string) => Promise<ViewAskDone>;
} {
  const [marketplace, setMarketplace] = useState<MarketplaceReading | null>(null);
  const [addsByEntryName, setAddsByEntryName] = useState<Readonly<Record<string, MarketplaceAddFromTheSearch>>>({});
  const isTheMarketplaceRead = marketplace?.kind === "read";
  useEffect(() => {
    if (!isTheSearchOpen || isTheMarketplaceRead) return;
    let isTheAnswerStillWanted = true;
    void connection.readTheMarketplace().then((reading) => {
      if (isTheAnswerStillWanted) setMarketplace(reading);
    });
    return () => {
      isTheAnswerStillWanted = false;
    };
  }, [connection, isTheSearchOpen, isTheMarketplaceRead]);
  // Run on each change of the adds too, as the project's listing of a package may arrive before the answer to its add.
  useEffect(() => {
    if (openProject === null || nodeTypeSources === null) return;
    const packagesInTheProject = marketplacePackagesInTheProject(marketplace, openProject, nodeTypeSources);
    setAddsByEntryName((adds) => {
      const listedNow = Object.keys(adds).filter((entryName) => adds[entryName]?.kind === "added" && packagesInTheProject.has(entryName));
      if (listedNow.length === 0) return adds;
      return Object.fromEntries(Object.entries(adds).filter(([entryName]) => !listedNow.includes(entryName)));
    });
  }, [marketplace, openProject, nodeTypeSources, addsByEntryName]);
  const addThePackage = useCallback(
    (entryName: string): Promise<ViewAskDone> => {
      setAddsByEntryName((adds) => ({ ...adds, [entryName]: { kind: "under_way" } }));
      return connection.addFromTheMarketplace(entryName).then((adding): ViewAskDone => {
        // An added package stays so until the project lists it and the search stops offering it, so it is never added twice.
        setAddsByEntryName((adds) => ({ ...adds, [entryName]: { kind: adding.kind === "added" ? "added" : "refused" } }));
        return adding.kind === "added" ? { kind: "done" } : { kind: "refused", because: adding.because };
      });
    },
    [connection],
  );
  return { marketplace, addsByEntryName, addThePackage };
}
