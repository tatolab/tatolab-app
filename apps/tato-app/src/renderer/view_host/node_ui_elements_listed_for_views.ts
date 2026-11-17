// The node UI elements every view's control table picks from, listed through the backend each time
// a project is read open in the window, and sent to a view once listed.

import type { NodeUiElementsReading } from "@tatolab/tato-app-view-sdk/node_ui_host";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { OpenProjectReading, StopWatching } from "./studio_view_contract";
import { WatchedStudioValue } from "./watched_studio_value";

/** The window's listing of node UI elements: `null` until the first answer. */
export class NodeUiElementsListedForViews {
  readonly #listing = new WatchedStudioValue<NodeUiElementsReading | null>(null);

  /** Lists the elements through `backend` each time `watchOpenProject` reads a project open, the latest listing asked winning. A listing refused leaves the window with none, so each input draws its own field. */
  listForEachOpenProject(backend: Pick<TatolabBackend, "listNodeUiElements">, watchOpenProject: (listener: (reading: OpenProjectReading) => void) => StopWatching): StopWatching {
    let listingsAsked = 0;
    return watchOpenProject((openProjectReading) => {
      listingsAsked += 1;
      const thisListing = listingsAsked;
      if (openProjectReading.kind !== "read") return;
      backend.listNodeUiElements().then(
        (elements) => {
          if (thisListing === listingsAsked) this.#listing.publish({ elements });
        },
        () => {
          if (thisListing === listingsAsked) this.#listing.publish({ elements: [] });
        },
      );
    });
  }

  /** The listing, once listed and again on each change. */
  readonly watch = (listener: (reading: NodeUiElementsReading) => void): StopWatching =>
    this.#listing.watch((reading) => {
      if (reading !== null) listener(reading);
    });
}
