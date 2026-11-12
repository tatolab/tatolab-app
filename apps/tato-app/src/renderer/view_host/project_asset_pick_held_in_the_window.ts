// The one asset pick the window holds: asked by one view, answered by the Library the window frames in
// its asset picker.

import type { ProjectAssetPick, ProjectAssetPickEnding } from "@tatolab/tato-app-view-sdk";
import { WatchedStudioValue } from "./watched_studio_value";

/** Why an asset pick ends when another one starts. */
export const ANOTHER_PROJECT_ASSET_PICK_STARTED = "Another asset pick started.";

/** Whether the asset pick held was answered, or why there was none to answer. */
export type ProjectAssetPickAnswering = { kind: "answered" } | { kind: "not_answered"; because: string };

/** The asset pick the window holds, at most one at a time, and what its asking view awaits. */
export class ProjectAssetPickHeldInTheWindow {
  /** The asset being chosen for, `null` while none is. */
  readonly projectAssetPick = new WatchedStudioValue<ProjectAssetPick | null>(null);
  private whenThePickEnds: ((ending: ProjectAssetPickEnding) => void) | null = null;

  /** Hold `pick`, ending any asset pick held, until it is answered or ended; not started, saying `whyItCannotStart`, when that is not `null`. */
  start(pick: ProjectAssetPick, whyItCannotStart: string | null): Promise<ProjectAssetPickEnding> {
    if (whyItCannotStart !== null) return Promise.resolve({ kind: "not_started", because: whyItCannotStart });
    this.end(ANOTHER_PROJECT_ASSET_PICK_STARTED);
    return new Promise((resolvePick) => {
      this.whenThePickEnds = resolvePick;
      this.projectAssetPick.publish(pick);
    });
  }

  /** End the asset pick held with the asset `asset` chosen. */
  answer(asset: string): ProjectAssetPickAnswering {
    if (this.projectAssetPick.readLatest() === null) return { kind: "not_answered", because: "No asset is being chosen in the asset picker." };
    this.finish({ kind: "chosen", asset });
    return { kind: "answered" };
  }

  /** End the asset pick held, if any, with nothing chosen, saying `because`. */
  end(because: string): void {
    if (this.projectAssetPick.readLatest() !== null) this.finish({ kind: "ended", because });
  }

  private finish(ending: ProjectAssetPickEnding): void {
    const whenThePickEnds = this.whenThePickEnds;
    this.whenThePickEnds = null;
    this.projectAssetPick.publish(null);
    whenThePickEnds?.(ending);
  }
}
