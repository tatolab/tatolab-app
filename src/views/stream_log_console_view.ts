import type { StreamLogRecord, TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged } from "../dom";
import { ARROW_DOWN_ICON_SVG, FOLLOW_ICON_SVG, SEARCH_ICON_SVG } from "../icons";
import {
  formatLogAttrValue,
  formatLogRecordDateTime,
  formatLogRecordTime,
  LOG_LEVEL_SEGMENTS,
  presentLogLevelWord,
  rankLogLevel,
} from "../presentation/log_record_presentation";
import { countLabel } from "../presentation/stream_presentation";
import type { StreamLogRecordsDestination } from "./stream_log_follower";
import { createFailureIcon, createIcon, createWindowShortcutCap, SegmentedControlView } from "./window_controls";

/** The console keeps the newest this many lines and drops older ones. */
const MOST_LOG_LINES_HELD = 2000;
/** Scrolled within this many pixels of the end, the console keeps following new lines. */
const FOLLOW_TAIL_DISTANCE_PIXELS = 16;
/** The filter field grows to this hint's width in the platform's own font. */
const LOG_TEXT_FILTER_PLACEHOLDER = "Filter by text or key=value";
/** The hint a narrow header shows instead of cutting the whole one off mid-word. */
const SHORT_LOG_TEXT_FILTER_PLACEHOLDER = "Text or key=value";

/** The whole filter hint while the input has room for it, else the short one. An input not laid out yet gets the whole. */
export function logTextFilterPlaceholderThatFits(inputWidthPixels: number, wholePlaceholderWidthPixels: number): string {
  return inputWidthPixels === 0 || inputWidthPixels + 1 >= wholePlaceholderWidthPixels
    ? LOG_TEXT_FILTER_PLACEHOLDER
    : SHORT_LOG_TEXT_FILTER_PLACEHOLDER;
}

type LogLevelSegmentLabel = "All" | "Warnings" | "Errors";

interface HeldLogLine {
  element: HTMLElement;
  isDivider: boolean;
  levelRank: number;
  lowercaseSearchableText: string;
}

function createLogLineElement(record: StreamLogRecord): HTMLElement {
  const levelName = record.level?.toLowerCase() ?? "";
  const sourceName = record.source?.toLowerCase() ?? "";
  const messageElement = createElement("span", { class: "log-line-message" }, [record.message]);
  for (const [attrKey, attrValue] of Object.entries(record.attrs)) {
    messageElement.append(
      " ",
      createElement("span", { class: "log-line-attr" }, [
        createElement("span", { class: "log-line-attr-key" }, [attrKey, "="]),
        createElement("span", { class: "log-line-attr-value" }, [formatLogAttrValue(attrValue)]),
      ]),
    );
  }
  return createElement("div", { class: "log-line", "data-source": sourceName }, [
    createElement("span", { class: "log-line-time", title: formatLogRecordDateTime(record.host_ts_ns) }, [
      formatLogRecordTime(record.host_ts_ns),
    ]),
    createElement("span", { class: "log-line-level", "data-tone": presentLogLevelWord(record.level) }, [levelName]),
    createElement("span", { class: "log-line-source", title: record.target ?? undefined }, [sourceName]),
    messageElement,
  ]);
}

function searchableTextOfRecord(record: StreamLogRecord): string {
  const attrsText = Object.entries(record.attrs)
    .map(([attrKey, attrValue]) => `${attrKey}=${attrValue}`)
    .join(" ");
  return `${record.message} ${attrsText} ${record.target ?? ""} ${record.source ?? ""}`.toLowerCase();
}

/** One stream's log records docked under its graph: newest at the bottom, followed until the reader scrolls up. */
export class StreamLogConsoleView implements StreamLogRecordsDestination {
  readonly element: HTMLElement;
  private readonly levelSegments: SegmentedControlView<LogLevelSegmentLabel>;
  private readonly followingLabel: HTMLElement;
  private readonly jumpToLatestButton: HTMLButtonElement;
  private readonly jumpToLatestLabel: HTMLElement;
  private readonly textFilterInput: HTMLInputElement;
  private readonly textFilterPlaceholderMeasure: HTMLElement;
  private readonly textFilterField: HTMLElement;
  private readonly textFilterResizeObserver: ResizeObserver;
  private readonly logScroller: HTMLElement;
  private readonly logLines: HTMLElement;
  private readonly consoleMessage: HTMLElement;
  private readonly readFailureNotice: HTMLElement;
  private readonly readFailureText: HTMLElement;
  private heldLines: HeldLogLine[] = [];
  private hasReadAPage = false;
  private isFollowingTail = true;
  private linesArrivedWhileNotFollowing = 0;
  private selectedSegmentLabel: LogLevelSegmentLabel = "All";
  private lowercaseTextFilter = "";

  constructor(streamName: string, platform: TatolabPlatform) {
    this.levelSegments = new SegmentedControlView<LogLevelSegmentLabel>(
      LOG_LEVEL_SEGMENTS.map((segment) => ({ key: segment.label as LogLevelSegmentLabel, label: segment.label })),
      "Levels shown",
      (segmentLabel) => this.showLevelSegment(segmentLabel),
      "small",
    );
    this.levelSegments.showSelected(this.selectedSegmentLabel);
    this.levelSegments.element.dataset.counts = "true";

    this.followingLabel = createElement("span", { class: "log-dock-following", hidden: true }, [
      createIcon(FOLLOW_ICON_SVG, 14),
      "Following",
    ]);
    this.jumpToLatestLabel = createElement("span", {});
    this.jumpToLatestButton = createElement(
      "button",
      { type: "button", class: "button button-plain button-small log-dock-jump", hidden: true, onClick: () => this.scrollToLatest() },
      [createIcon(ARROW_DOWN_ICON_SVG, 14), this.jumpToLatestLabel],
    );

    this.textFilterInput = createElement("input", {
      class: "filter-field-input",
      type: "text",
      size: "1",
      placeholder: LOG_TEXT_FILTER_PLACEHOLDER,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": `Filter ${streamName} logs`,
    });
    this.textFilterInput.addEventListener("input", () => {
      this.lowercaseTextFilter = this.textFilterInput.value.trim().toLowerCase();
      this.textFilterField.dataset.hasText = String(this.textFilterInput.value !== "");
      this.applyFilters();
    });
    this.textFilterInput.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      if (this.textFilterInput.value !== "") {
        this.textFilterInput.value = "";
        this.lowercaseTextFilter = "";
        this.textFilterField.dataset.hasText = "false";
        this.applyFilters();
      } else {
        this.textFilterInput.blur();
      }
    });
    this.textFilterPlaceholderMeasure = createElement("span", { class: "log-dock-filter-placeholder-measure", "aria-hidden": "true" }, [
      LOG_TEXT_FILTER_PLACEHOLDER,
    ]);
    this.textFilterField = createElement("label", { class: "filter-field log-dock-filter", "data-has-text": "false" }, [
      createIcon(SEARCH_ICON_SVG, 14),
      createElement("span", { class: "log-dock-filter-input-sizer" }, [this.textFilterPlaceholderMeasure, this.textFilterInput]),
      createWindowShortcutCap(platform, "F"),
    ]);
    this.textFilterResizeObserver = new ResizeObserver(() => {
      const placeholder = logTextFilterPlaceholderThatFits(this.textFilterInput.clientWidth, this.textFilterPlaceholderMeasure.scrollWidth);
      if (this.textFilterInput.placeholder !== placeholder) this.textFilterInput.placeholder = placeholder;
    });
    this.textFilterResizeObserver.observe(this.textFilterInput);

    this.logLines = createElement("div", { class: "log-lines" });
    this.consoleMessage = createElement("p", { class: "log-dock-message" }, ["Reading logs…"]);
    this.readFailureText = createElement("span", {});
    this.readFailureNotice = createElement("p", { class: "log-dock-read-failure", role: "status", hidden: true }, [
      createFailureIcon(14),
      this.readFailureText,
    ]);
    this.logScroller = createElement(
      "div",
      { class: "log-dock-list selectable-text", role: "log", tabindex: "0", "aria-label": "Log lines, newest last" },
      [this.readFailureNotice, this.logLines, this.consoleMessage],
    );
    this.logScroller.addEventListener("scroll", () => this.onLogScrolled());
    this.logScroller.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "End") return;
      keyboardEvent.preventDefault();
      this.scrollToLatest();
    });

    this.element = createElement("section", { class: "log-dock-console", "aria-label": `${streamName} logs` }, [
      createElement("header", { class: "log-dock-header" }, [
        createElement("h2", { class: "log-dock-title" }, ["Logs"]),
        this.levelSegments.element,
        createElement("span", { class: "log-dock-spacer" }),
        this.followingLabel,
        this.jumpToLatestButton,
        this.textFilterField,
      ]),
      this.logScroller,
    ]);
    this.updateCountsAndMessages();
  }

  appendRecords(records: StreamLogRecord[]): void {
    this.hasReadAPage = true;
    const arrivedLines = records.map((record) => this.holdLine(createLogLineElement(record), false, record));
    this.appendHeldLines(arrivedLines);
  }

  /** A centred note between records, such as records the runtime no longer holds. */
  appendDivider(dividerText: string): void {
    const dividerElement = createElement("div", { class: "log-divider", role: "separator" }, [createElement("span", {}, [dividerText])]);
    this.appendHeldLines([this.holdLine(dividerElement, true, null)]);
  }

  clear(): void {
    this.heldLines = [];
    this.logLines.replaceChildren();
    this.linesArrivedWhileNotFollowing = 0;
    this.isFollowingTail = true;
    this.updateFollowState();
    this.updateCountsAndMessages();
  }

  /** Shows why the last read failed, or clears it with `null`. */
  showReadFailure(failureText: string | null): void {
    this.readFailureNotice.hidden = failureText === null;
    if (failureText !== null) setTextIfChanged(this.readFailureText, `Couldn't read new lines: ${failureText}. Trying again.`);
  }

  focusTextFilter(): void {
    this.textFilterInput.focus();
    this.textFilterInput.select();
  }

  /** Shows only the error lines, as an errored node's foot asks. */
  showErrorLinesOnly(): void {
    this.showLevelSegment("Errors");
  }

  /** Stops watching the filter field's width. */
  dispose(): void {
    this.textFilterResizeObserver.disconnect();
  }

  /** In the Logs tab the band already says Logs, so the header drops its title and the filter widens. */
  setShownInLogsTab(isShownInLogsTab: boolean): void {
    this.element.dataset.inLogsTab = String(isShownInLogsTab);
    if (this.isFollowingTail) this.scrollToLatest();
  }

  private showLevelSegment(segmentLabel: LogLevelSegmentLabel): void {
    this.selectedSegmentLabel = segmentLabel;
    this.levelSegments.showSelected(segmentLabel);
    this.applyFilters();
  }

  private minimumLevelRank(): number {
    return LOG_LEVEL_SEGMENTS.find((segment) => segment.label === this.selectedSegmentLabel)?.minimumRank ?? 0;
  }

  private holdLine(element: HTMLElement, isDivider: boolean, record: StreamLogRecord | null): HeldLogLine {
    return {
      element,
      isDivider,
      levelRank: record === null ? Number.POSITIVE_INFINITY : rankLogLevel(record.level),
      lowercaseSearchableText: record === null ? "" : searchableTextOfRecord(record),
    };
  }

  private appendHeldLines(arrivedLines: HeldLogLine[]): void {
    const arrivedFragment = document.createDocumentFragment();
    let arrivedLinesShown = 0;
    for (const arrivedLine of arrivedLines) {
      arrivedLine.element.hidden = !this.lineMatchesFilters(arrivedLine);
      if (!arrivedLine.element.hidden && !arrivedLine.isDivider) arrivedLinesShown += 1;
      this.heldLines.push(arrivedLine);
      arrivedFragment.append(arrivedLine.element);
    }
    this.logLines.append(arrivedFragment);
    this.dropLinesBeyondTheNewest();
    if (this.isFollowingTail) {
      this.scrollToLatest();
    } else {
      this.linesArrivedWhileNotFollowing += arrivedLinesShown;
      this.updateFollowState();
    }
    this.updateCountsAndMessages();
  }

  private dropLinesBeyondTheNewest(): void {
    const excessLineCount = this.heldLines.length - MOST_LOG_LINES_HELD;
    if (excessLineCount <= 0) return;
    const scrollHeightBeforeDropping = this.logScroller.scrollHeight;
    for (const droppedLine of this.heldLines.splice(0, excessLineCount)) droppedLine.element.remove();
    if (!this.isFollowingTail) {
      this.logScroller.scrollTop -= scrollHeightBeforeDropping - this.logScroller.scrollHeight;
    }
  }

  private lineMatchesFilters(heldLine: HeldLogLine): boolean {
    if (heldLine.isDivider) return this.lowercaseTextFilter === "";
    return (
      heldLine.levelRank >= this.minimumLevelRank() &&
      (this.lowercaseTextFilter === "" || heldLine.lowercaseSearchableText.includes(this.lowercaseTextFilter))
    );
  }

  private applyFilters(): void {
    for (const heldLine of this.heldLines) heldLine.element.hidden = !this.lineMatchesFilters(heldLine);
    this.linesArrivedWhileNotFollowing = 0;
    this.scrollToLatest();
    this.updateCountsAndMessages();
  }

  private onLogScrolled(): void {
    const distanceFromEnd = this.logScroller.scrollHeight - this.logScroller.scrollTop - this.logScroller.clientHeight;
    const isAtEnd = distanceFromEnd <= FOLLOW_TAIL_DISTANCE_PIXELS;
    if (isAtEnd === this.isFollowingTail) return;
    this.isFollowingTail = isAtEnd;
    if (isAtEnd) this.linesArrivedWhileNotFollowing = 0;
    this.updateFollowState();
  }

  private scrollToLatest(): void {
    this.logScroller.scrollTop = this.logScroller.scrollHeight;
    this.isFollowingTail = true;
    this.linesArrivedWhileNotFollowing = 0;
    this.updateFollowState();
  }

  /** `Following` while at the end; scrolled up, a button that jumps back, counting what arrived since. */
  private updateFollowState(): void {
    this.followingLabel.hidden = !this.hasReadAPage || !this.isFollowingTail;
    this.jumpToLatestButton.hidden = this.isFollowingTail;
    setTextIfChanged(
      this.jumpToLatestLabel,
      this.linesArrivedWhileNotFollowing > 0
        ? countLabel(this.linesArrivedWhileNotFollowing, "new line", "new lines")
        : "Jump to latest",
    );
  }

  private updateCountsAndMessages(): void {
    let recordLineCount = 0;
    let shownRecordLineCount = 0;
    const heldCountByRank = new Map<number, number>();
    for (const heldLine of this.heldLines) {
      if (heldLine.isDivider) continue;
      recordLineCount += 1;
      heldCountByRank.set(heldLine.levelRank, (heldCountByRank.get(heldLine.levelRank) ?? 0) + 1);
      if (!heldLine.element.hidden) shownRecordLineCount += 1;
    }
    for (const segment of LOG_LEVEL_SEGMENTS) {
      if (segment.countedRank !== null) {
        this.levelSegments.showCount(segment.label as LogLevelSegmentLabel, heldCountByRank.get(segment.countedRank) ?? 0);
      }
    }
    let messageText: string | null = null;
    if (!this.hasReadAPage) messageText = "Reading logs…";
    else if (recordLineCount === 0) messageText = "No log records yet. New ones show up here as the stream writes them.";
    else if (shownRecordLineCount === 0) {
      messageText =
        this.lowercaseTextFilter !== ""
          ? `No lines match “${this.textFilterInput.value.trim()}”.`
          : this.selectedSegmentLabel === "Errors"
            ? "No errors in the lines held."
            : "No warnings or errors in the lines held.";
    }
    this.consoleMessage.hidden = messageText === null;
    if (messageText !== null) setTextIfChanged(this.consoleMessage, messageText);
    this.updateFollowState();
  }
}
