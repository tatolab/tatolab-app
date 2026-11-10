// What the studio's status bar along the window's foot says: the runtime and where it runs, the
// open stream's state and size, the project's last edit and who made it, and the shortcuts this
// build answers.

import type { ListedStream, ProjectTransactionsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { RuntimeState, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { presentPlatform, shortcutHint } from "./platform_presentation";
import { presentTimeSince } from "./projects_presentation";
import type { RuntimeDescriptionReading } from "./settings_presentation";
import { RUN_LIVE_KEY } from "../studio_shell/studio_menu_bar_model";
import { STUDIO_LAYOUTS } from "../studio_shell/studio_layouts";

/** How the status bar's runtime dot reads: running, on its way, or not answering. */
export type StudioStatusBarRuntimeTone = "running" | "starting" | "not_running";

/** Each phrase of the status bar, or `null` for one with nothing to say. */
export interface StudioStatusBarWords {
  runtime_tone: StudioStatusBarRuntimeTone;
  /** As "tatolabd 0.68.55 · This Mac". */
  runtime: string;
  /** As "main running · 7 nodes"; `null` while no stream tab is open. */
  open_stream: string | null;
  /** As "Last edit by Jonathan · 2 minutes ago"; `null` before the feed is read or while it holds no edit. */
  last_edit: string | null;
  /** As "F5 Live · ⌘1–5 Layouts". */
  shortcuts: string;
}

/** What the status bar reads from: the status, the runtime's description, the open stream tab, the project's feed, the platform and the wall clock. */
export interface StudioStatusBarSources {
  runtimeState: RuntimeState;
  runtimeDescription: RuntimeDescriptionReading;
  listedStreams: readonly ListedStream[] | null;
  activeStream: string | null;
  projectTransactions: ProjectTransactionsReading | null;
  platform: TatolabPlatform;
  wallClockNowMs: number;
}

function capitalised(words: string): string {
  return words.charAt(0).toLocaleUpperCase("en") + words.slice(1);
}

function runtimeWordsOf(runtimeState: RuntimeState, runtimeDescription: RuntimeDescriptionReading, platform: TatolabPlatform): string {
  const thisMachine = capitalised(presentPlatform(platform).thisMachineMidSentence);
  if (runtimeState === "not_running") return `Runtime not running · ${thisMachine}`;
  if (runtimeState === "starting") return `Runtime starting · ${thisMachine}`;
  return runtimeDescription.kind === "read" ? `tatolabd ${runtimeDescription.description.version} · ${thisMachine}` : `tatolabd · ${thisMachine}`;
}

function openStreamWordsOf(listedStreams: readonly ListedStream[] | null, activeStream: string | null): string | null {
  if (activeStream === null) return null;
  const listedStream = listedStreams?.find((stream) => stream.stream === activeStream);
  if (listedStream === undefined) return null;
  const nodeCountWords = listedStream.node_count === null ? "" : ` · ${listedStream.node_count} ${listedStream.node_count === 1 ? "node" : "nodes"}`;
  return `${listedStream.display_name} ${listedStream.state}${nodeCountWords}`;
}

function lastEditWordsOf(projectTransactions: ProjectTransactionsReading | null, wallClockNowMs: number): string | null {
  if (projectTransactions?.kind !== "read") return null;
  const [newestTransaction] = projectTransactions.project_transactions.transactions;
  if (newestTransaction === undefined) return null;
  const appliedAtMs = Date.parse(newestTransaction.applied_at);
  const whenWords = Number.isNaN(appliedAtMs) ? newestTransaction.applied_at : presentTimeSince(appliedAtMs, wallClockNowMs);
  return `Last edit by ${newestTransaction.author_name} · ${whenWords}`;
}

function layoutShortcutsWordsOf(platform: TatolabPlatform): string {
  const firstLayout = STUDIO_LAYOUTS[0];
  const lastLayout = STUDIO_LAYOUTS.at(-1);
  if (firstLayout === undefined || lastLayout === undefined) return "";
  const firstShortcut = shortcutHint(platform, firstLayout.shortcut_digit);
  return firstLayout === lastLayout ? firstShortcut : `${firstShortcut}–${lastLayout.shortcut_digit}`;
}

/** Every phrase the status bar shows for `sources`. */
export function studioStatusBarWordsOf(sources: StudioStatusBarSources): StudioStatusBarWords {
  return {
    runtime_tone: sources.runtimeState,
    runtime: runtimeWordsOf(sources.runtimeState, sources.runtimeDescription, sources.platform),
    open_stream: openStreamWordsOf(sources.listedStreams, sources.activeStream),
    last_edit: lastEditWordsOf(sources.projectTransactions, sources.wallClockNowMs),
    shortcuts: `${RUN_LIVE_KEY} Live · ${layoutShortcutsWordsOf(sources.platform)} Layouts`,
  };
}
