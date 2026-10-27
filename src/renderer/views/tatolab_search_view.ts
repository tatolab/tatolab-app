import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, StreamGraphExposedPort, TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { writeTextToClipboard } from "../clipboard";
import { createElement, type ElementChild } from "../dom";
import type { TatolabFrontendFeatureFlags } from "../feature_flags";
import {
  EYE_ICON_SVG,
  GEAR_ICON_SVG,
  GRAPH_ICON_SVG,
  LOGS_ICON_SVG,
  OVERVIEW_ICON_SVG,
  SEARCH_ICON_SVG,
  STREAM_ICON_SVG,
  TERMINAL_ICON_SVG,
} from "../icons";
import { holdsWindowShortcutModifier } from "../presentation/platform_presentation";
import { exposedOutputAddress, readableExposedPorts } from "../presentation/stream_overview_presentation";
import { abbreviateHomeDirectory, presentStreamState, streamNotLoadedReason } from "../presentation/stream_presentation";
import type { StreamPageTab } from "./stream_page_path";
import type { GraphOutputPortAddress } from "./stream_page_path";
import { createExposedAddressLabel, createFailureIcon, createIcon, createShortcutCap, createWindowShortcutCap } from "./window_controls";

/** What Search reads to list its rows: the streams, the selected one, and the selected one's graph already read. */
export interface TatolabSearchSources {
  listedStreams(): ListedStream[];
  selectedStream(): ListedStream | null;
  machineName(): string | null;
  exposedPortsAlreadyRead(streamName: string): StreamGraphExposedPort[] | null;
}

/** Where Search takes the window; it runs no other action. */
export interface TatolabSearchActions {
  selectStream(streamName: string): void;
  showExposedOutputInOverview(streamName: string, outputPort: GraphOutputPortAddress): void;
  /** Opens Graph with `outputPort` pinned in a floating preview. */
  watchOutput(streamName: string, outputPort: GraphOutputPortAddress): void;
  goToStreamTab(tab: StreamPageTab): void;
  goToSettings(): void;
}

interface SearchRow {
  groupLabel: string;
  iconSvg: string;
  /** What the query is matched against. */
  matchText: string;
  label: ElementChild[];
  meta: ElementChild[];
  metaIsFailure?: boolean;
  run(): void;
}

const ALWAYS_SHOWN_GROUPS = new Set(["Streams", "Go to"]);
/** How long Search takes to leave, matching search.css. */
const SEARCH_CLOSING_MILLISECONDS = 100;

/** Search (⌘K): find a stream, an exposed output or a view and go there. Navigation only. */
export class TatolabSearchView {
  readonly element: HTMLDialogElement;
  private readonly queryInput: HTMLInputElement;
  private readonly resultsList: HTMLElement;
  private shownRows: SearchRow[] = [];
  private selectedRowIndex = 0;
  private elementFocusedBeforeOpening: Element | null = null;
  private exposedPortsByStream = new Map<string, StreamGraphExposedPort[]>();
  private openCount = 0;
  private closingTimer: number | undefined;

  constructor(
    private readonly backend: Pick<TatolabBackend, "describeStreamGraph">,
    private readonly platform: TatolabPlatform,
    private readonly featureFlags: TatolabFrontendFeatureFlags,
    private readonly sources: TatolabSearchSources,
    private readonly actions: TatolabSearchActions,
  ) {
    this.queryInput = createElement("input", {
      class: "search-input",
      type: "text",
      placeholder: "Search streams, outputs and views",
      spellcheck: "false",
      autocomplete: "off",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": "tatolab-search-results",
      "aria-label": "Search",
    });
    this.queryInput.addEventListener("input", () => {
      this.selectedRowIndex = 0;
      this.renderRows();
    });
    this.resultsList = createElement("div", { class: "search-results", id: "tatolab-search-results", role: "listbox", "aria-label": "Results" });
    this.element = createElement("dialog", { class: "search-overlay", "aria-label": "Search", "aria-modal": "true" }, [
      createElement("div", { class: "search-input-row" }, [createIcon(SEARCH_ICON_SVG, 16), this.queryInput, createShortcutCap("esc")]),
      this.resultsList,
      createElement("footer", { class: "search-footer" }, [
        createElement("span", {}, [createShortcutCap("↑"), createShortcutCap("↓"), "Move"]),
        createElement("span", {}, [createShortcutCap("↵"), "Open"]),
        createElement("span", {}, [createShortcutCap("esc"), "Close"]),
      ]),
    ]);
    this.element.addEventListener("keydown", (keyboardEvent) => this.onKeyDown(keyboardEvent));
    this.element.addEventListener("cancel", (cancelEvent) => {
      cancelEvent.preventDefault();
      this.close();
    });
    this.element.addEventListener("click", (mouseEvent) => {
      if (mouseEvent.target === this.element) this.close();
    });
  }

  /** Whether Search is over the window and not on its way out. */
  isOpen(): boolean {
    return this.element.open && this.element.dataset.closing !== "true";
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  open(initialQuery = ""): void {
    if (this.isOpen()) return;
    window.clearTimeout(this.closingTimer);
    delete this.element.dataset.closing;
    this.openCount += 1;
    this.elementFocusedBeforeOpening = document.activeElement;
    this.queryInput.value = initialQuery;
    this.selectedRowIndex = 0;
    this.exposedPortsByStream = new Map();
    this.readExposedPortsOfLoadedStreams(this.openCount);
    this.renderRows();
    if (!this.element.open) this.element.showModal();
    this.queryInput.focus();
  }

  /** Closes Search, puts focus back where it was, then runs `afterClosing` once the window takes input again. */
  close(afterClosing?: () => void): void {
    if (!this.isOpen()) return;
    this.element.dataset.closing = "true";
    window.clearTimeout(this.closingTimer);
    this.closingTimer = window.setTimeout(() => {
      delete this.element.dataset.closing;
      this.element.close();
      if (this.elementFocusedBeforeOpening instanceof HTMLElement && this.elementFocusedBeforeOpening.isConnected) {
        this.elementFocusedBeforeOpening.focus();
      }
      this.elementFocusedBeforeOpening = null;
      afterClosing?.();
    }, SEARCH_CLOSING_MILLISECONDS);
  }

  /** The exposed outputs of every loaded stream: the selected one's from its last read, the others read once now. */
  private readExposedPortsOfLoadedStreams(openCount: number): void {
    for (const stream of this.sources.listedStreams()) {
      if (streamNotLoadedReason(stream) !== null) continue;
      const alreadyRead = this.sources.exposedPortsAlreadyRead(stream.name);
      if (alreadyRead !== null) {
        this.exposedPortsByStream.set(stream.name, alreadyRead);
        continue;
      }
      void this.backend.describeStreamGraph(stream.name).then(
        (graph) => {
          if (openCount !== this.openCount || !this.isOpen()) return;
          this.exposedPortsByStream.set(stream.name, readableExposedPorts(graph));
          this.renderRows();
        },
        () => undefined,
      );
    }
  }

  private allRows(): SearchRow[] {
    const rows: SearchRow[] = [];
    const listedStreams = this.sources.listedStreams();
    const selectedStream = this.sources.selectedStream();
    const machineName = this.sources.machineName();
    for (const stream of listedStreams) {
      const statePresentation = presentStreamState(stream);
      const isFailure = statePresentation.emphasis === "failure";
      rows.push({
        groupLabel: "Streams",
        iconSvg: STREAM_ICON_SVG,
        matchText: stream.name,
        label: [
          createElement("code", { class: "search-row-name" }, [stream.name]),
          createElement("code", { class: "search-row-detail" }, [abbreviateHomeDirectory(stream.project_directory)]),
        ],
        meta: [isFailure && createFailureIcon(14), statePresentation.label],
        metaIsFailure: isFailure,
        run: () => this.actions.selectStream(stream.name),
      });
    }
    const readableOutputs: { streamName: string; exposedPort: StreamGraphExposedPort }[] = [];
    for (const stream of listedStreams) {
      for (const exposedPort of readableExposedPorts({ exposed: this.exposedPortsByStream.get(stream.name) ?? [] })) {
        readableOutputs.push({ streamName: stream.name, exposedPort });
      }
    }
    for (const { streamName, exposedPort } of readableOutputs) {
      const address = exposedOutputAddress(machineName, streamName, exposedPort);
      rows.push({
        groupLabel: "Exposed outputs",
        iconSvg: OVERVIEW_ICON_SVG,
        matchText: address.fullAddress,
        label: [createExposedAddressLabel(address, "search-row-address")],
        meta: [capitalise(exposedPort.level)],
        run: () => this.actions.showExposedOutputInOverview(streamName, { node: exposedPort.node, port: exposedPort.port }),
      });
    }
    if (this.featureFlags.watchExposedOutput) {
      for (const { streamName, exposedPort } of readableOutputs) {
        const address = exposedOutputAddress(machineName, streamName, exposedPort);
        rows.push({
          groupLabel: "Watch",
          iconSvg: EYE_ICON_SVG,
          matchText: `watch ${address.fullAddress}`,
          label: [createExposedAddressLabel(address, "search-row-address")],
          meta: [capitalise(exposedPort.level)],
          run: () => this.actions.watchOutput(streamName, { node: exposedPort.node, port: exposedPort.port }),
        });
      }
    }
    const isSelectedLoaded = selectedStream !== null && streamNotLoadedReason(selectedStream) === null;
    if (selectedStream !== null && isSelectedLoaded) {
      const tabRows: [StreamPageTab, string, string, string][] = [
        ["graph", "Graph", GRAPH_ICON_SVG, "1"],
        ["logs", "Logs", LOGS_ICON_SVG, "2"],
        ["overview", "Overview", OVERVIEW_ICON_SVG, "3"],
      ];
      for (const [tab, label, iconSvg, key] of tabRows) {
        rows.push({
          groupLabel: "Go to",
          iconSvg,
          matchText: label,
          label: [createElement("span", {}, [label]), createElement("code", { class: "search-row-detail" }, [selectedStream.name])],
          meta: [createWindowShortcutCap(this.platform, key)],
          run: () => this.actions.goToStreamTab(tab),
        });
      }
    }
    rows.push({
      groupLabel: "Go to",
      iconSvg: GEAR_ICON_SVG,
      matchText: "Settings",
      label: [createElement("span", {}, ["Settings"])],
      meta: [createWindowShortcutCap(this.platform, ",")],
      run: () => this.actions.goToSettings(),
    });
    if (selectedStream !== null) {
      rows.push({
        groupLabel: "Copy",
        iconSvg: TERMINAL_ICON_SVG,
        matchText: `copy ${selectedStream.project_directory}`,
        label: [createElement("code", { class: "search-row-address" }, [abbreviateHomeDirectory(selectedStream.project_directory)])],
        meta: ["Project path"],
        run: () => void writeTextToClipboard(selectedStream.project_directory),
      });
    }
    return rows;
  }

  private renderRows(): void {
    const query = this.queryInput.value.trim().toLowerCase();
    this.shownRows = this.allRows().filter((row) =>
      query === "" ? ALWAYS_SHOWN_GROUPS.has(row.groupLabel) : row.matchText.toLowerCase().includes(query),
    );
    this.selectedRowIndex = Math.min(this.selectedRowIndex, Math.max(0, this.shownRows.length - 1));
    const children: HTMLElement[] = [];
    let previousGroupLabel: string | null = null;
    this.shownRows.forEach((row, rowIndex) => {
      if (row.groupLabel !== previousGroupLabel) {
        children.push(createElement("p", { class: "search-group-label", role: "presentation" }, [row.groupLabel]));
        previousGroupLabel = row.groupLabel;
      }
      const isSelected = rowIndex === this.selectedRowIndex;
      children.push(
        createElement(
          "div",
          {
            class: "search-row",
            role: "option",
            id: `tatolab-search-row-${rowIndex}`,
            "aria-selected": String(isSelected),
            onClick: () => this.runRow(rowIndex),
            onMousemove: () => {
              if (this.selectedRowIndex !== rowIndex) this.selectRow(rowIndex);
            },
          },
          [
            createIcon(row.iconSvg, 16, "search-row-icon"),
            createElement("span", { class: "search-row-label" }, row.label),
            createElement("span", { class: row.metaIsFailure ? "search-row-meta failure-text" : "search-row-meta" }, row.meta),
          ],
        ),
      );
    });
    if (this.shownRows.length === 0) {
      children.push(createElement("p", { class: "search-empty" }, [`Nothing matches “${this.queryInput.value.trim()}”.`]));
    }
    this.resultsList.replaceChildren(...children);
    this.queryInput.setAttribute("aria-activedescendant", this.shownRows.length === 0 ? "" : `tatolab-search-row-${this.selectedRowIndex}`);
  }

  private selectRow(rowIndex: number): void {
    this.selectedRowIndex = rowIndex;
    for (const rowElement of this.resultsList.querySelectorAll<HTMLElement>(".search-row")) {
      rowElement.setAttribute("aria-selected", String(rowElement.id === `tatolab-search-row-${rowIndex}`));
    }
    this.queryInput.setAttribute("aria-activedescendant", `tatolab-search-row-${rowIndex}`);
    this.resultsList.querySelector(`#tatolab-search-row-${rowIndex}`)?.scrollIntoView({ block: "nearest" });
  }

  private runRow(rowIndex: number): void {
    const row = this.shownRows[rowIndex];
    if (!row) return;
    this.close(() => row.run());
  }

  private onKeyDown(keyboardEvent: KeyboardEvent): void {
    if (holdsWindowShortcutModifier(this.platform, keyboardEvent) && keyboardEvent.key.toLowerCase() === "k") {
      keyboardEvent.preventDefault();
      this.close();
      return;
    }
    if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
      keyboardEvent.preventDefault();
      if (this.shownRows.length === 0) return;
      const step = keyboardEvent.key === "ArrowDown" ? 1 : -1;
      this.selectRow((this.selectedRowIndex + step + this.shownRows.length) % this.shownRows.length);
    } else if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      this.runRow(this.selectedRowIndex);
    } else if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      this.close();
    }
  }
}

function capitalise(word: string): string {
  return word === "" ? word : word[0].toUpperCase() + word.slice(1);
}
