// What the studio's status bar along the window's foot says: the runtime, and the project's last
// edit and who made it.

import type { ProjectTransactionsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { RuntimeOfAnotherAge, RuntimeState } from "../../shared/tatolab_backend_contract";
import { presentRuntimeOfAnotherAge, runtimeOfAnotherAgeShownFor } from "./runtime_of_another_age_presentation";
import { presentTimeSince } from "./projects_presentation";
import type { RuntimeDescriptionReading } from "./settings_presentation";

/**
 * The status bar's runtime phrase: running, on its way, or not answering, as "tatolabd 0.68.55"; or running at another contract
 * age, as "tatolabd 0.68.55 · older than this Studio", with the record its panel shows.
 */
export type StudioStatusBarRuntime =
  | { tone: "running" | "starting" | "not_running"; words: string }
  | { tone: "of_another_age"; words: string; runtime_of_another_age: RuntimeOfAnotherAge };

/** Each phrase of the status bar, or `null` for one with nothing to say. */
export interface StudioStatusBarWords {
  runtime: StudioStatusBarRuntime;
  /** As "Last edit by Jonathan · 2 minutes ago"; `null` before the feed is read or while it holds no edit. */
  last_edit: string | null;
}

/** What the status bar reads from: the status, the runtime's description, the project's feed and the wall clock. */
export interface StudioStatusBarSources {
  runtimeState: RuntimeState;
  runtimeOfAnotherAge: RuntimeOfAnotherAge | null;
  runtimeDescription: RuntimeDescriptionReading;
  projectTransactions: ProjectTransactionsReading | null;
  wallClockNowMs: number;
}

function runtimePhraseOf(runtimeState: RuntimeState, runtimeOfAnotherAge: RuntimeOfAnotherAge | null, runtimeDescription: RuntimeDescriptionReading): StudioStatusBarRuntime {
  if (runtimeState === "not_running") return { tone: "not_running", words: "Runtime not running" };
  if (runtimeState === "starting") return { tone: "starting", words: "Runtime starting" };
  const shownOfAnotherAge = runtimeOfAnotherAgeShownFor({ runtime_state: runtimeState, runtime_of_another_age: runtimeOfAnotherAge });
  if (shownOfAnotherAge !== null) return { tone: "of_another_age", words: presentRuntimeOfAnotherAge(shownOfAnotherAge).statusBar, runtime_of_another_age: shownOfAnotherAge };
  return { tone: "running", words: runtimeDescription.kind === "read" ? `tatolabd ${runtimeDescription.description.version}` : "tatolabd" };
}

function lastEditWordsOf(projectTransactions: ProjectTransactionsReading | null, wallClockNowMs: number): string | null {
  if (projectTransactions?.kind !== "read") return null;
  const [newestTransaction] = projectTransactions.project_transactions.transactions;
  if (newestTransaction === undefined) return null;
  const appliedAtMs = Date.parse(newestTransaction.applied_at);
  const whenWords = Number.isNaN(appliedAtMs) ? newestTransaction.applied_at : presentTimeSince(appliedAtMs, wallClockNowMs);
  return `Last edit by ${newestTransaction.author_name} · ${whenWords}`;
}

/** Every phrase the status bar shows for `sources`. */
export function studioStatusBarWordsOf(sources: StudioStatusBarSources): StudioStatusBarWords {
  return {
    runtime: runtimePhraseOf(sources.runtimeState, sources.runtimeOfAnotherAge, sources.runtimeDescription),
    last_edit: lastEditWordsOf(sources.projectTransactions, sources.wallClockNowMs),
  };
}
