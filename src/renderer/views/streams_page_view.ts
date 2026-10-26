import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, TatolabStatus } from "../../shared/tatolab_backend_contract";
import { createElement } from "../dom";
import { presentRuntimeStatus, type RuntimeDisplayPresentation } from "../presentation/runtime_presentation";
import { chooseSelectedStreamName } from "../presentation/stream_selection";
import { createRuntimeStatePage, createStreamsNotListedPage } from "./runtime_state_page_view";
import type { TatolabWindowPage } from "./tatolab_window_page";

type StreamsPageBodyKind = "stream" | "runtime_state" | "streams_not_listed";

/**
 * The streams the runtime lists and which one is selected, which the window's shortcuts and Search read; and, while
 * the runtime lists none, the page saying why the runtime isn't running or why its streams weren't listed.
 */
export class StreamsPageView implements TatolabWindowPage {
  readonly element: HTMLElement;
  private readonly pageBody: HTMLElement;
  private shownBodyKind: StreamsPageBodyKind | null = null;
  /** The body kind, and for a runtime that isn't running which state it is in, so a new state redraws it. */
  private shownBodyKey: string | null = null;
  private selectedStreamName: string | null = null;
  private listedStreams: ListedStream[] = [];
  private latestStatus: TatolabStatus | null = null;
  private runtimeLastAnsweredAt: Date | null = null;

  constructor(private readonly backend: TatolabBackend) {
    this.pageBody = createElement("div", { class: "streams-page-body" });
    this.element = createElement("section", { class: "window-page streams-page", "aria-label": "Streams" }, [this.pageBody]);
  }

  /** The local time of the last status that found the runtime running, for the not-responding page. */
  setRuntimeLastAnsweredAt(lastAnsweredAt: Date | null): void {
    this.runtimeLastAnsweredAt = lastAnsweredAt;
  }

  showStatus(status: TatolabStatus): void {
    this.latestStatus = status;
    const presentation = presentRuntimeStatus(status);
    const isRunning = presentation.displayState === "running";
    const bodyKind: StreamsPageBodyKind = !isRunning
      ? "runtime_state"
      : status.streams === null
        ? "streams_not_listed"
        : "stream";
    this.showBody(bodyKind, presentation);

    if (status.streams !== null && isRunning) {
      this.selectedStreamName = chooseSelectedStreamName(
        status.streams,
        this.selectedStreamName,
        this.listedStreams.map((stream) => stream.name),
      );
      this.listedStreams = status.streams;
    } else if (status.streams !== null) {
      this.listedStreams = status.streams;
    } else if (!isRunning) {
      this.listedStreams = [];
    }
  }

  /** Selects `streamName`, as the window's route or Search does. */
  chooseStream(streamName: string): void {
    if (!this.listedStreams.some((stream) => stream.name === streamName)) return;
    this.selectedStreamName = streamName;
  }

  /** The stream listed before (`-1`) or after (`1`) the selected one; `null` when there is none to go to. */
  adjacentStreamName(step: -1 | 1): string | null {
    if (this.shownBodyKind !== "stream" || this.listedStreams.length === 0) return null;
    const selectedIndex = this.listedStreams.findIndex((stream) => stream.name === this.selectedStreamName);
    const nextIndex = Math.min(this.listedStreams.length - 1, Math.max(0, selectedIndex + step));
    return this.listedStreams[nextIndex]?.name ?? null;
  }

  listedStreamsForSearch(): ListedStream[] {
    return this.shownBodyKind === "stream" ? this.listedStreams : [];
  }

  selectedStream(): ListedStream | null {
    return this.listedStreams.find((stream) => stream.name === this.selectedStreamName) ?? null;
  }

  machineName(): string | null {
    return this.latestStatus?.machine_name ?? null;
  }

  private showBody(bodyKind: StreamsPageBodyKind, presentation: RuntimeDisplayPresentation): void {
    const bodyKey = bodyKind === "runtime_state" ? `${bodyKind}:${presentation.displayState}` : bodyKind;
    if (bodyKey === this.shownBodyKey) return;
    this.shownBodyKind = bodyKind;
    this.shownBodyKey = bodyKey;
    switch (bodyKind) {
      case "stream":
        // The React stream pages show a listed stream; this page shows only while the runtime lists none.
        this.pageBody.replaceChildren();
        break;
      case "runtime_state":
        this.pageBody.replaceChildren(createRuntimeStatePage(this.backend, presentation, this.runtimeLastAnsweredAt));
        break;
      case "streams_not_listed":
        this.pageBody.replaceChildren(createStreamsNotListedPage());
        break;
    }
  }
}
