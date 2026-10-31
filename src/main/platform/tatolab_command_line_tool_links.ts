// The links that put the `tatolab` command on a terminal's PATH: the installer's link in
// `~/.local/bin`, which the app only reads, and on macOS the optional one in `/usr/local/bin`
// behind the administrator prompt.

import type { CommandLineToolUsrLocalBinLink } from "../../shared/tatolab_backend_contract.js";
import type { Result } from "../result.js";

/** Where `tatolab` is linked, as one status round reads it. */
export interface CommandLineToolLinksObservation {
  /** `~/.local/bin/tatolab` while it is linked; `null` otherwise. */
  homeFolderLinkedAt: string | null;
  usrLocalBinLink: CommandLineToolUsrLocalBinLink;
}

/** Why a link was not made: this platform or build does not make it, with why; or it was refused, in words. */
export type CommandLineToolLinkRefusal = { kind: "not_offered"; reason: string } | { kind: "refused"; refusal: string };

/** The links that put `tatolab` on a terminal's PATH. */
export interface TatolabCommandLineToolLinks {
  /** Both links as they are now; opens nothing. */
  observeCommandLineToolLinks(): Promise<CommandLineToolLinksObservation>;

  /** Link `tatolab` in `/usr/local/bin` behind one administrator prompt, settling once it closes; refused while one is already showing. */
  linkTheCommandLineToolInUsrLocalBin(): Promise<Result<void, CommandLineToolLinkRefusal>>;
}
