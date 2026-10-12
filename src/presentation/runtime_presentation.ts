import type { TatolabStatus } from "../backend/tatolab_backend_contract";

/** The tones every status colour in the window comes from. */
export type StatusTone = "ok" | "progress" | "idle" | "warning" | "error";

/** What the window shows for the runtime: its polled state, refined by the switch and the agent's registration. */
export type RuntimeDisplayState =
  | "running"
  | "starting"
  | "unreachable"
  | "switched_off"
  | "needs_login_items_approval"
  | "runtime_missing_from_app"
  | "not_registered";

/** What the banner above the streams says, and the one action it offers. */
export interface RuntimeBannerPresentation {
  title: string;
  explanation: string;
  action: "turn_on_run_tatolab" | "open_login_items" | "retry_run_tatolab" | null;
}

/** How the window shows the runtime: its tone, its short label, and the banner a non-running state needs. */
export interface RuntimeDisplayPresentation {
  displayState: RuntimeDisplayState;
  tone: StatusTone;
  shortLabel: string;
  banner: RuntimeBannerPresentation | null;
}

/** A stopped runtime is explained by the switch first, then by the agent's registration, as the tray explains it. */
export function deriveRuntimeDisplayState(status: TatolabStatus): RuntimeDisplayState {
  switch (status.runtime_state) {
    case "running":
      return "running";
    case "starting":
      return "starting";
    case "unreachable":
      return "unreachable";
    case "stopped":
      if (!status.run_tatolab) return "switched_off";
      if (status.runtime_agent === "requires_approval") return "needs_login_items_approval";
      if (status.runtime_agent === "not_found") return "runtime_missing_from_app";
      return "not_registered";
  }
}

/** The tone, label and banner the window shows for `status`. */
export function presentRuntimeStatus(status: TatolabStatus): RuntimeDisplayPresentation {
  const displayState = deriveRuntimeDisplayState(status);
  switch (displayState) {
    case "running":
      return { displayState, tone: "ok", shortLabel: "Running", banner: null };
    case "starting":
      return {
        displayState,
        tone: "progress",
        shortLabel: "Starting",
        banner: {
          title: "Starting the runtime",
          explanation: "macOS is launching it. This usually takes a few seconds.",
          action: null,
        },
      };
    case "unreachable":
      return {
        displayState,
        tone: "error",
        shortLabel: "Not responding",
        banner: {
          title: "The runtime isn't responding",
          explanation: "It's switched on but hasn't answered for 20 seconds. macOS restarts it if it exits.",
          action: null,
        },
      };
    case "switched_off":
      return {
        displayState,
        tone: "idle",
        shortLabel: "Stopped",
        banner: {
          title: "Tatolab is off",
          explanation: "The runtime is stopped, so no streams can run.",
          action: "turn_on_run_tatolab",
        },
      };
    case "needs_login_items_approval":
      return {
        displayState,
        tone: "warning",
        shortLabel: "Needs approval",
        banner: {
          title: "Allow Tatolab in Login Items",
          explanation: "macOS asks before the runtime runs in the background. Switch Tatolab on under Allow in the Background.",
          action: "open_login_items",
        },
      };
    case "runtime_missing_from_app":
      return {
        displayState,
        tone: "error",
        shortLabel: "Runtime missing",
        banner: {
          title: "This copy of Tatolab is missing its runtime",
          explanation: "Download Tatolab again and replace the app in Applications.",
          action: null,
        },
      };
    case "not_registered":
      return {
        displayState,
        tone: "error",
        shortLabel: "Not running",
        banner: {
          title: "The runtime didn't start",
          explanation: "Run Tatolab is on, but macOS hasn't registered the runtime.",
          action: "retry_run_tatolab",
        },
      };
  }
}
