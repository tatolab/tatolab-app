import type { ListedStream } from "../../shared/tatolab_backend_contract";
import type { ProjectReload } from "../project_reloads_of_the_window";
import { folderBaseName, followedStepWords, presentStreamsTakenIn, projectLoadDoneHeadingWords, projectLoadDoneLeadWords } from "./add_stream_flow";

/** The lead of a reload the runtime ended `failed`, before its `failed_because`. */
export const RELOAD_FAILED_LEAD = "Reload failed:";
/** The lead of a reload the runtime refused to queue, before its words. */
export const RELOAD_WAS_REFUSED_LEAD = "Reload was refused:";
/** The lead of a reload no longer followed, before why. */
export const RELOAD_NO_LONGER_FOLLOWED_LEAD = "Tatolab stopped following the reload:";

/** A project's last Reload as its page says it: under way with its step, or what it came to, with the runtime's words where it failed. */
export type ProjectReloadPresentation =
  | { kind: "under_way"; words: string }
  | { kind: "ended"; tone: "plain" | "warning"; heading: string; detail: string }
  | { kind: "refused"; lead: string; words: string };

/** What `reload` of `projectDirectory` says on its page, with the streams it took in read through `listedStreams`. */
export function presentProjectReload(projectDirectory: string, reload: ProjectReload, listedStreams: readonly ListedStream[] | null): ProjectReloadPresentation {
  switch (reload.kind) {
    case "queuing":
      return { kind: "under_way", words: "Reloading…" };
    case "following":
      return { kind: "under_way", words: `Reloading: ${followedStepWords(reload.description).toLowerCase()}…` };
    case "refused":
      return { kind: "refused", lead: RELOAD_WAS_REFUSED_LEAD, words: reload.words };
    case "no_longer_followed":
      return { kind: "refused", lead: RELOAD_NO_LONGER_FOLLOWED_LEAD, words: reload.words };
    case "ended": {
      const { description } = reload;
      if (description.state === "failed") return { kind: "refused", lead: RELOAD_FAILED_LEAD, words: description.failed_because ?? "the runtime gave no reason" };
      if (description.state === "cancelled") return { kind: "ended", tone: "warning", heading: "The reload was cancelled", detail: "The runtime cancelled the reload before it ended." };
      const streamsTakenIn = presentStreamsTakenIn(description, listedStreams);
      if (streamsTakenIn.length === 0) return { kind: "ended", tone: "warning", heading: `The reload loaded no stream from ${folderBaseName(projectDirectory)}`, detail: "" };
      const failedCount = streamsTakenIn.filter((streamTakenIn) => streamTakenIn.isFailed).length;
      return {
        kind: "ended",
        tone: failedCount > 0 ? "warning" : "plain",
        heading: `Reloaded: ${projectLoadDoneHeadingWords(projectDirectory, streamsTakenIn)}`,
        detail: projectLoadDoneLeadWords(streamsTakenIn),
      };
    }
  }
}
