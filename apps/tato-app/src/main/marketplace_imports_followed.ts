// Each Marketplace package being added, by the window that asked and the catalog's name for it: the stages it reaches told to that
// window, its download's bytes at most every MARKETPLACE_BYTES_TOLD_EVERY_MS, and a Cancel that stops the download until it is
// checked, after which the import runs to its end.

import { Context, Data, Effect, type Scope } from "effect";
import type { MarketplaceImportProgressed, MarketplaceImportStage } from "../shared/tatolab_backend_contract.js";
import type { MarketplaceDownloadFollowing } from "./marketplace_module_download.js";
import type { TatolabCommandFromWindow } from "./tatolab_command_answers.js";
import { CommandRefused } from "./window_command.js";

/** The fewest milliseconds between two tellings of a download's bytes, so a fast download does not flood the window. */
export const MARKETPLACE_BYTES_TOLD_EVERY_MS = 200;

/** A Marketplace download its Cancel stopped, with nothing imported, said in `words` where nothing answers it as a cancel. */
export class MarketplaceDownloadStopped extends Data.TaggedError("MarketplaceDownloadStopped")<{ readonly words: string }> {}

/** One Marketplace add followed: what its download tells and watches, and the telling that the runtime has started adding it. */
export interface MarketplaceImportFollowed {
  download: MarketplaceDownloadFollowing;
  addingStarted: Effect.Effect<void>;
}

/** The Marketplace packages being added, each told to the window that asked for it and stoppable from there while it downloads. */
export class MarketplaceImports extends Context.Service<
  MarketplaceImports,
  {
    /** The add of `name` asked from the window `commandFromWindow` names, followed until the scope closes; refused while that window adds `name` already. */
    readonly followed: (commandFromWindow: TatolabCommandFromWindow, name: string) => Effect.Effect<MarketplaceImportFollowed, CommandRefused, Scope.Scope>;
    /** The download of `name` that window asked for, stopped; refused once it is checked or being added, or where none is under way. */
    readonly cancel: (commandFromWindow: TatolabCommandFromWindow, name: string) => Effect.Effect<void, CommandRefused>;
  }
>()("tatolab-app/MarketplaceImports") {}

interface MarketplaceImportUnderWay {
  stopper: AbortController;
  stage: MarketplaceImportStage;
}

/** `MarketplaceImports` telling each window through `tellTheWindow`, its page named by its contents id, timed by `nowMs`. */
export function marketplaceImportsTelling(tellTheWindow: (windowContentsId: number, progressed: MarketplaceImportProgressed) => void, nowMs: () => number): MarketplaceImports["Service"] {
  const underWayByKey = new Map<string, MarketplaceImportUnderWay>();
  const keyOf = (commandFromWindow: TatolabCommandFromWindow, name: string) => `${commandFromWindow.windowContentsId}\u0000${name}`;
  return {
    followed: (commandFromWindow, name) =>
      Effect.acquireRelease(
        Effect.suspend(() => {
          const key = keyOf(commandFromWindow, name);
          if (underWayByKey.has(key)) return Effect.fail(new CommandRefused({ words: `${name} is being added from this window already.` }));
          const underWay: MarketplaceImportUnderWay = { stopper: new AbortController(), stage: { kind: "downloading", bytes_read: 0, bytes_total: null } };
          underWayByKey.set(key, underWay);
          let bytesLastToldAtMs: number | null = null;
          const stageReached = (stage: MarketplaceImportStage) => {
            underWay.stage = stage;
            if (stage.kind === "downloading" && stage.bytes_read !== stage.bytes_total && bytesLastToldAtMs !== null && nowMs() - bytesLastToldAtMs < MARKETPLACE_BYTES_TOLD_EVERY_MS) return;
            if (stage.kind === "downloading") bytesLastToldAtMs = nowMs();
            tellTheWindow(commandFromWindow.windowContentsId, { name, stage });
          };
          return Effect.succeed({ key, followed: { download: { stageReached, stopped: underWay.stopper.signal }, addingStarted: Effect.sync(() => stageReached({ kind: "adding" })) } });
        }),
        ({ key }) => Effect.sync(() => underWayByKey.delete(key)),
      ).pipe(Effect.map(({ followed }) => followed)),
    cancel: (commandFromWindow, name) =>
      Effect.suspend(() => {
        const underWay = underWayByKey.get(keyOf(commandFromWindow, name));
        if (underWay === undefined) return Effect.fail(new CommandRefused({ words: `No add of ${name} is under way in this window.` }));
        if (underWay.stage.kind !== "downloading") return Effect.fail(new CommandRefused({ words: `${name} is downloaded already and being added; it can no longer be cancelled.` }));
        underWay.stopper.abort();
        return Effect.void;
      }),
  };
}
