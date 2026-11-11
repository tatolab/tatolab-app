// The one pick in the Stream graph the window holds: asked by one view, shown and answered by another.

import type { PortPickEnding, PortPickInTheStreamGraph } from "@tatolab/tato-app-view-sdk";
import { WatchedStudioValue } from "./watched_studio_value";

/** Why a pick ends when another one starts. */
export const ANOTHER_PORT_PICK_STARTED = "Another pick started.";

/** Whether the pick held was answered, or why there was none to answer. */
export type PortPickAnswering = { kind: "answered" } | { kind: "not_answered"; because: string };

/** The pick in the Stream graph the window holds, at most one at a time, and what its asking view awaits. */
export class PortPickHeldInTheWindow {
  /** The port being picked for, `null` while none is. */
  readonly portPick = new WatchedStudioValue<PortPickInTheStreamGraph | null>(null);
  private whenThePickEnds: ((ending: PortPickEnding) => void) | null = null;

  /** Hold `pick`, ending any pick held, until it is answered or ended; not started, saying `whyItCannotStart`, when that is not `null`. */
  start(pick: PortPickInTheStreamGraph, whyItCannotStart: string | null): Promise<PortPickEnding> {
    if (whyItCannotStart !== null) return Promise.resolve({ kind: "not_started", because: whyItCannotStart });
    this.end(ANOTHER_PORT_PICK_STARTED);
    return new Promise((resolvePick) => {
      this.whenThePickEnds = resolvePick;
      this.portPick.publish(pick);
    });
  }

  /** End the pick held with `node`'s `port` picked. */
  answer(node: string, port: string): PortPickAnswering {
    if (this.portPick.readLatest() === null) return { kind: "not_answered", because: "No port is being picked in the Stream graph." };
    this.finish({ kind: "picked", node, port });
    return { kind: "answered" };
  }

  /** End the pick held, if any, with nothing picked, saying `because`. */
  end(because: string): void {
    if (this.portPick.readLatest() !== null) this.finish({ kind: "ended", because });
  }

  private finish(ending: PortPickEnding): void {
    const whenThePickEnds = this.whenThePickEnds;
    this.whenThePickEnds = null;
    this.portPick.publish(null);
    whenThePickEnds?.(ending);
  }
}
