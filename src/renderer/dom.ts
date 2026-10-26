type ElementAttributeValue = string | number | boolean | null | undefined | ((event: Event) => void);

/** A child `createElement` appends; nullish and `false` children are skipped. */
export type ElementChild = Node | string | null | undefined | false;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Builds an element: `on*` keys become listeners, `true` becomes an empty attribute, nullish and `false` are skipped. */
export function createElement<TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  attributes: Record<string, ElementAttributeValue> = {},
  children: ElementChild[] = [],
): HTMLElementTagNameMap[TagName] {
  const element = document.createElement(tagName);
  for (const [attributeName, attributeValue] of Object.entries(attributes)) {
    if (attributeValue === null || attributeValue === undefined || attributeValue === false) continue;
    if (typeof attributeValue === "function") {
      element.addEventListener(attributeName.slice(2).toLowerCase(), attributeValue);
    } else if (attributeValue === true) {
      element.setAttribute(attributeName, "");
    } else {
      element.setAttribute(attributeName, String(attributeValue));
    }
  }
  appendChildren(element, children);
  return element;
}

function appendChildren(parent: Element, children: ElementChild[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child);
  }
}

/** Builds an SVG element in the SVG namespace with `attributes` set. */
export function createSvgElement<TagName extends keyof SVGElementTagNameMap>(
  tagName: TagName,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[TagName] {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  for (const [attributeName, attributeValue] of Object.entries(attributes)) {
    element.setAttribute(attributeName, String(attributeValue));
  }
  return element;
}

/** Parses trusted, app-authored SVG markup into a node. */
export function createSvgFromMarkup(svgMarkup: string): SVGElement {
  const template = document.createElement("template");
  template.innerHTML = svgMarkup.trim();
  return template.content.firstElementChild as SVGElement;
}

/** Sets `textContent` only when it differs, so unchanged text keeps its selection. */
export function setTextIfChanged(element: Element, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
