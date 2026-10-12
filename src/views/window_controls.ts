import type { TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, type ElementChild } from "../dom";
import { ALERT_ICON_SVG, SEARCH_ICON_SVG } from "../icons";
import { shortcutHint } from "../presentation/platform_presentation";
import type { ExposedOutputAddress } from "../presentation/stream_overview_presentation";

/** An icon from icons.ts at `sizePixels`, with an extra class when one is given. */
export function createIcon(iconSvg: string, sizePixels: 13 | 14 | 16 | 20 = 16, extraClass?: string): SVGElement {
  const icon = createSvgFromMarkup(iconSvg);
  icon.setAttribute("width", String(sizePixels));
  icon.setAttribute("height", String(sizePixels));
  if (extraClass) icon.classList.add(extraClass);
  return icon;
}

/** The red alert icon every failure wears. */
export function createFailureIcon(sizePixels: 14 | 16 | 20): SVGElement {
  return createIcon(ALERT_ICON_SVG, sizePixels, "failure-icon");
}

/** A key cap such as `⌘K` or `Ctrl K`. */
export function createShortcutCap(capText: string): HTMLElement {
  return createElement("kbd", { class: "shortcut-cap" }, [capText]);
}

/** The key cap for the window shortcut held with `key`, in the platform's own modifier. */
export function createWindowShortcutCap(platform: TatolabPlatform, key: string): HTMLElement {
  return createShortcutCap(shortcutHint(platform, key));
}

/** A small ring turning while something is in progress. */
export function createSpinner(): HTMLElement {
  return createElement("span", { class: "progress-spinner", "aria-hidden": "true" });
}

/** A line of failure under a row or a set of actions: the red alert icon, then the reason in text-2. */
export function createFailureLine(): { element: HTMLElement; show(failureText: string | null): void } {
  const failureText = createElement("span", { class: "failure-line-text selectable-text" });
  const element = createElement("p", { class: "failure-line", role: "alert", hidden: true }, [createFailureIcon(14), failureText]);
  return {
    element,
    show(text: string | null) {
      element.hidden = text === null;
      failureText.textContent = text ?? "";
    },
  };
}

/** The band's Search button, which opens Search: the magnifier, the word and the platform's key cap. */
export function createSearchButton(platform: TatolabPlatform, onOpenSearch: () => void): HTMLButtonElement {
  return createElement(
    "button",
    {
      type: "button",
      class: "band-search-button",
      "aria-label": "Search streams, outputs and views",
      "aria-keyshortcuts": platform === "macos" ? "Meta+K" : "Control+K",
      onClick: onOpenSearch,
    },
    [
      createIcon(SEARCH_ICON_SVG, 16),
      createElement("span", { class: "band-search-button-label" }, ["Search"]),
      createWindowShortcutCap(platform, "K"),
    ],
  );
}

/** One segment of a segmented control. */
export interface SegmentedControlSegment<SegmentKey extends string> {
  key: SegmentKey;
  label: string;
  title?: string;
}

/** A segmented control: a grey track of tabs, the selected one raised; switching is instant. */
export class SegmentedControlView<SegmentKey extends string> {
  readonly element: HTMLElement;
  private readonly segmentButtons = new Map<SegmentKey, HTMLButtonElement>();
  private readonly segmentCounts = new Map<SegmentKey, HTMLElement>();

  constructor(
    segments: readonly SegmentedControlSegment<SegmentKey>[],
    accessibleLabel: string,
    private readonly onSegmentChosen: (segmentKey: SegmentKey) => void,
    size: "regular" | "small" = "regular",
  ) {
    this.element = createElement("div", {
      class: size === "small" ? "segmented-control segmented-control-small" : "segmented-control",
      role: "tablist",
      "aria-label": accessibleLabel,
    });
    for (const segment of segments) {
      const countLabel = createElement("span", { class: "segmented-control-count", hidden: true });
      const children: ElementChild[] = [createElement("span", {}, [segment.label])];
      if (size === "small") children.push(countLabel);
      const button = createElement(
        "button",
        {
          type: "button",
          role: "tab",
          class: "segmented-control-segment",
          "aria-selected": "false",
          title: segment.title,
          "data-segment": segment.key,
          onClick: () => this.onSegmentChosen(segment.key),
        },
        children,
      );
      this.segmentButtons.set(segment.key, button);
      this.segmentCounts.set(segment.key, countLabel);
      this.element.append(button);
    }
  }

  showSelected(selectedKey: SegmentKey): void {
    for (const [segmentKey, button] of this.segmentButtons) {
      button.setAttribute("aria-selected", String(segmentKey === selectedKey));
      button.tabIndex = segmentKey === selectedKey ? 0 : -1;
    }
  }

  /** Shows `count` after a small segment's label, hidden at 0. */
  showCount(segmentKey: SegmentKey, count: number): void {
    const countLabel = this.segmentCounts.get(segmentKey);
    if (!countLabel) return;
    countLabel.hidden = count === 0;
    const countText = count.toLocaleString("en-US");
    if (countLabel.textContent !== countText) countLabel.textContent = countText;
  }
}

/** An exposed output's address in mono, its machine segment quiet, wrapping only after a slash. */
export function createExposedAddressLabel(address: ExposedOutputAddress, className: string): HTMLElement {
  const label = createElement("code", { class: `exposed-address selectable-text ${className}` });
  if (address.machineSegment !== null) {
    label.append(createElement("span", { class: "exposed-address-segment address-machine-segment" }, [address.machineSegment]), createElement("wbr"));
  }
  const streamPathSegments = address.streamPath.split("/");
  streamPathSegments.forEach((segment, segmentIndex) => {
    const isLast = segmentIndex === streamPathSegments.length - 1;
    label.append(createElement("span", { class: "exposed-address-segment" }, [isLast ? segment : `${segment}/`]));
    if (!isLast) label.append(createElement("wbr"));
  });
  return label;
}
