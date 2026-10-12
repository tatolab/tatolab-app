import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, TatolabStatus } from "../backend/tatolab_backend_contract";
import { createElement, createSvgFromMarkup, setTextIfChanged } from "../dom";
import { MACHINE_ICON_SVG, RUNTIME_STATE_FIGURE_SVG } from "../icons";
import { presentRuntimeStatus, type RuntimeDisplayPresentation } from "../presentation/runtime_presentation";
import { countLabel } from "../presentation/stream_presentation";
import { chooseSelectedStreamName } from "../presentation/stream_selection";
import { isTatolabWindowVisible, onTatolabWindowVisibilityChanged } from "../window_visibility";
import { createFirstStreamGuide } from "./first_stream_guide_view";
import { createRuntimeBanner } from "./runtime_banner_view";
import { StreamDetailView } from "./stream_detail_view";
import { StreamListView } from "./stream_list_view";
import type { TatolabWindowPage } from "./tatolab_window_page";

type StreamsPageBodyKind = "streams" | "first_stream_guide" | "runtime_not_running" | "streams_not_listed";

const SKELETON_ROW_COUNT = 3;

function createRuntimeNotRunningBody(presentation: RuntimeDisplayPresentation): HTMLElement {
  const isStarting = presentation.displayState === "starting";
  return createElement("div", { class: "streams-skeleton", "data-starting": String(isStarting), "data-tone": presentation.tone }, [
    createElement(
      "div",
      { class: "streams-skeleton-list", "aria-hidden": "true" },
      Array.from({ length: SKELETON_ROW_COUNT }, () =>
        createElement("div", { class: "streams-skeleton-row" }, [
          createElement("span", { class: "streams-skeleton-dot" }),
          createElement("span", { class: "streams-skeleton-bar streams-skeleton-bar-name" }),
          createElement("span", { class: "streams-skeleton-bar streams-skeleton-bar-path" }),
        ]),
      ),
    ),
    createElement("div", { class: "streams-skeleton-detail" }, [
      createSvgFromMarkup(RUNTIME_STATE_FIGURE_SVG),
      createElement("p", { class: "streams-skeleton-message" }, [
        isStarting
          ? "Your streams appear here as soon as the runtime answers."
          : "Streams appear here while the runtime runs.",
      ]),
    ]),
  ]);
}

function createStreamsNotListedBody(): HTMLElement {
  return createElement("div", { class: "streams-not-listed" }, [
    createElement("p", { class: "streams-not-listed-headline" }, ["The runtime didn't list its streams"]),
    createElement("p", { class: "streams-not-listed-explanation" }, [
      "It's running, but its stream list couldn't be read. Tatolab asks again every two seconds.",
    ]),
  ]);
}

/** The default page: the runtime at a glance, then every stream it runs beside the selected one's graph and logs. */
export class StreamsPageView implements TatolabWindowPage {
  readonly element: HTMLElement;
  private readonly runtimeStateFact: HTMLElement;
  private readonly runtimeStateDot: HTMLElement;
  private readonly runtimeStateLabel: HTMLElement;
  private readonly machineNameFact: HTMLElement;
  private readonly machineNameLabel: HTMLElement;
  private readonly streamCountFact: HTMLElement;
  private readonly nodeCountFact: HTMLElement;
  private readonly appVersionFact: HTMLElement;
  private readonly bannerSlot: HTMLElement;
  private readonly pageBody: HTMLElement;
  private readonly streamsSplit: HTMLElement;
  private readonly streamList: StreamListView;
  private readonly streamDetail: StreamDetailView;
  private firstStreamGuide: { element: HTMLElement; dispose(): void } | null = null;
  private shownBannerKey: string | null = null;
  private shownBodyKind: StreamsPageBodyKind | null = null;
  /** The body kind, and for a runtime that isn't running which state it is in, so a new state redraws it. */
  private shownBodyKey: string | null = null;
  private selectedStreamName: string | null = null;
  private listedStreams: ListedStream[] = [];
  private isPageShown = false;

  constructor(private readonly backend: TatolabBackend) {
    this.runtimeStateDot = createElement("span", { class: "status-dot", "aria-hidden": "true" });
    this.runtimeStateLabel = createElement("span", { class: "runtime-fact-state-label" });
    this.runtimeStateFact = createElement("span", { class: "runtime-fact runtime-fact-state" }, [
      this.runtimeStateDot,
      this.runtimeStateLabel,
    ]);
    this.machineNameLabel = createElement("span", { class: "runtime-fact-machine-name" });
    this.machineNameFact = createElement("span", { class: "runtime-fact runtime-fact-machine", title: "This Mac's name" }, [
      createSvgFromMarkup(MACHINE_ICON_SVG),
      this.machineNameLabel,
    ]);
    this.streamCountFact = createElement("span", { class: "runtime-fact runtime-fact-count" });
    this.nodeCountFact = createElement("span", { class: "runtime-fact runtime-fact-count runtime-fact-node-count" });
    this.appVersionFact = createElement("span", { class: "runtime-fact runtime-fact-version" });

    this.bannerSlot = createElement("div", { class: "runtime-banner-slot" });
    this.streamList = new StreamListView((streamName) => this.chooseStream(streamName));
    this.streamDetail = new StreamDetailView(backend);
    this.streamsSplit = createElement("div", { class: "streams-split" }, [
      this.streamList.element,
      createElement("div", { class: "stream-detail-pane" }, [this.streamDetail.element]),
    ]);
    this.pageBody = createElement("div", { class: "streams-page-body" });

    this.element = createElement("section", { class: "window-page streams-page", "aria-labelledby": "streams-page-title" }, [
      createElement("header", { class: "page-top-band", "data-tauri-drag-region": "deep" }, [
        createElement("h1", { class: "page-title", id: "streams-page-title" }, ["Streams"]),
        createElement("div", { class: "runtime-facts", "aria-label": "Runtime" }, [
          this.runtimeStateFact,
          this.machineNameFact,
          this.streamCountFact,
          this.nodeCountFact,
          this.appVersionFact,
        ]),
      ]),
      this.bannerSlot,
      this.pageBody,
    ]);
    onTatolabWindowVisibilityChanged(() => this.updatePolling());
  }

  showStatus(status: TatolabStatus): void {
    const presentation = presentRuntimeStatus(status);
    this.showRuntimeFacts(status, presentation);
    this.showBanner(presentation);

    const isRunning = presentation.displayState === "running";
    const bodyKind: StreamsPageBodyKind = !isRunning
      ? "runtime_not_running"
      : status.streams === null
        ? "streams_not_listed"
        : status.streams.length === 0
          ? "first_stream_guide"
          : "streams";
    this.showBody(bodyKind, presentation);

    if (bodyKind === "streams" && status.streams !== null) {
      this.selectedStreamName = chooseSelectedStreamName(
        status.streams,
        this.selectedStreamName,
        this.listedStreams.map((stream) => stream.name),
      );
      this.listedStreams = status.streams;
      this.streamList.showStreams(status.streams, this.selectedStreamName);
      const selectedStream = status.streams.find((stream) => stream.name === this.selectedStreamName);
      if (selectedStream) this.streamDetail.showStream(selectedStream);
      this.streamDetail.pollNow();
    } else if (status.streams !== null) {
      this.listedStreams = status.streams;
    }
  }

  setPageShown(isShown: boolean): void {
    this.isPageShown = isShown;
    this.updatePolling();
  }

  /** Focuses the selected stream's log filter; false when no log console is showing. */
  focusLogFilter(): boolean {
    return this.shownBodyKind === "streams" && this.streamDetail.focusLogFilter();
  }

  private chooseStream(streamName: string): void {
    if (streamName === this.selectedStreamName) return;
    this.selectedStreamName = streamName;
    this.streamList.showStreams(this.listedStreams, streamName);
    const chosenStream = this.listedStreams.find((stream) => stream.name === streamName);
    if (chosenStream) this.streamDetail.showStream(chosenStream);
  }

  private showRuntimeFacts(status: TatolabStatus, presentation: RuntimeDisplayPresentation): void {
    this.runtimeStateFact.dataset.tone = presentation.tone;
    this.runtimeStateDot.dataset.tone = presentation.tone;
    this.runtimeStateDot.classList.toggle("status-dot-live", presentation.displayState === "running");
    this.runtimeStateDot.classList.toggle("status-dot-breathing", presentation.displayState === "starting");
    setTextIfChanged(this.runtimeStateLabel, presentation.shortLabel);

    this.machineNameFact.hidden = status.machine_name === null;
    setTextIfChanged(this.machineNameLabel, status.machine_name ?? "");

    const isRunning = presentation.displayState === "running";
    const listedStreams = isRunning ? status.streams : null;
    this.streamCountFact.hidden = listedStreams === null;
    this.nodeCountFact.hidden = listedStreams === null;
    if (listedStreams !== null) {
      const loadedNodeCount = listedStreams.reduce((sum, stream) => sum + (stream.node_count ?? 0), 0);
      setTextIfChanged(this.streamCountFact, countLabel(listedStreams.length, "stream", "streams"));
      setTextIfChanged(this.nodeCountFact, countLabel(loadedNodeCount, "node", "nodes"));
    }
    setTextIfChanged(this.appVersionFact, `Tatolab ${status.app_version}`);
  }

  private showBanner(presentation: RuntimeDisplayPresentation): void {
    const bannerKey = presentation.banner === null ? null : presentation.displayState;
    if (bannerKey === this.shownBannerKey) return;
    this.shownBannerKey = bannerKey;
    this.bannerSlot.replaceChildren(
      ...(presentation.banner === null ? [] : [createRuntimeBanner(this.backend, presentation.banner, presentation.tone)]),
    );
  }

  private showBody(bodyKind: StreamsPageBodyKind, presentation: RuntimeDisplayPresentation): void {
    const bodyKey = bodyKind === "runtime_not_running" ? `${bodyKind}:${presentation.displayState}` : bodyKind;
    if (bodyKey === this.shownBodyKey) return;
    if (this.shownBodyKind === "streams") this.streamDetail.dispose();
    this.firstStreamGuide?.dispose();
    this.firstStreamGuide = null;
    this.shownBodyKind = bodyKind;
    this.shownBodyKey = bodyKey;
    switch (bodyKind) {
      case "streams":
        this.pageBody.replaceChildren(this.streamsSplit);
        break;
      case "first_stream_guide":
        this.firstStreamGuide = createFirstStreamGuide();
        this.pageBody.replaceChildren(this.firstStreamGuide.element);
        break;
      case "runtime_not_running":
        this.pageBody.replaceChildren(createRuntimeNotRunningBody(presentation));
        break;
      case "streams_not_listed":
        this.pageBody.replaceChildren(createStreamsNotListedBody());
        break;
    }
    this.updatePolling();
  }

  private updatePolling(): void {
    this.streamDetail.setPollingAllowed(this.isPageShown && isTatolabWindowVisible() && this.shownBodyKind === "streams");
  }
}
