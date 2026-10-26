// The links that put the `tatolab` command on a terminal's PATH: on macOS the app's own link in
// `~/.local/bin`, made with no prompt each time the app opens, and the optional one in
// `/usr/local/bin` behind the administrator prompt; on Linux the installer's link, which the app
// only reads.

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

  /** Link `tatolab` in the home folder with no prompt, unless it already is; never replaces a file that is not a link into a Tatolab bundle. */
  linkTheCommandLineToolInTheHomeFolder(): Promise<Result<void, CommandLineToolLinkRefusal>>;

  /** Link `tatolab` in `/usr/local/bin` behind one administrator prompt, settling once it closes; refused while one is already showing. */
  linkTheCommandLineToolInUsrLocalBin(): Promise<Result<void, CommandLineToolLinkRefusal>>;
}
