// What a view people write is built on, the SDK published as `@tatolab/studio-view`: the view
// contract spoken over the MessagePort the studio hands the view's frame, with the same types a
// first-party view reads. It runs inside the view's own frame and imports nothing of the window.

import {
  STUDIO_VIEW_PORT_HANDOVER,
  isMessageFromTheStudioHost,
  type MessageFromTheStudioHost,
  type MessageFromTheStudioView,
  type StudioViewAsk,
  type StudioViewAskAnswer,
  type StudioViewGrant,
  type StudioViewInputEvent,
  type StudioViewInputEventOnThePort,
  type StudioViewOutputPayload,
  type StudioViewWatchedReading,
  type StudioViewWatchedSubject,
} from "../view_host/studio_view_wire_protocol";
import type {
  ListedStreamsReading,
  NodeCatalogReading,
  OpenProjectReading,
  StopWatching,
  StreamGraphReading,
  StreamTabAddress,
  StudioSelection,
} from "../view_host/studio_view_contract";

export type { StudioViewAskAnswer, StudioViewGrant, StudioViewInputEvent, StudioViewOutputPayload } from "../view_host/studio_view_wire_protocol";

/** Called with the studio's words when it refuses a watch the view's grant does not cover. */
export type WhenTheStudioRefuses = (because: string) => void;

/** A view's connection to the studio: what it was granted, and each part of the contract it may read or ask for. */
export interface TatoStudioViewConnection {
  readonly grant: StudioViewGrant;
  watchOpenProject(listener: (reading: OpenProjectReading) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  watchListedStreams(listener: (reading: ListedStreamsReading) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  watchActiveStreamTab(listener: (activeStreamTab: StreamTabAddress | null) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  /** Needs `read.selection`. */
  watchSelection(listener: (selection: StudioSelection) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  /** Needs `read.stream_graph`. */
  watchStreamGraph(stream: string, listener: (reading: StreamGraphReading) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  /** Needs `read.stream_graph`. */
  watchNodeCatalog(stream: string, listener: (reading: NodeCatalogReading) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  /** What the output wired into the view's input `input` carries; an Image frame arrives as a `VideoFrame` the view closes once drawn. */
  watchInput(input: string, onEvent: (inputEvent: StudioViewInputEvent) => void, whenRefused?: WhenTheStudioRefuses): StopWatching;
  /** Needs `write.selection`. */
  select(selection: StudioSelection): Promise<StudioViewAskAnswer>;
  /** Needs `write.selection`. */
  openStreamTab(streamTab: StreamTabAddress): Promise<StudioViewAskAnswer>;
  /** Send `payload` on the view's output `output`: a `VideoFrame` or `ImageBitmap` for Image, which the studio then owns, or JSON. */
  sendOutput(output: string, payload: StudioViewOutputPayload): Promise<StudioViewAskAnswer>;
  /** Stop every watch and close the port. */
  close(): void;
}

interface WatchHeld {
  onWatched: (watched: StudioViewWatchedReading) => void;
  whenRefused: WhenTheStudioRefuses;
}

const IGNORE_THE_REFUSAL: WhenTheStudioRefuses = () => undefined;

function isAVideoFrame(payload: StudioViewOutputPayload): payload is VideoFrame {
  return typeof VideoFrame !== "undefined" && payload instanceof VideoFrame;
}

/** The picture `payload` hands the studio, which crosses the port transferred rather than copied. */
function picturesToTransferOf(payload: StudioViewOutputPayload): Transferable[] {
  if (isAVideoFrame(payload)) return [payload];
  if (typeof ImageBitmap !== "undefined" && payload instanceof ImageBitmap) return [payload];
  return [];
}

/** `inputEvent` as the view reads it: an Image frame's `ImageBitmap` made a `VideoFrame` again, at its frame's timestamp. */
function inputEventInTheView(inputEvent: StudioViewInputEventOnThePort): StudioViewInputEvent {
  if (inputEvent.kind !== "image_bitmap") return inputEvent;
  const videoFrame = new VideoFrame(inputEvent.image_bitmap, { timestamp: inputEvent.timestamp_microseconds });
  inputEvent.image_bitmap.close();
  return { kind: "image_frame", video_frame: videoFrame, format_wire_name: inputEvent.format_wire_name, skipped_since_last_read: inputEvent.skipped_since_last_read };
}

/** The view's connection over `port`, once the studio has said what it granted. */
export function connectToTatoStudioOverPort(port: MessagePort): Promise<TatoStudioViewConnection> {
  return new Promise((resolveConnection) => {
    const watchesHeldById = new Map<number, WatchHeld>();
    const answerWaitersByAskId = new Map<number, (answer: StudioViewAskAnswer) => void>();
    let nextId = 1;
    let isClosed = false;

    const send = (message: MessageFromTheStudioView & { payload?: StudioViewOutputPayload }, transfer: Transferable[] = []) => {
      if (!isClosed) port.postMessage(message, transfer);
    };
    const watch = (subject: StudioViewWatchedSubject, watchHeld: WatchHeld): StopWatching => {
      const watchId = nextId++;
      watchesHeldById.set(watchId, watchHeld);
      send({ kind: "watch", watch_id: watchId, subject });
      return () => {
        if (!watchesHeldById.delete(watchId)) return;
        send({ kind: "stop_watching", watch_id: watchId });
      };
    };
    const ask = (askedFor: StudioViewAsk, payload?: StudioViewOutputPayload): Promise<StudioViewAskAnswer> => {
      if (isClosed) return Promise.resolve({ kind: "refused", because: "The view closed its connection to the studio." });
      const askId = nextId++;
      const transfer = payload === undefined ? [] : picturesToTransferOf(payload);
      return new Promise((resolveAnswer) => {
        answerWaitersByAskId.set(askId, resolveAnswer);
        send(payload === undefined ? { kind: "ask", ask_id: askId, ask: askedFor } : { kind: "ask", ask_id: askId, ask: askedFor, payload }, transfer);
      });
    };

    const onMessageFromTheStudio = (message: MessageFromTheStudioHost) => {
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
      if (isMessageFromTheStudioHost(event.data)) onMessageFromTheStudio(event.data);
    };
    port.addEventListener("message", onPortMessage);
    port.start();

    const connectionGranted = (grant: StudioViewGrant): TatoStudioViewConnection => ({
      grant,
      watchOpenProject: (listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "open_project" }, { onWatched: (watched) => {
          if (watched.subject === "open_project") listener(watched.reading);
        }, whenRefused }),
      watchListedStreams: (listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "listed_streams" }, { onWatched: (watched) => {
          if (watched.subject === "listed_streams") listener(watched.reading);
        }, whenRefused }),
      watchActiveStreamTab: (listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "active_stream_tab" }, { onWatched: (watched) => {
          if (watched.subject === "active_stream_tab") listener(watched.reading);
        }, whenRefused }),
      watchSelection: (listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "selection" }, { onWatched: (watched) => {
          if (watched.subject === "selection") listener(watched.reading);
        }, whenRefused }),
      watchStreamGraph: (stream, listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "stream_graph", stream }, { onWatched: (watched) => {
          if (watched.subject === "stream_graph") listener(watched.reading);
        }, whenRefused }),
      watchNodeCatalog: (stream, listener, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "node_catalog", stream }, { onWatched: (watched) => {
          if (watched.subject === "node_catalog") listener(watched.reading);
        }, whenRefused }),
      watchInput: (input, onEvent, whenRefused = IGNORE_THE_REFUSAL) =>
        watch({ kind: "input", input }, { onWatched: (watched) => {
          if (watched.subject === "input") onEvent(inputEventInTheView(watched.reading));
        }, whenRefused }),
      select: (selection) => ask({ kind: "select", selection }),
      openStreamTab: (streamTab) => ask({ kind: "open_stream_tab", stream_tab: streamTab }),
      sendOutput: async (output, payload) => {
        if (!grant.sandboxed || !isAVideoFrame(payload)) return ask({ kind: "send_output", output }, payload);
        const imageBitmap = await createImageBitmap(payload);
        payload.close();
        return ask({ kind: "send_output", output }, imageBitmap);
      },
      close: () => {
        if (isClosed) return;
        isClosed = true;
        watchesHeldById.clear();
        for (const answerWaiter of answerWaitersByAskId.values()) answerWaiter({ kind: "refused", because: "The view closed its connection to the studio." });
        answerWaitersByAskId.clear();
        port.removeEventListener("message", onPortMessage);
        port.close();
      },
    });
  });
}

/** The view's connection, once the studio hands `viewWindow`'s frame its port and says what it granted. */
export function connectToTatoStudio(viewWindow: Window = window): Promise<TatoStudioViewConnection> {
  return new Promise((resolveConnection) => {
    const onHandover = (event: MessageEvent<unknown>) => {
      const port = event.ports[0];
      const isTheHandover = typeof event.data === "object" && event.data !== null && "kind" in event.data && event.data.kind === STUDIO_VIEW_PORT_HANDOVER;
      if (event.source !== viewWindow.parent || !isTheHandover || port === undefined) return;
      viewWindow.removeEventListener("message", onHandover);
      resolveConnection(connectToTatoStudioOverPort(port));
    };
    viewWindow.addEventListener("message", onHandover);
  });
}
