// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphLink } from "../backend/tatolab_backend_contract";

/** How a graph node's box reads: solid while running, dashed while starting or idle, faded when paused, red in error. */
export type GraphNodeLook = "running" | "starting" | "idle" | "paused" | "error" | "outside_this_stream";

/** A graph node's look and the word its foot shows for a state other than running. */
export interface GraphNodeStatePresentation {
  look: GraphNodeLook;
  /** `null` while running; the runtime's raw word for a state newer than this app. */
  footText: string | null;
  isFailure: boolean;
}

/** How a node the runtime reports in `processorState` reads, or a link's end in another stream when it isn't in this one. */
export function presentGraphNodeState(processorState: string | null, isInThisStream: boolean): GraphNodeStatePresentation {
  if (!isInThisStream) return { look: "outside_this_stream", footText: null, isFailure: false };
  switch (processorState) {
    case null:
    case "Running":
      return { look: "running", footText: null, isFailure: false };
    case "Pending":
      return { look: "starting", footText: "Starting…", isFailure: false };
    case "Idle":
      return { look: "idle", footText: "Idle", isFailure: false };
    case "Paused":
      return { look: "paused", footText: "Paused", isFailure: false };
    case "Error":
      return { look: "error", footText: "In error. The reason is in the logs.", isFailure: true };
    default:
      return { look: "running", footText: processorState, isFailure: false };
  }
}

/** How a link's stroke reads: solid when wired, dashed while wiring or waiting, faded dashed while ending, red when failed. */
export type GraphLinkLook = "wired" | "pending" | "ending" | "error";

/** A link's stroke and the sentence its tooltip gives after `source.port → target.port`. */
export interface GraphLinkStatePresentation {
  look: GraphLinkLook;
  sentence: string;
}

/** How `link` reads in its state, including a state newer than this app. */
export function presentGraphLinkState(link: Pick<StreamGraphLink, "state" | "source_node">): GraphLinkStatePresentation {
  switch (link.state) {
    case "wired":
      return { look: "wired", sentence: "Wired" };
    case "pending":
      return { look: "pending", sentence: "Wiring…" };
    case "awaiting_remote":
      return { look: "pending", sentence: `Waiting for ${link.source_node} to be exposed` };
    case "error":
      return { look: "error", sentence: "This link failed" };
    case "disconnecting":
      return { look: "ending", sentence: "Disconnecting" };
    case "disconnected":
      return { look: "ending", sentence: "Disconnected" };
    default:
      return { look: "pending", sentence: link.state };
  }
}
