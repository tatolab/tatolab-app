import { Effect } from "effect";
import { expect, test } from "vitest";
import type { MarketplaceImportProgressed } from "../shared/tatolab_backend_contract.js";
import { MARKETPLACE_BYTES_TOLD_EVERY_MS, marketplaceImportsTelling } from "./marketplace_imports_followed.js";

const MODULE_MANAGER_WINDOW = { windowContentsId: 3 };
const STUDIO_WINDOW = { windowContentsId: 2 };

/** `MarketplaceImports` over a clock the test moves, recording each telling by the window it went to. */
function marketplaceImportsRecorded() {
  const told: { windowContentsId: number; progressed: MarketplaceImportProgressed }[] = [];
  let nowMs = 1_000;
  const marketplaceImports = marketplaceImportsTelling(
    (windowContentsId, progressed) => told.push({ windowContentsId, progressed }),
    () => nowMs,
  );
  return { marketplaceImports, told, moveTheClockBy: (ms: number) => (nowMs += ms) };
}

test("a download's bytes are told at most every MARKETPLACE_BYTES_TOLD_EVERY_MS, its last run always, and every other stage at once, to the asking window", async () => {
  const { marketplaceImports, told, moveTheClockBy } = marketplaceImportsRecorded();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const followed = yield* marketplaceImports.followed(MODULE_MANAGER_WINDOW, "tatolab-camera");
        followed.download.stageReached({ kind: "downloading", bytes_read: 0, bytes_total: 100 });
        moveTheClockBy(MARKETPLACE_BYTES_TOLD_EVERY_MS - 1);
        followed.download.stageReached({ kind: "downloading", bytes_read: 40, bytes_total: 100 });
        moveTheClockBy(1);
        followed.download.stageReached({ kind: "downloading", bytes_read: 60, bytes_total: 100 });
        followed.download.stageReached({ kind: "downloading", bytes_read: 100, bytes_total: 100 });
        followed.download.stageReached({ kind: "verifying", sha256: "4f7a" });
        yield* followed.addingStarted;
      }),
    ),
  );

  expect(told).toEqual([
    { windowContentsId: 3, progressed: { name: "tatolab-camera", stage: { kind: "downloading", bytes_read: 0, bytes_total: 100 } } },
    { windowContentsId: 3, progressed: { name: "tatolab-camera", stage: { kind: "downloading", bytes_read: 60, bytes_total: 100 } } },
    { windowContentsId: 3, progressed: { name: "tatolab-camera", stage: { kind: "downloading", bytes_read: 100, bytes_total: 100 } } },
    { windowContentsId: 3, progressed: { name: "tatolab-camera", stage: { kind: "verifying", sha256: "4f7a" } } },
    { windowContentsId: 3, progressed: { name: "tatolab-camera", stage: { kind: "adding" } } },
  ]);
});

test("Cancel stops the download of the window that asked, while it downloads, and no other window's", async () => {
  const { marketplaceImports } = marketplaceImportsRecorded();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fromTheModuleManager = yield* marketplaceImports.followed(MODULE_MANAGER_WINDOW, "tatolab-camera");
        const fromTheStudioWindow = yield* marketplaceImports.followed(STUDIO_WINDOW, "tatolab-camera");
        yield* marketplaceImports.cancel(MODULE_MANAGER_WINDOW, "tatolab-camera");
        expect(fromTheModuleManager.download.stopped.aborted).toBe(true);
        expect(fromTheStudioWindow.download.stopped.aborted).toBe(false);
      }),
    ),
  );
});

test("Cancel is refused once the download is checked or being added, and where no add of the name is under way in the window", async () => {
  const { marketplaceImports } = marketplaceImportsRecorded();
  const refusalOf = (effect: Effect.Effect<void, { readonly words: string }>) => Effect.flip(effect).pipe(Effect.map((refused) => refused.words));
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const followed = yield* marketplaceImports.followed(MODULE_MANAGER_WINDOW, "tatolab-camera");
        expect(yield* refusalOf(marketplaceImports.cancel(STUDIO_WINDOW, "tatolab-camera"))).toBe("No add of tatolab-camera is under way in this window.");
        followed.download.stageReached({ kind: "verifying", sha256: "4f7a" });
        expect(yield* refusalOf(marketplaceImports.cancel(MODULE_MANAGER_WINDOW, "tatolab-camera"))).toBe("tatolab-camera is downloaded already and being added; it can no longer be cancelled.");
        expect(followed.download.stopped.aborted).toBe(false);
      }),
    ),
  );
});

test("a second add of a name a window is adding is refused, and the name can be added again once the first ends", async () => {
  const { marketplaceImports } = marketplaceImportsRecorded();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* marketplaceImports.followed(MODULE_MANAGER_WINDOW, "tatolab-camera");
        const second = yield* Effect.flip(marketplaceImports.followed(MODULE_MANAGER_WINDOW, "tatolab-camera"));
        expect(second.words).toBe("tatolab-camera is being added from this window already.");
      }),
    ),
  );
  expect(await Effect.runPromise(Effect.scoped(marketplaceImports.followed(MODULE_MANAGER_WINDOW, "tatolab-camera").pipe(Effect.as("followed again"))))).toBe("followed again");
  expect(await Effect.runPromise(Effect.flip(marketplaceImports.cancel(MODULE_MANAGER_WINDOW, "tatolab-camera")).pipe(Effect.map((refused) => refused.words)))).toBe(
    "No add of tatolab-camera is under way in this window.",
  );
});
