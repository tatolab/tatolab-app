import type { TatolabStatus } from "../../shared/tatolab_backend_contract";
import { presentRuntimeStatus, type RuntimeBannerAction, type RuntimeBannerPresentation } from "./runtime_presentation";

/** Where a getting-started step stands, as the checklist shows it: not yet its turn, under way, done, waiting on the person, or failed. */
export type GettingStartedStepProgress = "waiting" | "in_progress" | "done" | "needs_you" | "failed";

/** A step of Getting set up: starting the runtime, and approving it in Login Items when macOS needs the person. */
export type GettingStartedStepName = "start_the_runtime" | "approve_in_login_items";

/** One row of the Getting set up checklist. */
export interface GettingStartedStepPresentation {
  step: GettingStartedStepName;
  title: string;
  /** The short line under the title: how the step stands. */
  progressWords: string;
  /** What to do, or why it stands as it does, when there is more to say; `null` when there is not. */
  explanation: string | null;
  progress: GettingStartedStepProgress;
  /** The one action that moves the step on, as the runtime's banners offer it; `null` with none. */
  action: RuntimeBannerAction | null;
}

/** Getting set up for one status: its checklist, and whether Get Started may be pressed yet. */
export interface GettingStartedPresentation {
  steps: readonly GettingStartedStepPresentation[];
  /** Get Started opens the Streams list once the runtime answers. */
  getStartedIsOffered: boolean;
  /** What the footer says beside Get Started. */
  footerWords: string;
}

const START_THE_RUNTIME = "Start the runtime";

/** The checklist for `status`: "Start the runtime" alone, retrying while the runtime is blocked or hasn't answered, and a step of its own when macOS needs the person's approval. */
export function presentGettingStarted(status: TatolabStatus): GettingStartedPresentation {
  const runtimePresentation = presentRuntimeStatus(status);
  const checklistStepFromTheRuntimeBanner = (
    step: GettingStartedStepName,
    banner: RuntimeBannerPresentation | null,
    progressWords: string,
    progress: GettingStartedStepProgress,
  ): GettingStartedStepPresentation[] =>
    banner === null ? [] : [{ step, title: banner.title, progressWords, explanation: banner.explanation, progress, action: banner.action }];
  const waitingOnTheRuntime = (steps: readonly GettingStartedStepPresentation[]): GettingStartedPresentation => ({
    steps,
    getStartedIsOffered: false,
    footerWords: "Get Started opens once the runtime answers.",
  });
  switch (runtimePresentation.displayState) {
    case "running":
      return {
        steps: [{ step: "start_the_runtime", title: START_THE_RUNTIME, progressWords: "Running", explanation: null, progress: "done", action: null }],
        getStartedIsOffered: true,
        footerWords: "The runtime is running.",
      };
    case "starting":
      return waitingOnTheRuntime([
        { step: "start_the_runtime", title: START_THE_RUNTIME, progressWords: "Starting…", explanation: null, progress: "in_progress", action: null },
      ]);
    case "needs_login_items_approval":
      return waitingOnTheRuntime([
        { step: "start_the_runtime", title: START_THE_RUNTIME, progressWords: "Starts once you approve it", explanation: null, progress: "waiting", action: null },
        ...checklistStepFromTheRuntimeBanner("approve_in_login_items", runtimePresentation.banner, "Waiting for you", "needs_you"),
      ]);
    case "blocked_by_the_service_manager":
    case "never_answered":
    case "not_registered":
      return waitingOnTheRuntime([
        {
          step: "start_the_runtime",
          title: START_THE_RUNTIME,
          progressWords: "Retrying…",
          explanation: runtimePresentation.banner?.title ?? null,
          progress: "in_progress",
          action: null,
        },
      ]);
    default:
      return waitingOnTheRuntime([
        {
          step: "start_the_runtime",
          title: START_THE_RUNTIME,
          progressWords: runtimePresentation.banner?.title ?? runtimePresentation.shortLabel,
          explanation: runtimePresentation.banner?.explanation ?? null,
          progress: runtimePresentation.tone === "error" ? "failed" : "needs_you",
          action: runtimePresentation.banner?.action ?? null,
        },
      ]);
  }
}

/** The notice over the Streams list when Get Started could not be remembered: first run is over for this launch, and Welcome comes back at the next. */
export function presentFirstRunFinishingRefusal(refusalReason: string): { title: string; detail: string } {
  return { title: "Setup wasn't saved", detail: `Tato Studio couldn't remember that you've set it up, so Welcome shows again next time it opens. ${refusalReason}` };
}
