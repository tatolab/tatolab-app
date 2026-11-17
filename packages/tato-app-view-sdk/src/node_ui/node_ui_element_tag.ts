// The tag the Studio defines a node UI element under. A page holds one definition per tag, for
// good, so the tag names the module, the script and the folder version: two modules never
// collide, and an edited element gets a new tag.

import type { ListedNodeUiElement } from "./node_ui_elements_listing.js";

/** A name part spelled with only what a custom element name allows, each other character written `.<hex>.`, so two parts never spell alike. */
function customElementNamePart(namePart: string): string {
  return Array.from(namePart, (character) => (/^[a-z0-9_]$/.test(character) ? character : `.${(character.codePointAt(0) ?? 0).toString(16)}.`)).join("");
}

/** The tag the Studio defines `listed` under: `tato-<module>-<script>-<folder version>`. */
export function nodeUiElementTag(listed: ListedNodeUiElement): string {
  return `tato-${customElementNamePart(listed.module)}-${customElementNamePart(listed.script)}-${customElementNamePart(listed.folder_version)}`;
}
