// What an element reads of the wire into one input, shared by a control's slot and a node body's: the
// output wired in, read through its port viewer, or why nothing is read.

import type { InputWiring } from "../pin_model/input_wiring.js";
import type { StopWatching, TatoAppViewConnection } from "../tato_app_view_connection.js";
import type { ViewInputEvent } from "../view_wire_messages.js";

/** Closes the frame `event` carries, for an event no element is told of any more. */
function closeTheFrameOf(event: ViewInputEvent): void {
  if (event.kind === "image_frame") event.video_frame.close();
}

/**
 * Tells `onEvent` what `wiring` carries, read through the port viewer of the output wired in until stopped, or, when nothing is
 * wired in, why; a frame that arrives once stopped is closed.
 */
export function readWhatTheWiringCarries(project: Pick<TatoAppViewConnection, "watchPortViewer">, wiring: InputWiring, onEvent: (event: ViewInputEvent) => void): StopWatching {
  if (wiring.kind === "unwired") {
    onEvent(wiring);
    return () => undefined;
  }
  let isReading = true;
  const stopThePortViewer = project.watchPortViewer(
    wiring.target,
    (event) => (isReading ? onEvent(event) : closeTheFrameOf(event)),
    (because) => {
      if (isReading) onEvent({ kind: "ended", because: `${wiring.wired_from_words} cannot be read: ${because}`, recovery: "open_the_port_again" });
    },
  );
  return () => {
    isReading = false;
    stopThePortViewer();
  };
}
