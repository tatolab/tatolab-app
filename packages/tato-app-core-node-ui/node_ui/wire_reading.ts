// What a control on an input of a type only a wire carries reads: what the output wired into its
// input carries, from the moment the control is connected until it is taken off. It is not an
// element: a control holds one and tells it when it is connected and taken off.

import type { StopWatching, ViewInputEvent } from "@tatolab/tato-app-view-sdk";
import type { NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";

/** The wire into one input, read while its control is connected. */
export class WireReading {
  readonly #onEvent: (event: ViewInputEvent) => void;
  #studio: NodeUiElementHost | null = null;
  #input: string | null = null;
  #stopWatching: StopWatching | null = null;

  /** Reads what is wired in through `onEvent`, which closes each `VideoFrame` it is handed. */
  constructor(onEvent: (event: ViewInputEvent) => void) {
    this.#onEvent = onEvent;
  }

  /** The Studio to ask and the input whose wire is read, as the control's pin names them. */
  readFrom(studio: NodeUiElementHost, input: string): void {
    this.#studio = studio;
    this.#input = input;
  }

  /** Begins reading, as the control is connected. */
  start(): void {
    if (this.#stopWatching !== null || this.#studio === null || this.#input === null) return;
    this.#stopWatching = this.#studio.watchWhatIsWiredInto(this.#input, this.#onEvent);
  }

  /** Ends reading, as the control is taken off. */
  stop(): void {
    this.#stopWatching?.();
    this.#stopWatching = null;
  }
}
