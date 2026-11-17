// One listing asked again each time the window reads another project open, the latest one asked
// winning: the views a project brings and the node UI elements their controls pick from both follow it.

import type { OpenProjectReading } from "../../shared/tatolab_backend_contract";
import type { StopWatching } from "./studio_view_contract";

/** How one listing is asked and where each of its answers goes. */
export interface ListingOfTheOpenProject<Listed> {
  readonly list: () => Promise<Listed>;
  readonly listed: (listed: Listed) => void;
  readonly notListed: (rejection: unknown) => void;
  /** No project is open, as the window closes the one it had. */
  readonly noneOpen: () => void;
}

/** Asks `listing` again each time `watchOpenProject` reads a project open; an answer to a listing asked before the latest is dropped. */
export function listForEachOpenProject<Listed>(watchOpenProject: (listener: (reading: OpenProjectReading) => void) => StopWatching, listing: ListingOfTheOpenProject<Listed>): StopWatching {
  let listingsAsked = 0;
  return watchOpenProject((openProjectReading) => {
    listingsAsked += 1;
    const thisListing = listingsAsked;
    if (openProjectReading.kind !== "read") {
      listing.noneOpen();
      return;
    }
    listing.list().then(
      (listed) => {
        if (thisListing === listingsAsked) listing.listed(listed);
      },
      (rejection: unknown) => {
        if (thisListing === listingsAsked) listing.notListed(rejection);
      },
    );
  });
}
