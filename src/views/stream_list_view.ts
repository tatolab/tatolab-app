// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged } from "../dom";
import { presentStreamState } from "../presentation/stream_presentation";
import { createFailureIcon } from "./window_controls";

/** What the Streams section shows instead of rows. */
export type StreamListPlaceholder = "no_streams" | "runtime_not_running" | "streams_not_listed";

interface StreamListRow {
  item: HTMLLIElement;
  button: HTMLButtonElement;
  nameLabel: HTMLElement;
  stateWord: HTMLElement;
  stateLabel: HTMLElement;
  failureIcon: SVGElement;
  failureReason: HTMLElement;
}

const PLACEHOLDER_TEXT: Record<Exclude<StreamListPlaceholder, "no_streams">, string> = {
  runtime_not_running: "Your streams show up here while Tatolab runs.",
  streams_not_listed: "Couldn't list the streams. Asking again…",
};

/** The sidebar's Streams section: a head with the count, a row per stream, or what stands in for them. */
export class StreamListView {
  readonly element: HTMLElement;
  private readonly countLabel: HTMLElement;
  private readonly listElement: HTMLUListElement;
  private readonly ghostRow: HTMLElement;
  private readonly placeholderText: HTMLElement;
  private readonly rowsByStreamName = new Map<string, StreamListRow>();
  private shownStreamNames: string[] = [];
  private selectedStreamName: string | null = null;

  constructor(private readonly onStreamChosen: (streamName: string) => void) {
    this.countLabel = createElement("span", { class: "sidebar-section-count", hidden: true });
    this.listElement = createElement("ul", { class: "stream-list", role: "list", "aria-label": "Streams" });
    this.listElement.addEventListener("keydown", (keyboardEvent) => this.onListKeyDown(keyboardEvent));
    this.ghostRow = createElement("div", { class: "stream-list-ghost-row", "aria-hidden": "true", hidden: true }, [
      createElement("span", { class: "stream-list-row-name" }, ["my-stream"]),
      createElement("span", { class: "stream-list-row-state" }, ["Kept"]),
    ]);
    this.placeholderText = createElement("p", { class: "sidebar-section-placeholder", hidden: true });
    this.element = createElement("section", { class: "sidebar-section", "aria-label": "Streams" }, [
      createElement("h2", { class: "sidebar-section-head" }, [createElement("span", {}, ["Streams"]), this.countLabel]),
      this.listElement,
      createElement("div", { class: "stream-list-placeholder" }, [this.ghostRow, this.placeholderText]),
    ]);
  }

  /** Shows a row per stream; `selectedStreamName` is `null` while another page is shown. */
  showStreams(streams: ListedStream[], selectedStreamName: string | null): void {
    this.selectedStreamName = selectedStreamName;
    this.ghostRow.hidden = true;
    this.placeholderText.hidden = streams.length > 0;
    if (streams.length === 0) this.showPlaceholderText("no_streams");
    this.countLabel.hidden = streams.length === 0;
    setTextIfChanged(this.countLabel, String(streams.length));

    const listedNames = new Set(streams.map((stream) => stream.name));
    for (const [streamName, row] of this.rowsByStreamName) {
      if (listedNames.has(streamName)) continue;
      this.rowsByStreamName.delete(streamName);
      row.item.remove();
    }
    let insertionAnchor: ChildNode | null = this.listElement.firstChild;
    for (const stream of streams) {
      let row = this.rowsByStreamName.get(stream.name);
      if (!row) {
        row = this.createRow(stream.name);
        this.rowsByStreamName.set(stream.name, row);
      }
      this.fillRow(row, stream);
      if (insertionAnchor === row.item) {
        insertionAnchor = insertionAnchor.nextSibling;
      } else {
        this.listElement.insertBefore(row.item, insertionAnchor);
      }
    }
    this.shownStreamNames = streams.map((stream) => stream.name);
    this.updateRovingFocusTarget();
  }

  /** Clears the rows and shows what stands in for them. */
  showPlaceholder(placeholder: StreamListPlaceholder): void {
    for (const row of this.rowsByStreamName.values()) row.item.remove();
    this.rowsByStreamName.clear();
    this.shownStreamNames = [];
    this.countLabel.hidden = true;
    this.placeholderText.hidden = false;
    this.showPlaceholderText(placeholder);
  }

  private showPlaceholderText(placeholder: StreamListPlaceholder): void {
    this.ghostRow.hidden = placeholder !== "no_streams";
    setTextIfChanged(
      this.placeholderText,
      placeholder === "no_streams" ? "Your first stream shows up here." : PLACEHOLDER_TEXT[placeholder],
    );
  }

  private createRow(streamName: string): StreamListRow {
    const nameLabel = createElement("span", { class: "stream-list-row-name" });
    const failureIcon = createFailureIcon(14);
    const stateLabel = createElement("span", {});
    const stateWord = createElement("span", { class: "stream-list-row-state" }, [failureIcon, stateLabel]);
    const failureReason = createElement("span", { class: "stream-list-row-failure" });
    const button = createElement(
      "button",
      { type: "button", class: "stream-list-row", "data-stream-name": streamName, onClick: () => this.onStreamChosen(streamName) },
      [createElement("span", { class: "stream-list-row-line" }, [nameLabel, stateWord]), failureReason],
    );
    const item = createElement("li", { class: "stream-list-item" }, [button]);
    return { item, button, nameLabel, stateWord, stateLabel, failureIcon, failureReason };
  }

  private fillRow(row: StreamListRow, stream: ListedStream): void {
    const statePresentation = presentStreamState(stream);
    const isSelected = stream.name === this.selectedStreamName;
    row.button.dataset.emphasis = statePresentation.emphasis;
    if (isSelected) row.button.setAttribute("aria-current", "true");
    else row.button.removeAttribute("aria-current");
    setTextIfChanged(row.nameLabel, stream.name);
    setTextIfChanged(row.stateLabel, statePresentation.label);
    row.stateWord.title = statePresentation.meaning;
    row.failureIcon.toggleAttribute("hidden", statePresentation.emphasis !== "failure");
    const failureText = statePresentation.emphasis === "failure" ? (stream.failed_because ?? "") : "";
    setTextIfChanged(row.failureReason, failureText);
    row.failureReason.hidden = failureText === "";
    row.button.title = statePresentation.emphasis === "failure" ? statePresentation.meaning : "";
  }

  /** One row takes Tab: the selected one, else the first. */
  private updateRovingFocusTarget(): void {
    const focusTargetName = this.shownStreamNames.includes(this.selectedStreamName ?? "")
      ? this.selectedStreamName
      : (this.shownStreamNames[0] ?? null);
    for (const [streamName, row] of this.rowsByStreamName) row.button.tabIndex = streamName === focusTargetName ? 0 : -1;
  }

  private onListKeyDown(keyboardEvent: KeyboardEvent): void {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(keyboardEvent.key)) return;
    if (this.shownStreamNames.length === 0 || keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey) return;
    keyboardEvent.preventDefault();
    const focusedIndex = this.shownStreamNames.findIndex(
      (streamName) => this.rowsByStreamName.get(streamName)?.button === document.activeElement,
    );
    const lastIndex = this.shownStreamNames.length - 1;
    const nextIndex =
      keyboardEvent.key === "Home"
        ? 0
        : keyboardEvent.key === "End"
          ? lastIndex
          : Math.min(lastIndex, Math.max(0, focusedIndex + (keyboardEvent.key === "ArrowDown" ? 1 : -1)));
    const nextStreamName = this.shownStreamNames[nextIndex];
    this.onStreamChosen(nextStreamName);
    this.rowsByStreamName.get(nextStreamName)?.button.focus();
  }

  /** Moves focus to the selected row, as ↑ and ↓ would. */
  focusSelectedRow(): void {
    if (this.selectedStreamName === null) return;
    this.rowsByStreamName.get(this.selectedStreamName)?.button.focus();
  }
}
