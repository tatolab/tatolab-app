import type { ListedStream } from "../backend/tatolab_backend_contract";
import { createElement, setTextIfChanged } from "../dom";
import { abbreviateHomeDirectory, countLabel, presentStreamState } from "../presentation/stream_presentation";

const ARRIVING_ROW_HIGHLIGHT_MILLISECONDS = 1800;
const LEAVING_ROW_MILLISECONDS = 260;

interface StreamListRow {
  item: HTMLLIElement;
  button: HTMLButtonElement;
  stateDot: HTMLElement;
  nameLabel: HTMLElement;
  stateChip: HTMLElement;
  projectPath: HTMLElement;
  nodeCountLabel: HTMLElement;
  failureReason: HTMLElement;
}

/** Every stream the runtime lists, one row each; new rows arrive highlighted and removed rows fold away. */
export class StreamListView {
  readonly element: HTMLElement;
  private readonly listElement: HTMLUListElement;
  private readonly rowsByStreamName = new Map<string, StreamListRow>();
  private shownStreamNames: string[] = [];
  private hasShownStreams = false;

  constructor(private readonly onStreamChosen: (streamName: string) => void) {
    this.listElement = createElement("ul", { class: "stream-list", "aria-label": "Streams" });
    this.listElement.addEventListener("keydown", (keyboardEvent) => this.onListKeyDown(keyboardEvent));
    this.element = createElement("div", { class: "stream-list-pane" }, [this.listElement]);
  }

  showStreams(streams: ListedStream[], selectedStreamName: string | null): void {
    const listedNames = new Set(streams.map((stream) => stream.name));
    for (const [streamName, row] of this.rowsByStreamName) {
      if (listedNames.has(streamName)) continue;
      this.rowsByStreamName.delete(streamName);
      this.foldAwayRow(row);
    }

    let insertionAnchor: ChildNode | null = this.listElement.firstChild;
    for (const stream of streams) {
      let row = this.rowsByStreamName.get(stream.name);
      if (!row) {
        row = this.createRow(stream.name);
        this.rowsByStreamName.set(stream.name, row);
        if (this.hasShownStreams) this.highlightArrivingRow(row);
      }
      this.fillRow(row, stream, stream.name === selectedStreamName);
      while (insertionAnchor instanceof HTMLElement && insertionAnchor.dataset.leaving === "true") {
        insertionAnchor = insertionAnchor.nextSibling;
      }
      if (insertionAnchor === row.item) {
        insertionAnchor = insertionAnchor.nextSibling;
      } else {
        this.listElement.insertBefore(row.item, insertionAnchor);
      }
    }
    this.shownStreamNames = streams.map((stream) => stream.name);
    this.hasShownStreams = true;
  }

  private createRow(streamName: string): StreamListRow {
    const stateDot = createElement("span", { class: "status-dot", "aria-hidden": "true" });
    const nameLabel = createElement("span", { class: "stream-list-row-name" });
    const stateChip = createElement("span", { class: "state-chip" });
    const projectPath = createElement("span", { class: "stream-list-row-project" });
    const nodeCountLabel = createElement("span", { class: "stream-list-row-node-count" });
    const failureReason = createElement("span", { class: "stream-list-row-failure" });
    const button = createElement(
      "button",
      { type: "button", class: "stream-list-row", onClick: () => this.onStreamChosen(streamName) },
      [stateDot, nameLabel, stateChip, projectPath, nodeCountLabel, failureReason],
    );
    const item = createElement("li", { class: "stream-list-item" }, [button]);
    return { item, button, stateDot, nameLabel, stateChip, projectPath, nodeCountLabel, failureReason };
  }

  private fillRow(row: StreamListRow, stream: ListedStream, isSelected: boolean): void {
    const statePresentation = presentStreamState(stream);
    row.button.dataset.state = stream.state;
    row.button.classList.toggle("stream-list-row-selected", isSelected);
    row.button.setAttribute("aria-current", isSelected ? "true" : "false");
    row.stateDot.dataset.tone = statePresentation.dotTone;
    setTextIfChanged(row.nameLabel, stream.name);
    setTextIfChanged(row.stateChip, statePresentation.label);
    row.stateChip.dataset.tone = statePresentation.chipTone;
    setTextIfChanged(row.projectPath, abbreviateHomeDirectory(stream.project_directory));
    row.projectPath.title = stream.project_directory;
    setTextIfChanged(row.nodeCountLabel, stream.node_count === null ? "" : countLabel(stream.node_count, "node", "nodes"));
    const failureText = stream.state === "failed" ? (stream.failed_because ?? "") : "";
    setTextIfChanged(row.failureReason, failureText);
    row.failureReason.hidden = failureText === "";
    row.failureReason.title = failureText;
  }

  private highlightArrivingRow(row: StreamListRow): void {
    row.item.dataset.arriving = "true";
    window.setTimeout(() => delete row.item.dataset.arriving, ARRIVING_ROW_HIGHLIGHT_MILLISECONDS);
  }

  private foldAwayRow(row: StreamListRow): void {
    row.item.dataset.leaving = "true";
    row.button.disabled = true;
    row.button.classList.remove("stream-list-row-selected");
    row.item.style.height = `${row.item.offsetHeight}px`;
    // Reading the height commits it, so setting 0 next transitions from it.
    void row.item.offsetHeight;
    row.item.style.height = "0px";
    window.setTimeout(() => row.item.remove(), LEAVING_ROW_MILLISECONDS);
  }

  private onListKeyDown(keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key !== "ArrowDown" && keyboardEvent.key !== "ArrowUp") return;
    if (this.shownStreamNames.length === 0) return;
    keyboardEvent.preventDefault();
    const focusedIndex = this.shownStreamNames.findIndex(
      (streamName) => this.rowsByStreamName.get(streamName)?.button === document.activeElement,
    );
    const step = keyboardEvent.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.min(this.shownStreamNames.length - 1, Math.max(0, focusedIndex + step));
    const nextStreamName = this.shownStreamNames[nextIndex];
    this.rowsByStreamName.get(nextStreamName)?.button.focus();
    this.onStreamChosen(nextStreamName);
  }
}
