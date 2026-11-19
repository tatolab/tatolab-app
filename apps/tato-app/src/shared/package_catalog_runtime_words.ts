// A Marketplace module that needs a newer runtime than the one answering, said the way a person
// reads it: the runtime rides inside Tato Studio, so a newer Studio is what brings it.

/** A card's corner for a module that needs a newer runtime, which has room for no more. */
export const NEEDS_A_NEWER_TATO_STUDIO_WORDS = "Needs a newer Tato Studio";

/** Why the module `title` is not added: it runs on runtime `lowestRuntimeVersion` or later, as "Camera runs on runtime 0.69.44 or later, which a newer Tato Studio carries. Update Tato Studio to add it." */
export function whyTheModuleNeedsANewerRuntime(title: string, lowestRuntimeVersion: string): string {
  return `${title} runs on runtime ${lowestRuntimeVersion} or later, which a newer Tato Studio carries. Update Tato Studio to add it.`;
}
