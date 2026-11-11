// Studio's end of a view's MessagePort, the one way any panel reaches Studio. Each message is parsed
// against the view contract's schemas; every view runs with full access.

import {
  jsonValueSchema,
  messageFromTheViewSchema,
  readViewSettings,
  viewSettingsForAnArea,
  type MessageFromStudio,
  type TatolabViewManifest,
  type ViewAsk,
  type ViewAskAnswer,
  type ViewWatchedReading,
  type ViewWatchedSubject,
} from "@tatolab/tato-app-view-sdk";
import type {
  JsonValue,
  PortViewerConnection,
  PortViewerTarget,
  PythonLanguageServerConnection,
  StopWatching,
  StudioViewHostServices,
  StudioViewNodeAddress,
  ViewHeaderRow,
} from "./studio_view_contract";
import type { StudioViewInputWiring } from "./studio_view_node_wiring";

/** The parts of a `MessagePort` the bridge uses, so a test can stand in for one. */
export interface TatolabViewMessagePort {
  postMessage(message: MessageFromStudio, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  start(): void;
  close(): void;
}

/** What the area showing a view hands it: the settings it saved, a way to keep the next ones, and where the view's own header row lies. */
export interface TatolabViewAreaServices {
  /** The id of the area in the chosen layout showing the view; `null` where the view shows outside one, as a popped-out view does. */
  areaId: string | null;
  /** The settings the area holds, `undefined` for an area that saved none, at once and on each change. */
  watchSavedSettings(listener: (savedSettings: JsonValue | undefined) => void): StopWatching;
  rememberSettings(settings: JsonValue): void;
  watchHeaderRow(listener: (headerRow: ViewHeaderRow) => void): StopWatching;
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

/** Serves one view of `viewTypeId`, declared by `manifest`, over `port`: reading through `hostServices`, its area through `areaServices`, a `node` view's inputs through `inputWiring` and its outputs onto `viewNode`; Image frames cross as the transferred `VideoFrame`, with no copy. */
export class TatolabViewBridge {
  private readonly stopWatchingByWatchId = new Map<number, StopWatching>();
  private readonly inputWatchesByWatchId = new Map<number, InputWatch>();
  private readonly pythonLanguageServersByWatchId = new Map<number, PythonLanguageServerConnection>();
  private isClosed = false;

  private readonly onMessageFromTheView = (event: MessageEvent<unknown>): void => {
    const sentPayload: unknown = typeof event.data === "object" && event.data !== null && "payload" in event.data ? event.data.payload : null;
    if (isAPictureToClose(sentPayload)) sentPayload.close();
    if (this.isClosed) return;
    const parsed = messageFromTheViewSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
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
    private inputWiring: Record<string, StudioViewInputWiring> = {},
    private readonly viewNode: StudioViewNodeAddress | null = null,
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
  rewireInputs(inputWiring: Record<string, StudioViewInputWiring>): void {
    this.inputWiring = inputWiring;
    for (const [watchId, inputWatch] of this.inputWatchesByWatchId) {
      if (JSON.stringify(this.wiringOfTheInput(inputWatch.input)) === inputWatch.wiringAsJson) continue;
      inputWatch.portViewerConnection?.close();
      this.inputWatchesByWatchId.set(watchId, this.readTheInput(watchId, inputWatch.input));
    }
  }

  /** Stop every watch, port viewer and language server the view holds, and close its port. */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
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

  private async writeTheOutput(output: string, sentPayload: unknown): Promise<ViewAskAnswer> {
    if (this.viewNode === null) return { kind: "refused", because: `${this.manifest.title} shows in an area and has no node, so what it sends on ${output} reaches no stream.` };
    if (isAPictureToClose(sentPayload)) return { kind: "refused", because: `The runtime publishes what a view writes on its Array, Channels and Records outputs, so ${output} takes JSON, not a picture.` };
    const value = jsonValueSchema.safeParse(sentPayload);
    if (!value.success) return { kind: "refused", because: `${output} takes JSON, and what the view sent is not.` };
    const writing = await this.hostServices.writeStudioViewOutput(this.viewNode, output, value.data);
    return writing.kind === "written" ? { kind: "done" } : { kind: "refused", because: writing.because };
  }

  private wiringOfTheInput(input: string): StudioViewInputWiring {
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
      case "node_catalog":
        keep(this.hostServices.watchNodeCatalog(subject.stream, (reading) => sendReading({ subject: "node_catalog", reading })));
        return;
      case "project_log":
        keep(this.hostServices.watchProjectLog(subject.project_folder, (reading) => sendReading({ subject: "project_log", reading })));
        return;
      case "project_node_types":
        keep(this.hostServices.watchProjectNodeTypes(subject.project_folder, (reading) => sendReading({ subject: "project_node_types", reading })));
        return;
      case "project_assets":
        keep(this.hostServices.watchProjectAssets(subject.project_folder, (reading) => sendReading({ subject: "project_assets", reading })));
        return;
      case "studio_views":
        keep(this.hostServices.watchStudioViews((reading) => sendReading({ subject: "studio_views", reading })));
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

  /** Reads `target`'s output port, each event going to `sendEvent`, an Image frame's `VideoFrame` transferred. */
  private readThePortViewer(
    target: PortViewerTarget,
    sendEvent: (event: Extract<ViewWatchedReading, { subject: "port_viewer" }>["reading"], transfer: Transferable[]) => void,
  ): PortViewerConnection {
    let isWatched = true;
    const watchedConnection = this.hostServices.watchPortViewer(target, (portViewerEvent) => {
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
        const importing = await this.hostServices.importAssetsIntoTheProject(ask.project_folder);
        if (importing.kind === "imported") return { kind: "project_assets_imported", assets_imported: importing.assets_imported };
        return importing.kind === "nothing_chosen" ? { kind: "nothing_chosen" } : { kind: "refused", because: importing.because };
      }
      case "relocate_asset_in_the_project": {
        const changing = await this.hostServices.relocateAssetInTheProject(ask.project_folder, ask.asset, ask.to_path);
        return changing.kind === "changed" ? { kind: "done" } : { kind: "refused", because: changing.because };
      }
      case "delete_asset_from_the_project": {
        const changing = await this.hostServices.deleteAssetFromTheProject(ask.project_folder, ask.asset);
        return changing.kind === "changed" ? { kind: "done" } : { kind: "refused", because: changing.because };
      }
      case "show_view_type_in_area": {
        const showing = this.hostServices.showViewTypeInArea(ask.view_type_id, ask.area_id);
        return showing.kind === "opened" ? { kind: "done" } : { kind: "refused", because: showing.because };
      }
      case "open_modules_and_marketplace": {
        const opening = await this.hostServices.openModulesAndMarketplace(ask.shows);
        return opening.kind === "opened" ? { kind: "done" } : { kind: "refused", because: opening.because };
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
      case "read_the_person_editing": {
        const reading = await this.hostServices.readThePersonEditing();
        return reading.kind === "read" ? { kind: "the_person_editing", author: reading.author } : { kind: "refused", because: reading.because };
      }
      case "send_output":
        if (!this.manifest.outputs.some((declaredOutput) => declaredOutput.name === ask.output)) {
          return { kind: "refused", because: `${this.manifest.title} declares no output named ${ask.output}.` };
        }
        return this.writeTheOutput(ask.output, sentPayload);
    }
  }
}
