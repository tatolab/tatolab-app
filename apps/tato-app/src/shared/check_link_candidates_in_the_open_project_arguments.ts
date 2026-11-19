// The arguments of `check_link_candidates_in_the_open_project` as the window sends them, decoded once in main.
// The bridge contract takes their type from here with `import type`, so the window's typed call and main's
// decode cannot drift. The request is the control contract's, checked by the runtime client.

import { contractValue } from "@tatolab/tato-app-view-sdk/studio_host/contract_value";

/** The placed pin a studio window asks about, and the candidates it asks the runtime to check it against. */
export const CheckLinkCandidatesInTheOpenProjectArguments = contractValue("CheckLinkCandidatesRequest");

/** The placed pin and candidates a studio window asks the runtime to check. */
export type LinkCandidatesAskedByTheWindow = typeof CheckLinkCandidatesInTheOpenProjectArguments.Type;
