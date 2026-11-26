// The views a studio window showed as the person opened and closed them, so Back and Forward step through
// them the way a browser's history steps through pages: a new step after Back drops the steps that were ahead.

import { Array as Arr, Equal, Option } from "effect";

/** How many steps a window's history keeps behind the one shown; older ones are dropped first. */
export const STUDIO_VIEW_HISTORY_STEPS_KEPT = 100;

/** Which way through the history a step goes. */
export type StudioViewHistoryDirection = "back" | "forward";

/** The steps behind the one shown, the oldest first; the one shown; and the steps ahead of it, the nearest first. */
export interface StudioViewHistory<Shown> {
  readonly behind: readonly Shown[];
  readonly shown: Shown;
  readonly ahead: readonly Shown[];
}

/** Whether the history can step `direction` from the one shown. */
export interface StudioViewHistorySteps {
  can_go_back: boolean;
  can_go_forward: boolean;
}

/** A history whose only step is `shown`. */
export function studioViewHistoryStartingAt<Shown>(shown: Shown): StudioViewHistory<Shown> {
  return { behind: [], shown, ahead: [] };
}

/** `history` with the step shown now taken as `shown`, as the window shows it after changes that are not steps of their own, such as a split's sizes. */
export function studioViewHistoryWithTheShownStepAs<Shown>(history: StudioViewHistory<Shown>, shown: Shown): StudioViewHistory<Shown> {
  return { ...history, shown };
}

/**
 * `history` with `shown` as its newest step, the one shown before it behind it and the steps that were ahead dropped;
 * `history` itself when `shown` equals, field by field, the one shown.
 */
export function studioViewHistoryWithAStepTo<Shown>(history: StudioViewHistory<Shown>, shown: Shown): StudioViewHistory<Shown> {
  if (Equal.equals(history.shown, shown)) return history;
  return { behind: Arr.takeRight([...history.behind, history.shown], STUDIO_VIEW_HISTORY_STEPS_KEPT), shown, ahead: [] };
}

/** `history` one step `direction` from the one shown, or none when no step lies that way. */
export function studioViewHistoryStepped<Shown>(history: StudioViewHistory<Shown>, direction: StudioViewHistoryDirection): Option.Option<StudioViewHistory<Shown>> {
  if (direction === "back") {
    return Option.map(Arr.last(history.behind), (stepBehind) => ({ behind: history.behind.slice(0, -1), shown: stepBehind, ahead: [history.shown, ...history.ahead] }));
  }
  return Option.map(Arr.head(history.ahead), (stepAhead) => ({ behind: [...history.behind, history.shown], shown: stepAhead, ahead: history.ahead.slice(1) }));
}

/** `history` with each of its steps as `stepAs` gives it, in the same places. */
export function studioViewHistoryEachStepAs<Shown>(history: StudioViewHistory<Shown>, stepAs: (step: Shown) => Shown): StudioViewHistory<Shown> {
  return { behind: history.behind.map(stepAs), shown: stepAs(history.shown), ahead: history.ahead.map(stepAs) };
}

/** Which ways `history` can step from the one shown; neither while there is no history. */
export function studioViewHistoryStepsOf<Shown>(history: StudioViewHistory<Shown> | null): StudioViewHistorySteps {
  return { can_go_back: (history?.behind.length ?? 0) > 0, can_go_forward: (history?.ahead.length ?? 0) > 0 };
}
