// The node UI elements every view's control table picks from, listed through the backend each time
// a project is read open in the window and each time its files change, so a control checked again
// after an edit draws or is blocked, and sent to a view once listed.

import type { NodeUiElementsReading } from "@tatolab/tato-app-view-sdk/node_ui_host";
import type { TatolabBackend } from "../backend/tatolab_backend";
import { listForEachOpenProject } from "./list_for_each_open_project";
import type { OpenProjectReading, StopWatching } from "./studio_view_contract";
import { WatchedStudioValue } from "./watched_studio_value";

/** The listing a window holds while no project is open, or after one was refused: no elements, so each input shows its value in words. */
const NO_NODE_UI_ELEMENTS: NodeUiElementsReading = { elements: [] };

/** The window's listing of node UI elements: `null` until the first answer. */
export class NodeUiElementsListedForViews {
  readonly #listing = new WatchedStudioValue<NodeUiElementsReading | null>(
    null,
  );

  /** Lists the elements through `backend` each time `watchOpenProject` reads a project open and each time the backend tells its files changed, the latest listing asked winning. A listing refused, or a project closed, leaves the window with none; the main process logs a manifest that did not read, the one refusal that is a failure. */
  listForEachOpenProject(
    backend: Pick<
      TatolabBackend,
      "listNodeUiElements" | "onProjectFilesChanged"
    >,
    watchOpenProject: (
      listener: (reading: OpenProjectReading) => void,
    ) => StopWatching,
  ): StopWatching {
    return listForEachOpenProject(
      watchOpenProject,
      {
        list: () => backend.listNodeUiElements(),
        listed: (elements) => this.#listing.publish({ elements }),
        notListed: () => this.#listing.publish(NO_NODE_UI_ELEMENTS),
        noneOpen: () => {
          if (this.#listing.readLatest() !== null)
            this.#listing.publish(NO_NODE_UI_ELEMENTS);
        },
      },
      (listener) => backend.onProjectFilesChanged(listener),
    );
  }

  /** The listing, once listed and again on each change. */
  readonly watch = (
    listener: (reading: NodeUiElementsReading) => void,
  ): StopWatching =>
    this.#listing.watch((reading) => {
      if (reading !== null) listener(reading);
    });
}
