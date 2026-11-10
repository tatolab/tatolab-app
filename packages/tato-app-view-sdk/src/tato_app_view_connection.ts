// A view's side of the view contract: the one way any panel, Tato Studio's own or brought by a project,
// reads from and asks of Tato Studio. It runs inside the view's own frame, depends on no UI
// framework, and parses everything Studio sends against the contract's schemas.

import type {
  GraphEditMode,
  JsonValue,
  ListedStreamsReading,
  NodeCatalogReading,
  OpenProjectReading,
  PortViewerTarget,
  ProjectFileReading,
  ProjectFileSaving,
  ProjectFilesListing,
  ProjectGraphTransactionApplying,
  ProjectLogReading,
  ProjectNodeTypesReading,
  ProjectTransactionApplying,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  PythonLanguageServerConnectionEvent,
  StreamGraphAction,
  StreamGraphReading,
  StreamTabAddress,
  StudioSelection,
  ThePersonEditingReading,
  ViewHeaderRow,
  ViewOpenedOn,
} from "./studio_readings.js";
import type { ViewSettings } from "./view_settings.js";
import {
  VIEW_PORT_HANDOVER,
  messageFromStudioSchema,
  type MessageFromStudio,
  type MessageFromTheView,
  type PortViewerEvent,
  type ViewAsk,
  type ViewAskAnswer,
  type ViewGrant,
  type ViewInputEvent,
  type ViewOpeningTarget,
  type ViewWatchedReading,
  type ViewWatchedSubject,
} from "./view_wire_messages.js";

/** Stops a watch; calling it again does nothing. */
export type StopWatching = () => void;

/** Called with Studio's words when it refuses a watch, such as one a sandboxed view's grant does not cover. */
export type WhenStudioRefuses = (because: string) => void;

/** What a view sends on an output: a `VideoFrame` or `ImageBitmap` for Image, which Studio then owns, or JSON. */
export type ViewOutputPayload = JsonValue | ImageBitmap | VideoFrame;

/** How a graph transaction is sent: kept or live, and the key of the person's gesture it belongs to, `null` for none. */
export interface GraphTransactionSending {
  mode: GraphEditMode;
  idempotencyKey: string | null;
}

/** A new idempotency key for one gesture of the person's: its live edits may share it, its one committed transaction is sent under it, and a retry of that commit answers the first. */
export function newGestureIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Studio done, or refused in its own words. */
export type ViewAskDone = { kind: "done" } | { kind: "refused"; because: string };

/** One Python language server started for the view, its JSON-RPC messages carried both ways. */
export interface PythonLanguageServerConnection {
  /** Send one JSON-RPC message; messages sent before the server has started are held and sent in order. */
  send(message: JsonValue): void;
  /** Stop the server; nothing arrives after. */
  close(): void;
}

/** A view's connection to Studio: what it was granted, and each part of the contract it may read or ask for. */
export interface TatoAppViewConnection {
  readonly grant: ViewGrant;
  watchOpenProject(listener: (reading: OpenProjectReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  watchListedStreams(listener: (reading: ListedStreamsReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  watchActiveStreamTab(listener: (activeStreamTab: StreamTabAddress | null) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.selection`. */
  watchSelection(listener: (selection: StudioSelection) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.stream_graph`; the first reading arrives once read. */
  watchStreamGraph(stream: string, listener: (reading: StreamGraphReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.stream_graph`. */
  watchNodeCatalog(stream: string, listener: (reading: NodeCatalogReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.project_assets`; the first reading arrives once read. */
  watchProjectLog(projectFolder: string, listener: (reading: ProjectLogReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.project_assets`; the first reading arrives once listed. */
  watchProjectNodeTypes(projectFolder: string, listener: (reading: ProjectNodeTypesReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.project_assets`; the first reading arrives once read, and another each time the runtime applies a transaction to the project. */
  watchProjectTransactions(projectFolder: string, listener: (reading: ProjectTransactionsReading) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** Needs `read.stream_graph`. Each frame or message of `target`'s output port; an Image frame arrives as a `VideoFrame` the view closes once drawn. */
  watchPortViewer(target: PortViewerTarget, onEvent: (event: PortViewerEvent) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** What the output wired into the `node` view's input `input` carries; an Image frame arrives as a `VideoFrame` the view closes once drawn. */
  watchInput(input: string, onEvent: (inputEvent: ViewInputEvent) => void, whenRefused?: WhenStudioRefuses): StopWatching;
  /** The settings the view's area holds, checked against the view's declared settings: at once, then after each `rememberSettings`. */
  watchSettings(listener: (settings: ViewSettings) => void): StopWatching;
  /** The file or port the view's area was opened on, at once and again whenever the area is opened on another. */
  watchOpenedOn(listener: (openedOn: ViewOpenedOn) => void): StopWatching;
  /** Where the view's own header row lies in its frame, after Studio's view-type menu, at once and on each change. */
  watchHeaderRow(listener: (headerRow: ViewHeaderRow) => void): StopWatching;
  /** Needs `write.selection`. */
  select(selection: StudioSelection): Promise<ViewAskDone>;
  /** Needs `write.selection`. */
  openStreamTab(streamTab: StreamTabAddress): Promise<ViewAskDone>;
  /** Needs `write.selection`. Open a view of `viewTypeId` on `on`, a file or a running node's output port. */
  openView(viewTypeId: string, on: ViewOpeningTarget): Promise<ViewAskDone>;
  /** Keep `settings` with the view's area; refused when they do not fit what the view declares. */
  rememberSettings(settings: ViewSettings): Promise<ViewAskDone>;
  /** Needs `read.project_assets`. */
  readProjectFile(file: string): Promise<ProjectFileReading>;
  /** Needs `write.project_assets`. Write `text` to `file` whole when it is still at `basedOnVersion` on disk (`null` for a new file). */
  saveProjectFile(file: string, text: string, basedOnVersion: string | null): Promise<ProjectFileSaving>;
  /** Needs `read.project_assets`. */
  listProjectFiles(projectFolder: string): Promise<ProjectFilesListing>;
  /** Needs `read.project_assets`. Start Pyright's language server for `projectFolder`, each message and its end arriving on `onEvent`. */
  connectToPythonLanguageServer(projectFolder: string, onEvent: (event: PythonLanguageServerConnectionEvent) => void): PythonLanguageServerConnection;
  /** Needs `write.project_assets`. Undo `author`'s latest transaction in the project not undone yet, answering the undo the runtime applied. */
  undoInTheProject(projectFolder: string, author: ProjectTransactionAuthor): Promise<ProjectTransactionApplying>;
  /** Needs `write.project_assets`. Redo what `author`'s latest undo in the project reversed, answering the redo the runtime applied. */
  redoInTheProject(projectFolder: string, author: ProjectTransactionAuthor): Promise<ProjectTransactionApplying>;
  /** Needs `read.project_assets`. The person editing in Studio: the author their graph edits are recorded under, and so whose edits their own Undo reverts. */
  readThePersonEditing(): Promise<ThePersonEditingReading>;
  /** Needs `edit.stream_graph`. Apply `operations` on the graphs of the project's streams as one transaction, whole or not at all, answering what it applied or the runtime's structured refusal. */
  transactInTheProject(projectFolder: string, operations: readonly StreamGraphAction[], sending: GraphTransactionSending): Promise<ProjectGraphTransactionApplying>;
  /** Send `payload` on the `node` view's output `output`. */
  sendOutput(output: string, payload: ViewOutputPayload): Promise<ViewAskDone>;
  /** Stop every watch and close the port. */
  close(): void;
}

interface WatchHeld {
  onWatched: (watched: ViewWatchedReading) => void;
  whenRefused: WhenStudioRefuses;
}

const IGNORE_THE_REFUSAL: WhenStudioRefuses = () => undefined;
const CLOSED_BECAUSE = "The view closed its connection to Tato Studio.";

function isAVideoFrame(payload: unknown): payload is VideoFrame {
  return typeof VideoFrame !== "undefined" && payload instanceof VideoFrame;
}

function picturesToTransferOf(payload: ViewOutputPayload): Transferable[] {
  if (isAVideoFrame(payload)) return [payload];
  if (typeof ImageBitmap !== "undefined" && payload instanceof ImageBitmap) return [payload];
  return [];
}

type ImageBitmapEvent = Extract<Extract<ViewWatchedReading, { subject: "input" }>["reading"], { kind: "image_bitmap" }>;

/** An Image frame that crossed as an `ImageBitmap`, made a `VideoFrame` again at its frame's timestamp. */
function imageFrameOf(imageBitmapEvent: ImageBitmapEvent): Extract<PortViewerEvent, { kind: "image_frame" }> {
  const videoFrame = new VideoFrame(imageBitmapEvent.image_bitmap, { timestamp: imageBitmapEvent.timestamp_microseconds });
  imageBitmapEvent.image_bitmap.close();
  return { kind: "image_frame", video_frame: videoFrame, format_wire_name: imageBitmapEvent.format_wire_name, skipped_since_last_read: imageBitmapEvent.skipped_since_last_read };
}

function settingsOf(reading: JsonValue): ViewSettings {
  return typeof reading === "object" && reading !== null && !Array.isArray(reading) ? reading : null;
}

function doneOf(answer: ViewAskAnswer): ViewAskDone {
  if (answer.kind === "done") return { kind: "done" };
  if (answer.kind === "refused") return answer;
  return { kind: "refused", because: `Tato Studio answered with ${answer.kind}, which this ask does not take.` };
}

function transactionApplyingOf(answer: ViewAskAnswer): ProjectTransactionApplying {
  if (answer.kind === "project_transaction_applied") return { kind: "applied", transaction: answer.transaction };
  return { kind: "not_applied", because: answer.kind === "refused" ? answer.because : `Tato Studio answered with ${answer.kind}.` };
}

function graphTransactionApplyingOf(answer: ViewAskAnswer): ProjectGraphTransactionApplying {
  if (answer.kind === "project_graph_transaction_applied") return { kind: "applied", transaction: answer.transaction };
  if (answer.kind === "project_action_refused") return { kind: "refused", refusal: answer.refusal };
  return { kind: "not_sent", because: answer.kind === "refused" ? answer.because : `Tato Studio answered with ${answer.kind}.` };
}

/** The view's connection over `port`, once Studio has said what it granted. */
export function connectToTatoAppOverPort(port: MessagePort): Promise<TatoAppViewConnection> {
  return new Promise((resolveConnection) => {
    const watchesHeldById = new Map<number, WatchHeld>();
    const answerWaitersByAskId = new Map<number, (answer: ViewAskAnswer) => void>();
    let nextId = 1;
    let isClosed = false;

    const send = (message: MessageFromTheView, transfer: Transferable[] = []) => {
      if (!isClosed) port.postMessage(message, transfer);
    };
    const watch = (subject: ViewWatchedSubject, watchHeld: WatchHeld): { watchId: number; stopWatching: StopWatching } => {
      const watchId = nextId++;
      watchesHeldById.set(watchId, watchHeld);
      send({ kind: "watch", watch_id: watchId, subject });
      return {
        watchId,
        stopWatching: () => {
          if (!watchesHeldById.delete(watchId)) return;
          send({ kind: "stop_watching", watch_id: watchId });
        },
      };
    };
    const watchFor = (subject: ViewWatchedSubject, onWatched: (watched: ViewWatchedReading) => void, whenRefused: WhenStudioRefuses): StopWatching =>
      watch(subject, { onWatched, whenRefused }).stopWatching;
    const ask = (askedFor: ViewAsk, payload?: ViewOutputPayload): Promise<ViewAskAnswer> => {
      if (isClosed) return Promise.resolve({ kind: "refused", because: CLOSED_BECAUSE });
      const askId = nextId++;
      return new Promise((resolveAnswer) => {
        answerWaitersByAskId.set(askId, resolveAnswer);
        if (payload === undefined) send({ kind: "ask", ask_id: askId, ask: askedFor });
        else send({ kind: "ask", ask_id: askId, ask: askedFor, payload }, picturesToTransferOf(payload));
      });
    };

    const onMessageFromStudio = (message: MessageFromStudio) => {
      switch (message.kind) {
        case "hello":
          resolveConnection(connectionGranted(message.grant));
          return;
        case "watched":
          watchesHeldById.get(message.watch_id)?.onWatched(message.watched);
          return;
        case "watch_refused": {
          const watchHeld = watchesHeldById.get(message.watch_id);
          watchesHeldById.delete(message.watch_id);
          watchHeld?.whenRefused(message.because);
          return;
        }
        case "answered":
          answerWaitersByAskId.get(message.ask_id)?.(message.answer);
          answerWaitersByAskId.delete(message.ask_id);
          return;
      }
    };
    const onPortMessage = (event: MessageEvent<unknown>) => {
      const parsed = messageFromStudioSchema.safeParse(event.data);
      if (parsed.success) onMessageFromStudio(parsed.data);
    };
    port.addEventListener("message", onPortMessage);
    port.start();

    const connectionGranted = (grant: ViewGrant): TatoAppViewConnection => ({
      grant,
      watchOpenProject: (listener, whenRefused = IGNORE_THE_REFUSAL) => watchFor({ kind: "open_project" }, (watched) => watched.subject === "open_project" && listener(watched.reading), whenRefused),
      watchListedStreams: (listener, whenRefused = IGNORE_THE_REFUSAL) => watchFor({ kind: "listed_streams" }, (watched) => watched.subject === "listed_streams" && listener(watched.reading), whenRefused),
      watchActiveStreamTab: (listener, whenRefused = IGNORE_THE_REFUSAL) => watchFor({ kind: "active_stream_tab" }, (watched) => watched.subject === "active_stream_tab" && listener(watched.reading), whenRefused),
      watchSelection: (listener, whenRefused = IGNORE_THE_REFUSAL) => watchFor({ kind: "selection" }, (watched) => watched.subject === "selection" && listener(watched.reading), whenRefused),
      watchStreamGraph: (stream, listener, whenRefused = IGNORE_THE_REFUSAL) => watchFor({ kind: "stream_graph", stream }, (watched) => watched.subject === "stream_graph" && listener(watched.reading), whenRefused),
      watchNodeCatalog: (stream, listener, whenRefused = IGNORE_THE_REFUSAL) => watchFor({ kind: "node_catalog", stream }, (watched) => watched.subject === "node_catalog" && listener(watched.reading), whenRefused),
      watchProjectLog: (projectFolder, listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watchFor({ kind: "project_log", project_folder: projectFolder }, (watched) => watched.subject === "project_log" && listener(watched.reading), whenRefused),
      watchProjectNodeTypes: (projectFolder, listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watchFor({ kind: "project_node_types", project_folder: projectFolder }, (watched) => watched.subject === "project_node_types" && listener(watched.reading), whenRefused),
      watchProjectTransactions: (projectFolder, listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watchFor({ kind: "project_transactions", project_folder: projectFolder }, (watched) => watched.subject === "project_transactions" && listener(watched.reading), whenRefused),
      watchPortViewer: (target, onEvent, whenRefused = IGNORE_THE_REFUSAL) =>
        watchFor({ kind: "port_viewer", target }, (watched) => watched.subject === "port_viewer" && onEvent(watched.reading.kind === "image_bitmap" ? imageFrameOf(watched.reading) : watched.reading), whenRefused),
      watchInput: (input, onEvent, whenRefused = IGNORE_THE_REFUSAL) =>
        watchFor({ kind: "input", input }, (watched) => watched.subject === "input" && onEvent(watched.reading.kind === "image_bitmap" ? imageFrameOf(watched.reading) : watched.reading), whenRefused),
      watchSettings: (listener) => watchFor({ kind: "settings" }, (watched) => watched.subject === "settings" && listener(settingsOf(watched.reading)), IGNORE_THE_REFUSAL),
      watchOpenedOn: (listener) => watchFor({ kind: "opened_on" }, (watched) => watched.subject === "opened_on" && listener(watched.reading), IGNORE_THE_REFUSAL),
      watchHeaderRow: (listener) => watchFor({ kind: "header_row" }, (watched) => watched.subject === "header_row" && listener(watched.reading), IGNORE_THE_REFUSAL),
      select: (selection) => ask({ kind: "select", selection }).then(doneOf),
      openStreamTab: (streamTab) => ask({ kind: "open_stream_tab", stream_tab: streamTab }).then(doneOf),
      openView: (viewTypeId, on) => ask({ kind: "open_view", view_type_id: viewTypeId, on }).then(doneOf),
      rememberSettings: (settings) => ask({ kind: "remember_settings", settings }).then(doneOf),
      readProjectFile: (file) =>
        ask({ kind: "read_project_file", file }).then((answer): ProjectFileReading => {
          if (answer.kind === "project_file_read") return { kind: "read", file_read: answer.file_read };
          return { kind: "not_read", because: answer.kind === "refused" ? answer.because : `Tato Studio answered with ${answer.kind}.` };
        }),
      saveProjectFile: (file, text, basedOnVersion) =>
        ask({ kind: "save_project_file", file, text, based_on_version: basedOnVersion }).then((answer): ProjectFileSaving => {
          if (answer.kind === "project_file_saved") return { kind: "saved", version: answer.version };
          return { kind: "not_saved", because: answer.kind === "refused" ? answer.because : `Tato Studio answered with ${answer.kind}.` };
        }),
      listProjectFiles: (projectFolder) =>
        ask({ kind: "list_project_files", project_folder: projectFolder }).then((answer): ProjectFilesListing => {
          if (answer.kind === "project_files_listed") return { kind: "listed", project_files: answer.project_files };
          return { kind: "not_listed", because: answer.kind === "refused" ? answer.because : `Tato Studio answered with ${answer.kind}.` };
        }),
      undoInTheProject: (projectFolder, author) => ask({ kind: "undo_in_the_project", project_folder: projectFolder, author }).then(transactionApplyingOf),
      redoInTheProject: (projectFolder, author) => ask({ kind: "redo_in_the_project", project_folder: projectFolder, author }).then(transactionApplyingOf),
      transactInTheProject: (projectFolder, operations, sending) =>
        ask({ kind: "transact_in_the_project", project_folder: projectFolder, operations: [...operations], mode: sending.mode, idempotency_key: sending.idempotencyKey }).then(graphTransactionApplyingOf),
      readThePersonEditing: () =>
        ask({ kind: "read_the_person_editing" }).then((answer): ThePersonEditingReading => {
          if (answer.kind === "the_person_editing") return { kind: "read", author: answer.author };
          return { kind: "not_read", because: answer.kind === "refused" ? answer.because : `Tato Studio answered with ${answer.kind}.` };
        }),
      connectToPythonLanguageServer: (projectFolder, onEvent) => {
        const { watchId, stopWatching } = watch(
          { kind: "python_language_server", project_folder: projectFolder },
          {
            onWatched: (watched) => {
              if (watched.subject === "python_language_server") onEvent(watched.reading);
            },
            whenRefused: (because) => onEvent({ kind: "ended", because }),
          },
        );
        return {
          send: (message) => void ask({ kind: "send_to_python_language_server", watch_id: watchId, message }),
          close: stopWatching,
        };
      },
      sendOutput: async (output, payload) => {
        if (grant.pictures_cross_as === "video_frame" || !isAVideoFrame(payload)) return doneOf(await ask({ kind: "send_output", output }, payload));
        const imageBitmap = await createImageBitmap(payload);
        payload.close();
        return doneOf(await ask({ kind: "send_output", output }, imageBitmap));
      },
      close: () => {
        if (isClosed) return;
        isClosed = true;
        watchesHeldById.clear();
        for (const answerWaiter of answerWaitersByAskId.values()) answerWaiter({ kind: "refused", because: CLOSED_BECAUSE });
        answerWaitersByAskId.clear();
        port.removeEventListener("message", onPortMessage);
        port.close();
      },
    });
  });
}

/** The view's connection, once Studio hands `viewWindow`'s frame its port and says what it granted. */
export function connectToTatoApp(viewWindow: Window = window): Promise<TatoAppViewConnection> {
  return new Promise((resolveConnection) => {
    const onHandover = (event: MessageEvent<unknown>) => {
      const port = event.ports[0];
      const isTheHandover = typeof event.data === "object" && event.data !== null && "kind" in event.data && event.data.kind === VIEW_PORT_HANDOVER;
      if (event.source !== viewWindow.parent || !isTheHandover || port === undefined) return;
      viewWindow.removeEventListener("message", onHandover);
      resolveConnection(connectToTatoAppOverPort(port));
    };
    viewWindow.addEventListener("message", onHandover);
  });
}
