// The tray's one-line reading of the status the window also shows. The status's own types are the
// window's contract.

import type { TatolabStatus } from "../shared/tatolab_backend_contract.js";

/** The tray's one-line status, the disabled first item of its menu. */
export function trayStatusLine(status: TatolabStatus): string {
  switch (status.runtime_state) {
    case "running":
      if (status.streams === null) return "Runtime running";
      return status.streams.length === 1 ? "Runtime running · 1 stream" : `Runtime running · ${status.streams.length} streams`;
    case "starting":
      return "Starting the runtime…";
    case "not_running":
      return "Runtime not running";
  }
}
