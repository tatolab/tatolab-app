// Loads a listed node UI element into the page that shows it: imports its script, checks that the
// default export is a custom element class, and defines it under the tag the Studio mints for it.

import { nodeUiElementTag } from "./node_ui_element_tag.js";
import type { ListedNodeUiElement } from "./node_ui_elements_listing.js";

/** What loading an element came to: defined under `tag`, blocked by the findings its listing carries, or not loaded and why. */
export type NodeUiElementLoading =
  | { readonly kind: "defined"; readonly tag: string }
  | { readonly kind: "blocked"; readonly findings: readonly string[] }
  | { readonly kind: "not_loaded"; readonly because: string };

/** How an element's script is imported: the page's own `import()` unless a caller names another. */
export type NodeUiElementScriptImport = (scriptUrl: string) => Promise<unknown>;

/** Imports the module at `scriptUrl` with the page's own loader. */
function importScriptIntoThePage(scriptUrl: string): Promise<unknown> {
  return import(/* @vite-ignore */ scriptUrl);
}

/** Whether `candidate` is a class whose instances are HTML elements, which `customElements` can define. */
function isACustomElementClass(candidate: unknown): candidate is CustomElementConstructor {
  return typeof candidate === "function" && candidate.prototype instanceof HTMLElement;
}

/** The custom element class `scriptModule` default-exports, or `null` when its default export is not one. */
function customElementClassOfTheScript(scriptModule: unknown): CustomElementConstructor | null {
  if (typeof scriptModule !== "object" || scriptModule === null || !("default" in scriptModule)) return null;
  return isACustomElementClass(scriptModule.default) ? scriptModule.default : null;
}

/** Defines `listed` in the page's `customElements` and answers its tag, or why it is not loaded; never throws. */
export async function loadNodeUiElement(listed: ListedNodeUiElement, importScript: NodeUiElementScriptImport = importScriptIntoThePage): Promise<NodeUiElementLoading> {
  if (listed.script_serving.kind === "blocked") return { kind: "blocked", findings: listed.script_serving.findings };
  const tag = nodeUiElementTag(listed);
  const notLoaded = (reason: string): NodeUiElementLoading => ({ kind: "not_loaded", because: `${listed.module} · node_ui/${listed.script} does not load: ${reason}` });
  if (customElements.get(tag) !== undefined) return { kind: "defined", tag };
  let scriptModule: unknown;
  try {
    scriptModule = await importScript(listed.script_serving.script_url);
  } catch (importFailure) {
    return notLoaded(importFailure instanceof Error ? importFailure.message : String(importFailure));
  }
  const elementClass = customElementClassOfTheScript(scriptModule);
  if (elementClass === null) return notLoaded("its default export is not a class that extends HTMLElement.");
  if (customElements.get(tag) !== undefined) return { kind: "defined", tag };
  try {
    customElements.define(tag, elementClass);
  } catch (defineFailure) {
    return notLoaded(defineFailure instanceof Error ? defineFailure.message : String(defineFailure));
  }
  return { kind: "defined", tag };
}
