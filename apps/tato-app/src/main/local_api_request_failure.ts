import { failedWith } from "./result.js";

/** Why a local API request came back without an answer. */
export interface LocalApiRequestFailure {
  failureDescription: string;
  /** Whether the runtime answered and refused, in its own words, rather than not answering or answering something unreadable. */
  isTheRuntimesRefusal: boolean;
}

/** A failure that is not the runtime's refusal: nothing answered, or what answered could not be read. */
export function localApiRequestFailure(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: false });
}

/** The runtime's refusal, in its own words. */
export function theRuntimesRefusal(failureDescription: string): { ok: false; failure: LocalApiRequestFailure } {
  return failedWith({ failureDescription, isTheRuntimesRefusal: true });
}
