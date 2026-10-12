import type { StreamLogRecord } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged } from "../dom";
import { ARROW_DOWN_ICON_SVG, CHEVRON_UP_DOWN_ICON_SVG, SEARCH_ICON_SVG } from "../icons";
import {
  formatLogAttrValue,
  formatLogRecordDateTime,
  formatLogRecordTime,
  LOG_LEVEL_FILTER_CHOICES,
  rankLogLevel,
} from "../presentation/log_record_presentation";
import { countLabel } from "../presentation/stream_presentation";
import type { StreamLogRecordsDestination } from "./stream_log_follower";

/** The console keeps the newest this many lines and drops older ones. */
const MOST_LOG_LINES_HELD = 2000;
/** Scrolled within this many pixels of the end, the console keeps following new lines. */
const FOLLOW_TAIL_DISTANCE_PIXELS = 16;

interface HeldLogLine {
  element: HTMLElement;
  isDivider: boolean;
  levelRank: number;
  lowercaseSearchableText: string;
}

function createLogLineElement(record: StreamLogRecord): HTMLElement {
  const levelName = record.level?.toLowerCase() ?? "";
  const sourceName = record.source?.toLowerCase() ?? "";
  const messageElement = createElement("span", { class: "stream-log-line-message" }, [record.message]);
  for (const [attrKey, attrValue] of Object.entries(record.attrs)) {
    messageElement.append(
      " ",
      createElement("span", { class: "stream-log-line-attr" }, [
        createElement("span", { class: "stream-log-line-attr-key" }, [attrKey, "="]),
        formatLogAttrValue(attrValue),
      ]),
    );
  }
  return createElement("div", { class: "stream-log-line", "data-level": levelName, "data-source": sourceName }, [
    createElement("span", { class: "stream-log-line-time", title: formatLogRecordDateTime(record.host_ts_ns) }, [
      formatLogRecordTime(record.host_ts_ns),
    ]),
    createElement("span", { class: "stream-log-line-level" }, [levelName]),
    createElement("span", { class: "stream-log-line-source", title: record.target ?? undefined }, [sourceName]),
    messageElement,
  ]);
}

function searchableTextOfRecord(record: StreamLogRecord): string {
  const attrsText = Object.entries(record.attrs)
    .map(([attrKey, attrValue]) => `${attrKey}=${attrValue}`)
    .join(" ");
  return `${record.message} ${attrsText} ${record.target ?? ""} ${record.source ?? ""}`.toLowerCase();
}

/** One stream's log records as a console: newest at the bottom, followed until the reader scrolls up. */
export class StreamLogConsoleView implements StreamLogRecordsDestination {
  readonly element: HTMLElement;
  private readonly lineCountLabel: HTMLElement;
  private readonly liveIndicator: HTMLElement;
  private readonly levelFilterSelect: HTMLSelectElement;
  private readonly textFilterInput: HTMLInputElement;
  private readonly logScroller: HTMLElement;
  private readonly logLines: HTMLElement;
  private readonly consoleMessage: HTMLElement;
  private readonly jumpToLatestButton: HTMLButtonElement;
  private readonly readFailureNotice: HTMLElement;
  private heldLines: HeldLogLine[] = [];
  private hasReadAPage = false;
  private isFollowingTail = true;
  private linesArrivedWhileNotFollowing = 0;
  private minimumLevelRank = LOG_LEVEL_FILTER_CHOICES[0].minimumRank;
  private lowercaseTextFilter = "";

  constructor(streamName: string) {
    this.lineCountLabel = createElement("span", { class: "stream-log-line-count" });
    this.liveIndicator = createElement("span", { class: "stream-log-live-indicator", hidden: true }, [
      createElement("span", { class: "status-dot status-dot-live", "data-tone": "ok", "aria-hidden": "true" }),
      createElement("span", { class: "stream-log-live-indicator-label" }, ["Live"]),
    ]);

    this.levelFilterSelect = createElement(
      "select",
      { class: "stream-log-level-filter-select", "aria-label": "Lowest level shown" },
      LOG_LEVEL_FILTER_CHOICES.map((choice) =>
        createElement("option", { value: String(choice.minimumRank) }, [choice.label]),
      ),
    );
    this.levelFilterSelect.addEventListener("change", () => {
      this.minimumLevelRank = Number(this.levelFilterSelect.value);
      this.applyFilters();
    });

    this.textFilterInput = createElement("input", {
      class: "stream-log-text-filter-input",
      type: "search",
      placeholder: "Filter",
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": `Filter ${streamName} logs`,
    });
    this.textFilterInput.addEventListener("input", () => {
      this.lowercaseTextFilter = this.textFilterInput.value.trim().toLowerCase();
      this.applyFilters();
    });
    this.textFilterInput.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      this.textFilterInput.value = "";
      this.lowercaseTextFilter = "";
      this.applyFilters();
      this.textFilterInput.blur();
    });

    this.logLines = createElement("div", { class: "stream-log-lines selectable-text" });
    this.consoleMessage = createElement("p", { class: "stream-log-console-message" }, ["Reading logs…"]);
    this.logScroller = createElement(
      "div",
      { class: "stream-log-scroller", role: "log", tabindex: "0", "aria-label": "Log lines, newest last" },
      [this.logLines, this.consoleMessage],
    );
    this.logScroller.addEventListener("scroll", () => this.onLogScrolled());

    this.jumpToLatestButton = createElement(
      "button",
      { type: "button", class: "stream-log-jump-to-latest", hidden: true, onClick: () => this.scrollToLatest() },
      [createSvgFromMarkup(ARROW_DOWN_ICON_SVG), createElement("span", {}, ["Jump to latest"])],
    );
    this.readFailureNotice = createElement("p", { class: "stream-log-read-failure", role: "status", hidden: true });

    this.element = createElement("section", { class: "stream-log-console", "aria-label": `${streamName} logs` }, [
      createElement("div", { class: "stream-log-toolbar" }, [
        createElement("h3", { class: "stream-log-title" }, ["Logs"]),
        this.lineCountLabel,
        this.liveIndicator,
        createElement("span", { class: "stream-log-toolbar-spacer" }),
        createElement("label", { class: "stream-log-level-filter" }, [
          this.levelFilterSelect,
          createSvgFromMarkup(CHEVRON_UP_DOWN_ICON_SVG),
        ]),
        createElement("label", { class: "stream-log-text-filter" }, [
          createSvgFromMarkup(SEARCH_ICON_SVG),
          this.textFilterInput,
        ]),
      ]),
      createElement("div", { class: "stream-log-body" }, [
        this.logScroller,
        this.jumpToLatestButton,
        this.readFailureNotice,
      ]),
    ]);
    this.updateCountsAndMessages();
  }

  appendRecords(records: StreamLogRecord[]): void {
    this.hasReadAPage = true;
    const arrivedLines = records.map((record) => this.holdLine(createLogLineElement(record), false, record));
    this.appendHeldLines(arrivedLines);
  }

  /** A full-width note between records, such as records the runtime no longer holds. */
  appendDivider(dividerText: string): void {
    const dividerElement = createElement("div", { class: "stream-log-divider", role: "separator" }, [
      createElement("span", {}, [dividerText]),
    ]);
    this.appendHeldLines([this.holdLine(dividerElement, true, null)]);
  }

  clear(): void {
    this.heldLines = [];
    this.logLines.replaceChildren();
    this.linesArrivedWhileNotFollowing = 0;
    this.isFollowingTail = true;
    this.updateJumpToLatestButton();
    this.updateCountsAndMessages();
  }

  /** Shows why the last read failed, or clears it with `null`. */
  showReadFailure(failureText: string | null): void {
    this.readFailureNotice.hidden = failureText === null;
    if (failureText !== null) {
      setTextIfChanged(this.readFailureNotice, `Couldn't read new records: ${failureText}. Trying again every second.`);
    }
    this.updateLiveIndicator();
  }

  focusTextFilter(): void {
    this.textFilterInput.focus();
    this.textFilterInput.select();
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
      this.updateJumpToLatestButton();
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
      heldLine.levelRank >= this.minimumLevelRank &&
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
    const distanceFromEnd =
      this.logScroller.scrollHeight - this.logScroller.scrollTop - this.logScroller.clientHeight;
    const isAtEnd = distanceFromEnd <= FOLLOW_TAIL_DISTANCE_PIXELS;
    if (isAtEnd === this.isFollowingTail) return;
    this.isFollowingTail = isAtEnd;
    if (isAtEnd) this.linesArrivedWhileNotFollowing = 0;
    this.updateJumpToLatestButton();
  }

  private scrollToLatest(): void {
    this.logScroller.scrollTop = this.logScroller.scrollHeight;
    this.isFollowingTail = true;
    this.linesArrivedWhileNotFollowing = 0;
    this.updateJumpToLatestButton();
  }

  private updateJumpToLatestButton(): void {
    this.jumpToLatestButton.hidden = this.isFollowingTail;
    const buttonLabel =
      this.linesArrivedWhileNotFollowing > 0
        ? countLabel(this.linesArrivedWhileNotFollowing, "new line", "new lines")
        : "Jump to latest";
    setTextIfChanged(this.jumpToLatestButton.lastElementChild as HTMLElement, buttonLabel);
  }

  private updateCountsAndMessages(): void {
    let recordLineCount = 0;
    let shownRecordLineCount = 0;
    for (const heldLine of this.heldLines) {
      if (heldLine.isDivider) continue;
      recordLineCount += 1;
      if (!heldLine.element.hidden) shownRecordLineCount += 1;
    }
    const isFiltering = this.lowercaseTextFilter !== "" || this.minimumLevelRank > LOG_LEVEL_FILTER_CHOICES[0].minimumRank;
    setTextIfChanged(
      this.lineCountLabel,
      !this.hasReadAPage
        ? ""
        : isFiltering
          ? `${shownRecordLineCount.toLocaleString("en-US")} of ${countLabel(recordLineCount, "line", "lines")}`
          : countLabel(recordLineCount, "line", "lines"),
    );
    let messageText: string | null = null;
    if (!this.hasReadAPage) messageText = "Reading logs…";
    else if (recordLineCount === 0) messageText = "No log records yet. New ones appear here as the stream writes them.";
    else if (shownRecordLineCount === 0) messageText = "No lines match the filter.";
    this.consoleMessage.hidden = messageText === null;
    if (messageText !== null) setTextIfChanged(this.consoleMessage, messageText);
    this.updateLiveIndicator();
  }

  /** Live once a page has been read and while reads succeed. */
  private updateLiveIndicator(): void {
    this.liveIndicator.hidden = !this.hasReadAPage || !this.readFailureNotice.hidden;
  }
}
