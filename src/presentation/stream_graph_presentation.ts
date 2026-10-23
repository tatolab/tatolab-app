// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphLink } from "../backend/tatolab_backend_contract";

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
