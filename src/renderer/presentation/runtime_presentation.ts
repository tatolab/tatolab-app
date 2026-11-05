import type { TatolabStatus } from "../../shared/tatolab_backend_contract";
import { platformOf } from "./platform_presentation";

/** The tones every status colour in the window comes from. */
export type StatusTone = "ok" | "progress" | "idle" | "warning" | "error";

/** What the window shows for the runtime: its polled state, refined by the switch and the agent's registration. */
export type RuntimeDisplayState =
  | "running"
  | "starting"
  | "unreachable"
  | "never_answered"
  | "blocked_by_the_service_manager"
  | "switched_off"
  | "needs_login_items_approval"
  | "runtime_missing_from_app"
  | "not_registered"
  | "runtime_not_installed";

/** What a runtime state offers the person to bring the runtime back: turn the switch on, or approve it in Login Items. */
export type RuntimeBannerAction = "turn_on_run_tatolab" | "open_login_items";

/** The words on the button of each action that brings the runtime back. */
export const RUNTIME_BANNER_ACTION_LABELS: Record<RuntimeBannerAction, string> = {
  turn_on_run_tatolab: "Turn On Tatolab",
  open_login_items: "Open Login Items…",
};

/** The window's lead before each action's refusal, naming what was refused. */
export const RUNTIME_BANNER_ACTION_REFUSAL_LEADS: Record<RuntimeBannerAction, string> = {
  turn_on_run_tatolab: "Couldn't turn Tatolab on:",
  open_login_items: "Couldn't open Login Items:",
};

/** What the banner above the streams says, and the one action it offers. */
export interface RuntimeBannerPresentation {
  title: string;
  explanation: string;
  action: RuntimeBannerAction | null;
}

/** How the window shows the runtime: its tone, its short label, and the banner a non-running state needs. */
export interface RuntimeDisplayPresentation {
  displayState: RuntimeDisplayState;
  tone: StatusTone;
  shortLabel: string;
  banner: RuntimeBannerPresentation | null;
}

/**
 * A stopped runtime is explained by the switch first, then by the agent's registration, as the tray explains it. On
 * Linux a missing unit comes first, since nothing runs until the installer has, and a disabled unit is switched off.
 */
export function deriveRuntimeDisplayState(status: TatolabStatus): RuntimeDisplayState {
  switch (status.runtime_state) {
    case "running":
      return "running";
    case "starting":
      return "starting";
    case "unreachable":
      return "unreachable";
    case "never_answered":
      return "never_answered";
    case "blocked_by_the_service_manager":
      return "blocked_by_the_service_manager";
    case "stopped":
      if (platformOf(status) === "linux") {
        return status.runtime_agent === "not_found" ? "runtime_not_installed" : "switched_off";
      }
      if (!status.run_tatolab) return "switched_off";
      if (status.runtime_agent === "requires_approval") return "needs_login_items_approval";
      if (status.runtime_agent === "not_found") return "runtime_missing_from_app";
      return "not_registered";
  }
}

/** The tone, label and banner the window shows for `status`, in its platform's words. */
export function presentRuntimeStatus(status: TatolabStatus): RuntimeDisplayPresentation {
  const displayState = deriveRuntimeDisplayState(status);
  const isLinux = platformOf(status) === "linux";
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
          explanation: isLinux
            ? "systemd is starting tatolabd.service. This usually takes a few seconds."
            : "macOS is launching it. This usually takes a few seconds.",
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
          explanation: isLinux
            ? "It was answering, then stopped, and hasn't answered for over 20 seconds. systemd restarts tatolabd.service if it fails."
            : "It was answering, then stopped, and hasn't answered for over 20 seconds. macOS restarts it if it exits.",
          action: null,
        },
      };
    case "never_answered":
      return {
        displayState,
        tone: "error",
        shortLabel: "Didn't start",
        banner: {
          title: "The runtime didn't start",
          explanation: "Retrying automatically.",
          action: null,
        },
      };
    case "blocked_by_the_service_manager":
      return {
        displayState,
        tone: "error",
        shortLabel: "Blocked",
        banner: isLinux
          ? {
              title: "systemd stopped the runtime",
              explanation: "Retrying automatically.",
              action: null,
            }
          : {
              title: "Blocked by macOS",
              explanation: "Retrying automatically.",
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
          explanation: isLinux
            ? "tatolabd.service is stopped, so no streams can run."
            : "The runtime is stopped, so no streams can run.",
          action: "turn_on_run_tatolab",
        },
      };
    case "needs_login_items_approval":
      return {
        displayState,
        tone: "warning",
        shortLabel: "Needs approval",
        banner: {
          title: "Needs your approval",
          explanation: "macOS asks before the runtime runs in the background. In Login Items, turn on Tatolab under Allow in the Background.",
          action: "open_login_items",
        },
      };
    case "runtime_missing_from_app":
      return {
        displayState,
        tone: "error",
        shortLabel: "Runtime missing",
        banner: {
          title: "This copy of Tato Studio is missing its runtime",
          explanation: "Download Tato Studio again and replace the app in Applications.",
          action: null,
        },
      };
    case "not_registered":
      return {
        displayState,
        tone: "error",
        shortLabel: "Not running",
        banner: {
          title: "The runtime isn't registered",
          explanation: "Retrying automatically.",
          action: null,
        },
      };
    case "runtime_not_installed":
      return {
        displayState,
        tone: "idle",
        shortLabel: "Not installed",
        banner: {
          title: "Install the Tatolab runtime",
          explanation: "tatolabd.service isn't on this computer yet. The installer sets it up.",
          action: null,
        },
      };
  }
}

/** Which screen fills the window: the platform's own setup until Tatolab can run here, then the pages. */
export type TatolabWindowScreen = "setup" | "pages";

/** macOS shows Welcome and Getting set up until "Get Started" ends first run; Linux waits for the installer to put tatolabd.service in place. */
export function chooseTatolabWindowScreen(status: TatolabStatus): TatolabWindowScreen {
  const needsSetup = platformOf(status) === "linux" ? deriveRuntimeDisplayState(status) === "runtime_not_installed" : !status.first_run_finished;
  return needsSetup ? "setup" : "pages";
}
