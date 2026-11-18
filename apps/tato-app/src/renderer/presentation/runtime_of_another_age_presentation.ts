// What the window says of a runtime that refused this Studio's control contract: which side is older,
// the facts the runtime's record states, and the one thing to do about it. It blocks nothing.

import type { ControlContractAge, RuntimeOfAnotherAge, TatolabStatus } from "../../shared/tatolab_backend_contract";

/** The runtime of another age the window shows for `status`: only a running one, whose record the status still holds; `null` otherwise. */
export function runtimeOfAnotherAgeShownFor(status: Pick<TatolabStatus, "runtime_state" | "runtime_of_another_age">): RuntimeOfAnotherAge | null {
  return status.runtime_state === "running" ? status.runtime_of_another_age : null;
}

/** The notice's words: a title naming the older side, the record's facts, the remedy, and the status bar's short form. */
export interface RuntimeOfAnotherAgeWords {
  title: string;
  /** The runtime's release and both contracts, as its record states them, and that the projects are untouched. */
  explanation: string;
  /** The one thing to do, as a sentence. */
  remedy: string;
  /** Whether the remedy is updating Tato Studio, which the notice offers through the app's own updater. */
  offersTheStudioUpdate: boolean;
  /** As "tatolabd 0.55.2 · older than this Studio". */
  statusBar: string;
}

/** `contract` as the notice names it: "contract 3, revision 1". */
function contractWords(contract: ControlContractAge): string {
  return `contract ${contract.version}, revision ${contract.revision}`;
}

function remedyWords(runtimeOfAnotherAge: RuntimeOfAnotherAge): string {
  switch (runtimeOfAnotherAge.remedy) {
    case "update_studio":
      return runtimeOfAnotherAge.older_side === "studio"
        ? "Update Tato Studio."
        : "Update Tato Studio: the runtime it carries and started is the older one.";
    case "quit_the_running_runtime":
      return "Quit the tatolabd that is running. Tato Studio didn't start it, so it leaves it alone; once it has quit, Tato Studio starts the one it carries.";
    case "update_the_runtime":
      return "Update the tatolabd that is running. This build of Tato Studio carries no runtime of its own.";
  }
}

/** Every word of the notice for `runtimeOfAnotherAge`. */
export function presentRuntimeOfAnotherAge(runtimeOfAnotherAge: RuntimeOfAnotherAge): RuntimeOfAnotherAgeWords {
  const runtime = `tatolabd ${runtimeOfAnotherAge.runtime_version}`;
  const runtimeServes = `${runtime} serves control ${contractWords(runtimeOfAnotherAge.runtime_contract)}`;
  const isTheRuntimeOlder = runtimeOfAnotherAge.older_side === "runtime";
  return {
    title: isTheRuntimeOlder ? "The runtime is older than this Studio" : "This Studio is older than the runtime",
    explanation: isTheRuntimeOlder
      ? `${runtimeServes}; this Studio needs ${contractWords(runtimeOfAnotherAge.studio_contract)}. Your projects are untouched.`
      : `${runtimeServes}; this Studio was built for ${contractWords(runtimeOfAnotherAge.studio_contract)}. Your projects are untouched.`,
    remedy: remedyWords(runtimeOfAnotherAge),
    offersTheStudioUpdate: runtimeOfAnotherAge.remedy === "update_studio",
    statusBar: `${runtime} · ${isTheRuntimeOlder ? "older" : "newer"} than this Studio`,
  };
}
