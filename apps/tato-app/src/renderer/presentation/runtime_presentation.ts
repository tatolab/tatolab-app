import type { RuntimeState, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { presentRuntimeOfAnotherAge } from "./runtime_of_another_age_presentation";

/** The tones every status colour in the window comes from. */
export type StatusTone = "ok" | "progress" | "idle" | "warning" | "error";

/** What the window says of the runtime while it is not running, or runs at another contract age: a title, and why in the words the app was given. */
export interface RuntimeBannerPresentation {
  title: string;
  explanation: string;
}

/** How the window shows the runtime: its state, its tone, its short label, and the banner a non-running state or a runtime of another age needs. */
export interface RuntimeDisplayPresentation {
  runtimeState: RuntimeState;
  tone: StatusTone;
  shortLabel: string;
  banner: RuntimeBannerPresentation | null;
}

/** The tone, label and banner the window shows for `status`. */
export function presentRuntimeStatus(status: TatolabStatus): RuntimeDisplayPresentation {
  switch (status.runtime_state) {
    case "running": {
      if (status.runtime_of_another_age === null) return { runtimeState: "running", tone: "ok", shortLabel: "Running", banner: null };
      const words = presentRuntimeOfAnotherAge(status.runtime_of_another_age);
      return { runtimeState: "running", tone: "warning", shortLabel: "Running", banner: { title: words.title, explanation: `${words.explanation} ${words.remedy}` } };
    }
    case "starting":
      return {
        runtimeState: "starting",
        tone: "progress",
        shortLabel: "Starting",
        banner: { title: "Starting the runtime", explanation: "Tato Studio is starting it. This usually takes a few seconds." },
      };
    case "not_running":
      return {
        runtimeState: "not_running",
        tone: "error",
        shortLabel: "Not running",
        banner: { title: "The runtime isn't running", explanation: status.runtime_not_running_because ?? "No runtime is answering." },
      };
  }
}
