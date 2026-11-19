import type { ProgressMeterPart } from "@tatolab/tato-app-view-sdk/design_system/progress_meter";
import type { MarketplaceImportStage } from "../../shared/tatolab_backend_contract";
import { megabytesOf } from "./studio_activity_presentation";

/** Where the Cancel of a Marketplace add stands: not pressed, pressed and not yet answered, or refused in the main process's words. */
export type MarketplaceAddCancel = { kind: "not_asked" } | { kind: "asked" } | { kind: "refused"; because: string };

/** A Marketplace add as the window that asked for it follows it: the stage last told, when its download began and when it was last told, by the window's clock, and its Cancel. */
export interface MarketplaceAddFollowed {
  stage: MarketplaceImportStage;
  downloading_since_ms: number;
  told_at_ms: number;
  cancel: MarketplaceAddCancel;
}

/** How a Marketplace add shows on its module's page: its meter's label, detail line, filled share and stages, and whether Cancel is offered. */
export interface MarketplaceAddShown {
  label: string;
  detail: string;
  percent: number | null;
  parts: ProgressMeterPart[];
  offersCancel: boolean;
}

/** The fewest milliseconds of downloading before its rate is said; a rate read off the first run of bytes says little. */
export const MARKETPLACE_RATE_SAID_AFTER_MS = 1_000;

/** `followed`, or a new add's following, once the main process tells it reached `stage` at `nowMs`. */
export function marketplaceAddFollowedOnceTold(followed: MarketplaceAddFollowed | null, stage: MarketplaceImportStage, nowMs: number): MarketplaceAddFollowed {
  return { stage, downloading_since_ms: followed?.downloading_since_ms ?? nowMs, told_at_ms: nowMs, cancel: followed?.cancel ?? { kind: "not_asked" } };
}

function secondsLeftWordsOf(seconds: number): string {
  return seconds < 60 ? `about ${Math.max(1, Math.round(seconds))} s left` : `about ${Math.round(seconds / 60)} min left`;
}

function downloadingDetailOf(bytesRead: number, bytesTotal: number | null, elapsedMs: number): string {
  if (bytesRead === 0) return "Starting the download…";
  const bytesWords = bytesTotal === null ? megabytesOf(bytesRead) : `${megabytesOf(bytesRead)} of ${megabytesOf(bytesTotal)}`;
  if (elapsedMs < MARKETPLACE_RATE_SAID_AFTER_MS) return bytesWords;
  const bytesPerSecond = bytesRead / (elapsedMs / 1_000);
  const rateWords = `${megabytesOf(bytesPerSecond)}/s`;
  return bytesTotal === null || bytesTotal <= bytesRead ? `${bytesWords} · ${rateWords}` : `${bytesWords} · ${rateWords} · ${secondsLeftWordsOf((bytesTotal - bytesRead) / bytesPerSecond)}`;
}

const STAGE_ORDER: Record<MarketplaceImportStage["kind"], number> = { downloading: 0, verifying: 1, adding: 2 };

/** Each stage of the add on its own line: done, the one under way, or still waiting. */
function partsOf(stage: MarketplaceImportStage, projectName: string): ProgressMeterPart[] {
  const reached = STAGE_ORDER[stage.kind];
  const partWords = (order: number, wordsUnderWay: string, wordsDone: string) => (reached > order ? wordsDone : reached === order ? wordsUnderWay : "Waiting");
  const bytesWords = stage.kind === "downloading" ? (stage.bytes_total === null ? megabytesOf(stage.bytes_read) : `${megabytesOf(stage.bytes_read)} of ${megabytesOf(stage.bytes_total)}`) : "";
  return [
    { name: "Download", detail: partWords(0, bytesWords, "Done") },
    { name: "Check its SHA-256", detail: partWords(1, "Checking", "Matches") },
    { name: `Add to ${projectName}`, detail: partWords(2, "Adding", "Done") },
    { name: "Nodes ready", detail: "Waiting" },
  ];
}

/** How the add of the module `title` to the project `projectName` shows on its page, as last told in `followed`. */
export function marketplaceAddShownOf(followed: MarketplaceAddFollowed, title: string, projectName: string): MarketplaceAddShown {
  const { stage } = followed;
  const parts = partsOf(stage, projectName);
  if (stage.kind === "downloading") {
    return {
      label: `Downloading ${title}…`,
      detail: downloadingDetailOf(stage.bytes_read, stage.bytes_total, followed.told_at_ms - followed.downloading_since_ms),
      percent: stage.bytes_total === null || stage.bytes_total === 0 ? null : Math.min(100, (stage.bytes_read / stage.bytes_total) * 100),
      parts,
      offersCancel: true,
    };
  }
  if (stage.kind === "verifying") return { label: `Checking ${title} against its SHA-256…`, detail: `The catalog's SHA-256: ${stage.sha256}`, percent: null, parts, offersCancel: false };
  return { label: `Adding ${title} to ${projectName}…`, detail: "Leave this page any time. It keeps going.", percent: null, parts, offersCancel: false };
}
