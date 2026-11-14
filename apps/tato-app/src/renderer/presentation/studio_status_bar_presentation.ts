// What the studio's status bar along the window's foot says: the runtime, and the project's last
// edit and who made it.

import type { ProjectTransactionsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { RuntimeState } from "../../shared/tatolab_backend_contract";
import { presentTimeSince } from "./projects_presentation";
import type { RuntimeDescriptionReading } from "./settings_presentation";

/** How the status bar's runtime dot reads: running, on its way, or not answering. */
export type StudioStatusBarRuntimeTone = "running" | "starting" | "not_running";

/** Each phrase of the status bar, or `null` for one with nothing to say. */
export interface StudioStatusBarWords {
  runtime_tone: StudioStatusBarRuntimeTone;
  /** As "tatolabd 0.68.55". */
  runtime: string;
  /** As "Last edit by Jonathan · 2 minutes ago"; `null` before the feed is read or while it holds no edit. */
  last_edit: string | null;
}

/** What the status bar reads from: the status, the runtime's description, the project's feed and the wall clock. */
export interface StudioStatusBarSources {
  runtimeState: RuntimeState;
  runtimeDescription: RuntimeDescriptionReading;
  projectTransactions: ProjectTransactionsReading | null;
  wallClockNowMs: number;
}

function runtimeWordsOf(runtimeState: RuntimeState, runtimeDescription: RuntimeDescriptionReading): string {
  if (runtimeState === "not_running") return "Runtime not running";
  if (runtimeState === "starting") return "Runtime starting";
  return runtimeDescription.kind === "read" ? `tatolabd ${runtimeDescription.description.version}` : "tatolabd";
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
    runtime_tone: sources.runtimeState,
    runtime: runtimeWordsOf(sources.runtimeState, sources.runtimeDescription),
    last_edit: lastEditWordsOf(sources.projectTransactions, sources.wallClockNowMs),
  };
}
