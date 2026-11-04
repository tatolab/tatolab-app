import { createElement, createSvgFromMarkup } from "../dom";

/** An icon from icons.ts at `sizePixels`, with an extra class when one is given. */
export function createIcon(iconSvg: string, sizePixels: 13 | 14 | 16 | 20 = 16, extraClass?: string): SVGElement {
  const icon = createSvgFromMarkup(iconSvg);
  icon.setAttribute("width", String(sizePixels));
  icon.setAttribute("height", String(sizePixels));
  if (extraClass) icon.classList.add(extraClass);
  return icon;
}

/** A small ring turning while something is in progress. */
export function createSpinner(): HTMLElement {
  return createElement("span", { class: "progress-spinner", "aria-hidden": "true" });
}
