// Studio's end of a view's MessagePort, the one way any panel reaches Studio. Each message is decoded
// with the view contract's Schemas, its payload left for the ask it rides; every view runs with full
// access.

import {
  FAMILIES_A_PANEL_WRITES,
  portFamilyWords,
  type MessageFromStudio,
  type TatolabViewManifest,
  type ViewAsk,
  type ViewAskAnswer,
  type ViewDeclaredPort,
  type ViewSettings,
  defaultViewSettingsOf,
  type ViewWatchedReading,
  type ViewWatchedSubject,
} from "@tatolab/tato-app-view-sdk";
import { setNodeInputValueAction } from "@tatolab/tato-app-view-sdk/pin_model/input_value_actions";
import { jsonValueSchema, messageFromTheViewSchema, readViewSettings, viewSettingsForAnArea } from "@tatolab/tato-app-view-sdk/studio_host";
import { jsonObjectMembersOf, type StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { Result, Schema } from "effect";
import type {
  JsonValue,
  PortViewerConnection,
  PortViewerTarget,
  PythonLanguageServerConnection,
  StopWatching,
  StudioAreaExpansion,
  StudioViewHostServices,
  StudioViewNodeAddress,
  ViewHeaderRow,
} from "./studio_view_contract";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { InputWiring } from "@tatolab/tato-app-view-sdk/pin_model/input_wiring";
import { settingsSetOnTheViewNode } from "./studio_view_node_wiring";

/** The parts of a `MessagePort` the bridge uses, so a test can stand in for one. */
export interface TatolabViewMessagePort {
  postMessage(message: MessageFromStudio, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  start(): void;
  close(): void;
}

/**
 * What the area showing a view hands it: the settings it holds, a way to keep the next ones, and where the view's own header row lies.
 * A `node` view's settings are its node's: the area holds what the node's graph document holds, and keeps nothing itself.
 */
export interface TatolabViewAreaServices {
  /** The id of the area in the layout showing the view; `null` where the view shows outside one, as a popped-out view does. */
  areaId: string | null;
  /** The settings the area holds, `undefined` for an area that saved none, at once and on each change. */
  watchSavedSettings(listener: (savedSettings: JsonValue | undefined) => void): StopWatching;
  /** The settings the area holds now, as `watchSavedSettings` last told them. */
  readSavedSettings(): JsonValue | undefined;
  /** Keep `settings` with an `area` view's area; a `node` view's are set on its node instead. */
  rememberSettings(settings: JsonValue): void;
  watchHeaderRow(listener: (headerRow: ViewHeaderRow) => void): StopWatching;
  expansion: StudioAreaExpansion;
}

/** Whether `payload`, sent beside an output ask, is a picture Studio now holds and must close. */
function isAPictureToClose(payload: unknown): payload is VideoFrame {
  return typeof VideoFrame !== "undefined" && payload instanceof VideoFrame;
}

interface InputWatch {
  input: string;
  wiringAsJson: string;
  portViewerConnection: PortViewerConnection | null;
}

const decodeMessageFromTheView = Schema.decodeUnknownResult(messageFromTheViewSchema);
const decodeJsonValue = Schema.decodeUnknownResult(jsonValueSchema);

/** Serves one view of `viewTypeId`, declared by `manifest`, over `port`: reading through `hostServices`, its area through `areaServices`, a `node` view's inputs through `inputWiring` and its outputs onto `viewNode`; Image frames reach its inputs and port viewers as the transferred `VideoFrame`, with no copy. */
export class TatolabViewBridge {
  private readonly stopWatchingByWatchId = new Map<number, StopWatching>();
  private readonly inputWatchesByWatchId = new Map<number, InputWatch>();
  private readonly pythonLanguageServersByWatchId = new Map<number, PythonLanguageServerConnection>();
  private isClosed = false;
  /** Each setting a `node` view last set on its node, kept until its node is read holding that value, so a set made before then is judged against it. */
  private settingsSetAhead: { [settingName: string]: JsonValue } = {};
  private assetPicksOfTheViewHeld = 0;

  private readonly onMessageFromTheView = (event: MessageEvent<unknown>): void => {
    const sentPayload: unknown = typeof event.data === "object" && event.data !== null && "payload" in event.data ? event.data.payload : null;
    if (isAPictureToClose(sentPayload)) sentPayload.close();
    if (this.isClosed) return;
    const decoded = decodeMessageFromTheView(event.data);
    if (Result.isFailure(decoded)) return;
    const message = decoded.success;
    if (message.kind === "watch") this.startWatching(message.watch_id, message.subject);
    else if (message.kind === "stop_watching") this.stopWatching(message.watch_id);
    else void this.answerTheAsk(message.ask, sentPayload).then((answer) => this.send({ kind: "answered", ask_id: message.ask_id, answer }));
  };

  constructor(
    private readonly port: TatolabViewMessagePort,
    private readonly viewTypeId: string,
    private readonly manifest: TatolabViewManifest,
    private readonly hostServices: StudioViewHostServices,
    private readonly areaServices: TatolabViewAreaServices,
    private inputWiring: Record<string, InputWiring> = {},
    private viewNode: StudioViewNodeAddress | null = null,
  ) {}

  /** Tell the view its id, contract, placement, declared ports and capabilities, and answer its messages from now on. */
  start(): void {
    this.port.addEventListener("message", this.onMessageFromTheView);
    this.port.start();
    this.send({
      kind: "hello",
      grant: {
        view_type_id: this.viewTypeId,
        contract: this.manifest.contract,
        placement: this.manifest.placement,
        inputs: this.manifest.inputs,
        outputs: this.manifest.outputs,
        capabilities: this.manifest.capabilities,
      },
    });
  }

  /** Read each input from what `inputWiring` now wires into it, reopening only the inputs whose wiring changed. */
  rewireInputs(inputWiring: Record<string, InputWiring>): void {
    this.inputWiring = inputWiring;
    for (const [watchId, inputWatch] of this.inputWatchesByWatchId) {
      if (JSON.stringify(this.wiringOfTheInput(inputWatch.input)) === inputWatch.wiringAsJson) continue;
      inputWatch.portViewerConnection?.close();
      this.inputWatchesByWatchId.set(watchId, this.readTheInput(watchId, inputWatch.input));
    }
  }

  /** Set what the view sends on its outputs at `viewNode` from now on, as the window's project or the stream's asset becomes known or changes. */
  readdress(viewNode: StudioViewNodeAddress | null): void {
    this.viewNode = viewNode;
  }

  /** Stop every watch, port viewer and language server the view holds, and close its port. */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.assetPicksOfTheViewHeld > 0) this.hostServices.endTheProjectAssetPick(`${this.manifest.title} closed.`);
    for (const stopWatching of this.stopWatchingByWatchId.values()) stopWatching();
    this.stopWatchingByWatchId.clear();
    for (const inputWatch of this.inputWatchesByWatchId.values()) inputWatch.portViewerConnection?.close();
    this.inputWatchesByWatchId.clear();
    for (const pythonLanguageServer of this.pythonLanguageServersByWatchId.values()) pythonLanguageServer.close();
    this.pythonLanguageServersByWatchId.clear();
    this.port.removeEventListener("message", this.onMessageFromTheView);
    this.port.close();
  }

  private send(message: MessageFromStudio, transfer: Transferable[] = []): void {
    if (!this.isClosed) this.port.postMessage(message, transfer);
  }

  /** Sets what the view sends on `output`, live, on its node's input of that name, whose value the node publishes on the output. */
  private async writeTheOutput(output: ViewDeclaredPort, sentPayload: unknown): Promise<ViewAskAnswer> {
    const { title } = this.manifest;
    const familyWords = portFamilyWords(output.family);
    if (!FAMILIES_A_PANEL_WRITES.includes(output.family)) {
      return { kind: "refused", because: `${title} writes no value on its ${familyWords} output ${output.name}; a panel writes Array, Channels and Records outputs.` };
    }
    if (this.viewNode === null) return { kind: "refused", because: `${title} shows in an area and has no node, so what it sends on ${output.name} reaches no stream.` };
    if (isAPictureToClose(sentPayload)) return { kind: "refused", because: `${title} writes JSON on its ${familyWords} output ${output.name}, not a picture.` };
    const value = decodeJsonValue(sentPayload);
    if (Result.isFailure(value)) return { kind: "refused", because: `${output.name} takes JSON, and what the view sent is not.` };
    if (this.viewNode.kind === "not_addressed") return { kind: "refused", because: this.viewNode.because };
    const input: InputAddress = { graph: this.viewNode.graph, node_id: this.viewNode.node_id, input: output.name, member: null };
    return this.applyOnTheViewNode(input.graph.project_folder, [setNodeInputValueAction(input, value.success)], "live");
  }

  /**
   * Sets each of `settings` that changed on the view's node, as one edit of its stream's history, which Undo takes back: changed from what
   * the node holds for each setting, its default where it holds none, or from what the view set ahead of the node's next reading.
   */
  private async setTheSettingsOnTheViewNode(settings: ViewSettings): Promise<ViewAskAnswer> {
    const viewNode = this.viewNode;
    if (viewNode === null) return { kind: "refused", because: `${this.manifest.title} shows its node's settings, and has no node, so its settings reach no stream.` };
    if (viewNode.kind === "not_addressed") return { kind: "refused", because: viewNode.because };
    const settingsSet = settingsSetOnTheViewNode(viewNode, this.settingsTheViewNodeHoldsOrWasSet(), settings ?? {});
    if (settingsSet.length === 0) return { kind: "done" };
    const answer = await this.applyOnTheViewNode(viewNode.graph.project_folder, settingsSet, "commit");
    if (answer.kind === "done") this.settingsSetAhead = { ...this.settingsSetAhead, ...settings };
    return answer;
  }

  /** Each declared setting as the view's node holds it, its default where it holds none, or as the view set it ahead of the node's next reading. */
  private settingsTheViewNodeHoldsOrWasSet(): { [settingName: string]: JsonValue } {
    const settingsHeld = { ...defaultViewSettingsOf(this.manifest), ...jsonObjectMembersOf(this.areaServices.readSavedSettings()) };
    this.settingsSetAhead = Object.fromEntries(Object.entries(this.settingsSetAhead).filter(([settingName, value]) => JSON.stringify(settingsHeld[settingName] ?? null) !== JSON.stringify(value)));
    return { ...settingsHeld, ...this.settingsSetAhead };
  }

  /** `actions` applied in the project at `projectFolder`, in `mode`, as the view's ask answers it: done, or refused in the runtime's words. */
  private async applyOnTheViewNode(projectFolder: string, actions: StreamGraphAction[], mode: "commit" | "live"): Promise<ViewAskAnswer> {
    const applying = await this.hostServices.transactInTheProject(projectFolder, actions, mode, null);
    switch (applying.kind) {
      case "applied":
        return { kind: "done" };
      case "refused":
        return { kind: "refused", because: applying.refusal.runtime_words };
      case "not_sent":
        return { kind: "refused", because: applying.because };
    }
  }

  private wiringOfTheInput(input: string): InputWiring {
    return this.inputWiring[input] ?? { kind: "unwired", because: `Nothing is wired into ${input}.` };
  }

  private isWatchedUnder(watchId: number): boolean {
    return this.stopWatchingByWatchId.has(watchId) || this.inputWatchesByWatchId.has(watchId) || this.pythonLanguageServersByWatchId.has(watchId);
  }

  private startWatching(watchId: number, subject: ViewWatchedSubject): void {
    if (this.isWatchedUnder(watchId)) {
      this.send({ kind: "watch_refused", watch_id: watchId, because: `The view already watches under ${watchId}.` });
      return;
    }
    const sendReading = (watched: ViewWatchedReading, transfer: Transferable[] = []) => this.send({ kind: "watched", watch_id: watchId, watched }, transfer);
    const keep = (stopWatching: StopWatching) => this.stopWatchingByWatchId.set(watchId, stopWatching);
    switch (subject.kind) {
      case "open_project":
        keep(this.hostServices.watchOpenProject((reading) => sendReading({ subject: "open_project", reading })));
        return;
      case "listed_streams":
        keep(this.hostServices.watchListedStreams((reading) => sendReading({ subject: "listed_streams", reading })));
        return;
      case "active_stream_tab":
        keep(this.hostServices.watchActiveStreamTab((reading) => sendReading({ subject: "active_stream_tab", reading })));
        return;
      case "selection":
        keep(this.hostServices.watchSelection((reading) => sendReading({ subject: "selection", reading })));
        return;
      case "stream_graph":
        keep(this.hostServices.watchStreamGraph(subject.stream, (reading) => sendReading({ subject: "stream_graph", reading })));
        return;
      case "input_values":
        keep(this.hostServices.watchStreamInputValues(subject.stream, (reading) => sendReading({ subject: "input_values", reading })));
        return;
      case "project_log":
        keep(this.hostServices.watchProjectLog(subject.project_folder, (reading) => sendReading({ subject: "project_log", reading })));
        return;
        return;
      case "node_types":
        keep(this.hostServices.watchNodeTypes(subject.project_folder, (reading) => sendReading({ subject: "node_types", reading })));
        return;
      case "project_assets":
        keep(this.hostServices.watchProjectAssets(subject.project_folder, (reading) => sendReading({ subject: "project_assets", reading })));
        return;
      case "studio_views":
        keep(this.hostServices.watchStudioViews((reading) => sendReading({ subject: "studio_views", reading })));
        return;
      case "node_ui_elements":
        keep(this.hostServices.watchNodeUiElements((reading) => sendReading({ subject: "node_ui_elements", reading })));
        return;
      case "project_transactions":
        keep(this.hostServices.watchProjectTransactions(subject.project_folder, (reading) => sendReading({ subject: "project_transactions", reading })));
        return;
      case "port_viewer": {
        const portViewerConnection = this.readThePortViewer(subject.target, (reading, transfer) => sendReading({ subject: "port_viewer", reading }, transfer));
        keep(() => portViewerConnection.close());
        return;
      }
      case "input":
        if (!this.manifest.inputs.some((declaredInput) => declaredInput.name === subject.input)) {
          this.send({ kind: "watch_refused", watch_id: watchId, because: `${this.manifest.title} declares no input named ${subject.input}.` });
          return;
        }
        this.inputWatchesByWatchId.set(watchId, this.readTheInput(watchId, subject.input));
        return;
      case "python_language_server":
        this.pythonLanguageServersByWatchId.set(
          watchId,
          this.hostServices.connectToPythonLanguageServer(subject.project_folder, (reading) => sendReading({ subject: "python_language_server", reading })),
        );
        return;
      case "settings":
        keep(this.areaServices.watchSavedSettings((savedSettings) => sendReading({ subject: "settings", reading: viewSettingsForAnArea(this.manifest, savedSettings) })));
        return;
      case "opened_on":
        keep(this.hostServices.watchViewOpenedOn(this.viewTypeId, (reading) => sendReading({ subject: "opened_on", reading })));
        return;
      case "header_row":
        keep(this.areaServices.watchHeaderRow((reading) => sendReading({ subject: "header_row", reading })));
        return;
      case "project_asset_pick":
        keep(this.hostServices.watchProjectAssetPickShownHere((reading) => sendReading({ subject: "project_asset_pick", reading })));
        return;
      case "area_expansion":
        keep(this.areaServices.expansion.watchIsExpanded((isExpanded) => sendReading({ subject: "area_expansion", reading: { is_expanded: isExpanded } })));
        return;
      case "areas_for_the_view_type":
        keep(
          this.hostServices.watchAreasForTheViewType(subject.view_type_id, (areasInTheWindow) =>
            sendReading({
              subject: "areas_for_the_view_type",
              reading:
                areasInTheWindow.kind === "areas_listed"
                  ? { ...areasInTheWindow, areas: areasInTheWindow.areas.map((area) => ({ ...area, is_the_asking_views_area: area.area_id === this.areaServices.areaId })) }
                  : areasInTheWindow,
            }),
          ),
        );
        return;
    }
  }

  /** Reads `target`'s output port, each event going to `sendEvent`, an Image frame's `VideoFrame` or its pixels' buffer transferred. */
  private readThePortViewer(
    target: PortViewerTarget,
    sendEvent: (event: Extract<ViewWatchedReading, { subject: "port_viewer" }>["reading"], transfer: Transferable[]) => void,
  ): PortViewerConnection {
    let isWatched = true;
    const watchedConnection = this.hostServices.watchPortViewer(target, (portViewerEvent) => {
      if (portViewerEvent.kind === "image_pixels") {
        sendEvent(portViewerEvent, [portViewerEvent.pixels.buffer]);
        return;
      }
      if (portViewerEvent.kind !== "image_frame") {
        sendEvent(portViewerEvent, []);
        return;
      }
      if (this.isClosed || !isWatched) portViewerEvent.video_frame.close();
      else sendEvent(portViewerEvent, [portViewerEvent.video_frame]);
    });
    return {
      close: () => {
        isWatched = false;
        watchedConnection.close();
      },
    };
  }

  private readTheInput(watchId: number, input: string): InputWatch {
    const wiring = this.wiringOfTheInput(input);
    const wiringAsJson = JSON.stringify(wiring);
    if (wiring.kind === "unwired") {
      this.send({ kind: "watched", watch_id: watchId, watched: { subject: "input", reading: wiring } });
      return { input, wiringAsJson, portViewerConnection: null };
    }
    const portViewerConnection = this.readThePortViewer(wiring.target, (reading, transfer) =>
      this.send({ kind: "watched", watch_id: watchId, watched: { subject: "input", reading } }, transfer),
    );
    return { input, wiringAsJson, portViewerConnection };
  }

  private stopWatching(watchId: number): void {
    this.stopWatchingByWatchId.get(watchId)?.();
    this.stopWatchingByWatchId.delete(watchId);
    this.inputWatchesByWatchId.get(watchId)?.portViewerConnection?.close();
    this.inputWatchesByWatchId.delete(watchId);
    this.pythonLanguageServersByWatchId.get(watchId)?.close();
    this.pythonLanguageServersByWatchId.delete(watchId);
  }

  private async answerTheAsk(ask: ViewAsk, sentPayload: unknown): Promise<ViewAskAnswer> {
    switch (ask.kind) {
      case "select":
        this.hostServices.select(ask.selection);
        return { kind: "done" };
      case "open_stream_tab":
        this.hostServices.openStreamTab(ask.stream_tab);
        return { kind: "done" };
      case "open_view": {
        const opening = this.hostServices.openView(ask.view_type_id, ask.on);
        return opening.kind === "opened" ? { kind: "done" } : { kind: "refused", because: opening.because };
      }
      case "remember_settings": {
        const settingsReading = readViewSettings(this.manifest, ask.settings);
        if (settingsReading.kind === "do_not_fit") return { kind: "refused", because: settingsReading.because };
        if (this.manifest.placement === "node") return this.setTheSettingsOnTheViewNode(settingsReading.settings);
        this.areaServices.rememberSettings(settingsReading.settings);
        return { kind: "done" };
      }
      case "read_project_file": {
        const fileReading = await this.hostServices.readProjectFile(ask.file);
        return fileReading.kind === "read" ? { kind: "project_file_read", file_read: fileReading.file_read } : { kind: "refused", because: fileReading.because };
      }
      case "save_project_file": {
        const fileSaving = await this.hostServices.saveProjectFile(ask.file, ask.text, ask.based_on_version);
        return fileSaving.kind === "saved" ? { kind: "project_file_saved", version: fileSaving.version } : { kind: "refused", because: fileSaving.because };
      }
      case "create_node_file": {
        const nodeFileCreating = await this.hostServices.createNodeFile(ask.file);
        return nodeFileCreating.kind === "created"
          ? { kind: "node_file_created", file: nodeFileCreating.file, node_type: nodeFileCreating.node_type }
          : { kind: "refused", because: nodeFileCreating.because };
      }
      case "check_project_file": {
        const fileChecking = await this.hostServices.checkProjectFile(ask.file);
        return fileChecking.kind === "checked" ? { kind: "project_file_checked", findings: fileChecking.findings } : { kind: "refused", because: fileChecking.because };
      }
      case "list_project_files": {
        const filesListing = await this.hostServices.listProjectFiles(ask.project_folder);
        return filesListing.kind === "listed" ? { kind: "project_files_listed", project_files: filesListing.project_files } : { kind: "refused", because: filesListing.because };
      }
      case "send_to_python_language_server": {
        const pythonLanguageServer = this.pythonLanguageServersByWatchId.get(ask.watch_id);
        if (pythonLanguageServer === undefined) return { kind: "refused", because: `The view holds no language server under ${ask.watch_id}.` };
        pythonLanguageServer.send(ask.message);
        return { kind: "done" };
      }
      case "import_assets_into_the_project": {
        const importing = await this.hostServices.importAssetsIntoTheProject(ask.project_folder, ask.media);
        if (importing.kind === "imported") return { kind: "project_assets_imported", assets_imported: importing.assets_imported };
        return importing.kind === "nothing_chosen" ? { kind: "nothing_chosen" } : { kind: "refused", because: importing.because };
      }
      case "relocate_asset_in_the_project": {
        const changing = await this.hostServices.relocateAssetInTheProject(ask.project_folder, ask.asset, ask.to_path);
        return changing.kind === "changed" ? { kind: "done" } : { kind: "refused", because: changing.because };
      }
      case "read_asset_preview_in_the_project": {
        const previewReading = await this.hostServices.readAssetPreviewInTheProject(ask.project_folder, ask.asset);
        return previewReading.kind === "read" ? { kind: "asset_preview_read", picture: previewReading.picture } : { kind: "refused", because: previewReading.because };
      }
      case "recover_the_projects_streams": {
        const recovering = await this.hostServices.recoverTheProjectsStreams(ask.project_folder, ask.recovery);
        return recovering.kind === "asked" ? { kind: "done" } : { kind: "refused", because: recovering.because };
      }
      case "list_audio_capture_devices": {
        const devicesReading = await this.hostServices.listAudioCaptureDevices();
        return devicesReading.kind === "listed" ? { kind: "audio_capture_devices_listed", listing: devicesReading.listing } : { kind: "refused", because: devicesReading.because };
      }
      case "delete_asset_from_the_project": {
        const changing = await this.hostServices.deleteAssetFromTheProject(ask.project_folder, ask.asset);
        return changing.kind === "changed" ? { kind: "done" } : { kind: "refused", because: changing.because };
      }
      case "set_node_type_group_in_the_project": {
        const changing = await this.hostServices.setNodeTypeGroupInTheProject(ask.project_folder, ask.node_type, ask.group);
        return changing.kind === "changed" ? { kind: "done" } : { kind: "refused", because: changing.because };
      }
      case "show_view_type_in_area": {
        const showing = this.hostServices.showViewTypeInArea(ask.view_type_id, ask.area_id);
        return showing.kind === "opened" ? { kind: "done" } : { kind: "refused", because: showing.because };
      }
      case "pick_a_project_asset": {
        this.assetPicksOfTheViewHeld += 1;
        const ending = await this.hostServices.pickAProjectAsset(ask.pick);
        this.assetPicksOfTheViewHeld -= 1;
        if (ending.kind === "chosen") return { kind: "project_asset_chosen", asset: ending.asset };
        return ending.kind === "ended" ? { kind: "project_asset_pick_ended", because: ending.because } : { kind: "refused", because: ending.because };
      }
      case "answer_the_project_asset_pick": {
        const answering = this.hostServices.answerTheProjectAssetPick(ask.asset);
        return answering.kind === "answered" ? { kind: "done" } : { kind: "refused", because: answering.because };
      }
      case "expand_the_area": {
        const expanding = this.areaServices.expansion.expand(ask.is_expanded);
        return expanding.kind === "done" ? { kind: "done" } : { kind: "refused", because: expanding.because };
      }
      case "open_modules_and_marketplace": {
        const opening = await this.hostServices.openModulesAndMarketplace(ask.shows, ask.page ?? null);
        return opening.kind === "opened" ? { kind: "done" } : { kind: "refused", because: opening.because };
      }
      case "read_the_marketplace": {
        const marketplaceReading = await this.hostServices.readTheMarketplace();
        return marketplaceReading.kind === "read" ? { kind: "marketplace_read", entries: marketplaceReading.entries } : { kind: "refused", because: marketplaceReading.because };
      }
      case "add_from_the_marketplace": {
        const adding = await this.hostServices.addFromTheMarketplace(ask.name);
        return adding.kind === "added" ? { kind: "marketplace_module_added", folder: adding.folder } : { kind: "refused", because: adding.because };
      }
      case "undo_in_the_project":
      case "redo_in_the_project": {
        const applying =
          ask.kind === "undo_in_the_project" ? await this.hostServices.undoInTheProject(ask.project_folder, ask.author) : await this.hostServices.redoInTheProject(ask.project_folder, ask.author);
        return applying.kind === "applied" ? { kind: "project_transaction_applied", transaction: applying.transaction } : { kind: "refused", because: applying.because };
      }
      case "transact_in_the_project": {
        const applying = await this.hostServices.transactInTheProject(ask.project_folder, ask.operations, ask.mode, ask.idempotency_key);
        if (applying.kind === "applied") return { kind: "project_graph_transaction_applied", transaction: applying.transaction };
        if (applying.kind === "refused") return { kind: "project_action_refused", refusal: applying.refusal };
        return { kind: "refused", because: applying.because };
      }
      case "check_link_candidates": {
        const checking = await this.hostServices.checkLinkCandidates(ask.project_folder, ask.request);
        return checking.kind === "checked" ? { kind: "link_candidates_checked", result: checking.result } : { kind: "refused", because: checking.because };
      }
      case "read_the_person_editing": {
        const reading = await this.hostServices.readThePersonEditing();
        return reading.kind === "read" ? { kind: "the_person_editing", author: reading.author } : { kind: "refused", because: reading.because };
      }
      case "send_output": {
        const declaredOutput = this.manifest.outputs.find((candidate) => candidate.name === ask.output);
        if (declaredOutput === undefined) return { kind: "refused", because: `${this.manifest.title} declares no output named ${ask.output}.` };
        return this.writeTheOutput(declaredOutput, sentPayload);
      }
    }
  }
}
