// The studio's end of a project's view's MessagePort: each message the view sends is checked against
// what it was granted, then answered from the same services a first-party view is handed. A
// full-access view is granted every capability; a sandboxed one only what its manifest lists.

import { STUDIO_VIEW_CAPABILITIES, type StudioViewCapability, type StudioViewManifest } from "../../shared/studio_view_manifest";
import type { PortViewerConnection, StopWatching } from "./studio_view_contract";
import { STUDIO_VIEW_NODE_ISSUE, type StudioViewInputWiring } from "./studio_view_node_wiring";
import type { StudioViewHostServices } from "./studio_view_type_registry";
import {
  capabilityToAsk,
  capabilityToWatch,
  messageFromTheStudioView,
  type MessageFromTheStudioHost,
  type StudioViewAsk,
  type StudioViewAskAnswer,
  type StudioViewInputEventOnThePort,
  type StudioViewWatchedReading,
  type StudioViewWatchedSubject,
} from "./studio_view_wire_protocol";

/** The parts of a `MessagePort` the bridge uses, so a test can stand in for one. */
export interface StudioViewMessagePort {
  postMessage(message: MessageFromTheStudioHost, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  start(): void;
  close(): void;
}

interface InputWatch {
  input: string;
  wiringAsJson: string;
  portViewerConnection: PortViewerConnection | null;
}

/** Whether `payload`, sent beside an output ask, is a picture the studio now holds and must close. */
function isAPictureToClose(payload: unknown): payload is ImageBitmap | VideoFrame {
  return (typeof ImageBitmap !== "undefined" && payload instanceof ImageBitmap) || (typeof VideoFrame !== "undefined" && payload instanceof VideoFrame);
}

/** Turns a port viewer's `VideoFrame` into the `ImageBitmap` that crosses into a sandboxed view's frame. */
export type ImageBitmapOfTheVideoFrame = (videoFrame: VideoFrame) => Promise<ImageBitmap>;

const IMAGE_BITMAP_OF_THE_VIDEO_FRAME: ImageBitmapOfTheVideoFrame = (videoFrame) => createImageBitmap(videoFrame);

/** Serves one view of `viewTypeId`, declared by `manifest`, over `port`, reading through `hostServices` and its inputs through `inputWiring`; a sandboxed view's Image frames go through `imageBitmapOfTheVideoFrame`. */
export class ProjectStudioViewBridge {
  private readonly grantedCapabilities: readonly StudioViewCapability[];
  private readonly stopWatchingByWatchId = new Map<number, StopWatching>();
  private readonly inputWatchesByWatchId = new Map<number, InputWatch>();
  private isClosed = false;

  private readonly onMessageFromTheView = (event: MessageEvent<unknown>): void => {
    const sentPayload: unknown = typeof event.data === "object" && event.data !== null && "payload" in event.data ? event.data.payload : null;
    if (isAPictureToClose(sentPayload)) sentPayload.close();
    if (this.isClosed) return;
    const message = messageFromTheStudioView(event.data);
    if (message === null) return;
    if (message.kind === "watch") this.startWatching(message.watch_id, message.subject);
    else if (message.kind === "stop_watching") this.stopWatching(message.watch_id);
    else this.send({ kind: "answered", ask_id: message.ask_id, answer: this.answerTheAsk(message.ask) });
  };

  constructor(
    private readonly port: StudioViewMessagePort,
    private readonly viewTypeId: string,
    private readonly manifest: StudioViewManifest,
    private readonly hostServices: StudioViewHostServices,
    private inputWiring: Record<string, StudioViewInputWiring>,
    private readonly imageBitmapOfTheVideoFrame: ImageBitmapOfTheVideoFrame = IMAGE_BITMAP_OF_THE_VIDEO_FRAME,
  ) {
    this.grantedCapabilities = manifest.sandboxed ? manifest.capabilities : STUDIO_VIEW_CAPABILITIES;
  }

  /** Tell the view what it was granted, and answer its messages from now on. */
  start(): void {
    this.port.addEventListener("message", this.onMessageFromTheView);
    this.port.start();
    this.send({
      kind: "hello",
      grant: {
        view_type_id: this.viewTypeId,
        sandboxed: this.manifest.sandboxed,
        contract: this.manifest.contract,
        inputs: this.manifest.inputs,
        outputs: this.manifest.outputs,
        capabilities: [...this.grantedCapabilities],
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

  /** Stop every watch and port viewer the view holds, and close its port. */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    for (const stopWatching of this.stopWatchingByWatchId.values()) stopWatching();
    this.stopWatchingByWatchId.clear();
    for (const inputWatch of this.inputWatchesByWatchId.values()) inputWatch.portViewerConnection?.close();
    this.inputWatchesByWatchId.clear();
    this.port.removeEventListener("message", this.onMessageFromTheView);
    this.port.close();
  }

  private send(message: MessageFromTheStudioHost, transfer: Transferable[] = []): void {
    if (!this.isClosed) this.port.postMessage(message, transfer);
  }

  private refusalForMissing(capability: string): string {
    return `${this.manifest.title} runs sandboxed and does not list ${capability} in its tatolab_view.json, so the studio does not serve it.`;
  }

  private wiringOfTheInput(input: string): StudioViewInputWiring {
    return this.inputWiring[input] ?? { kind: "unwired", because: `Nothing is wired into ${input}.` };
  }

  private startWatching(watchId: number, subject: StudioViewWatchedSubject): void {
    if (this.stopWatchingByWatchId.has(watchId) || this.inputWatchesByWatchId.has(watchId)) {
      this.send({ kind: "watch_refused", watch_id: watchId, because: `The view already watches under ${watchId}.` });
      return;
    }
    const capability = capabilityToWatch(subject);
    if (capability !== null && !this.grantedCapabilities.includes(capability)) {
      this.send({ kind: "watch_refused", watch_id: watchId, because: this.refusalForMissing(capability) });
      return;
    }
    const sendReading = (watched: StudioViewWatchedReading) => this.send({ kind: "watched", watch_id: watchId, watched });
    switch (subject.kind) {
      case "open_project":
        this.stopWatchingByWatchId.set(watchId, this.hostServices.watchOpenProject((reading) => sendReading({ subject: "open_project", reading })));
        return;
      case "listed_streams":
        this.stopWatchingByWatchId.set(watchId, this.hostServices.watchListedStreams((reading) => sendReading({ subject: "listed_streams", reading })));
        return;
      case "active_stream_tab":
        this.stopWatchingByWatchId.set(watchId, this.hostServices.watchActiveStreamTab((reading) => sendReading({ subject: "active_stream_tab", reading })));
        return;
      case "selection":
        this.stopWatchingByWatchId.set(watchId, this.hostServices.watchSelection((reading) => sendReading({ subject: "selection", reading })));
        return;
      case "stream_graph":
        this.stopWatchingByWatchId.set(watchId, this.hostServices.watchStreamGraph(subject.stream, (reading) => sendReading({ subject: "stream_graph", reading })));
        return;
      case "node_catalog":
        this.stopWatchingByWatchId.set(watchId, this.hostServices.watchNodeCatalog(subject.stream, (reading) => sendReading({ subject: "node_catalog", reading })));
        return;
      case "input":
        if (!this.manifest.inputs.some((declaredInput) => declaredInput.name === subject.input)) {
          this.send({ kind: "watch_refused", watch_id: watchId, because: `${this.manifest.title} declares no input named ${subject.input}.` });
          return;
        }
        this.inputWatchesByWatchId.set(watchId, this.readTheInput(watchId, subject.input));
        return;
    }
  }

  private readTheInput(watchId: number, input: string): InputWatch {
    const wiring = this.wiringOfTheInput(input);
    const sendInputEvent = (inputEvent: StudioViewInputEventOnThePort, transfer: Transferable[]) =>
      this.send({ kind: "watched", watch_id: watchId, watched: { subject: "input", reading: inputEvent } }, transfer);
    if (wiring.kind === "unwired") {
      sendInputEvent(wiring, []);
      return { input, wiringAsJson: JSON.stringify(wiring), portViewerConnection: null };
    }
    let isWatched = true;
    const watchedConnection = this.hostServices.watchPortViewer(wiring.target, (portViewerEvent) => {
      if (portViewerEvent.kind !== "image_frame") {
        sendInputEvent(portViewerEvent, []);
        return;
      }
      if (!this.manifest.sandboxed) {
        if (this.isClosed) portViewerEvent.video_frame.close();
        else sendInputEvent(portViewerEvent, [portViewerEvent.video_frame]);
        return;
      }
      const { video_frame: videoFrame, format_wire_name: formatWireName, skipped_since_last_read: skippedSinceLastRead } = portViewerEvent;
      const timestampMicroseconds = videoFrame.timestamp;
      this.imageBitmapOfTheVideoFrame(videoFrame).then(
        (imageBitmap) => {
          videoFrame.close();
          if (!isWatched || this.isClosed) imageBitmap.close();
          else sendInputEvent(
              {
                kind: "image_bitmap",
                image_bitmap: imageBitmap,
                timestamp_microseconds: timestampMicroseconds,
                format_wire_name: formatWireName,
                skipped_since_last_read: skippedSinceLastRead,
              },
              [imageBitmap],
            );
        },
        () => videoFrame.close(),
      );
    });
    const portViewerConnection: PortViewerConnection = {
      close: () => {
        isWatched = false;
        watchedConnection.close();
      },
    };
    return { input, wiringAsJson: JSON.stringify(wiring), portViewerConnection };
  }

  private stopWatching(watchId: number): void {
    this.stopWatchingByWatchId.get(watchId)?.();
    this.stopWatchingByWatchId.delete(watchId);
    this.inputWatchesByWatchId.get(watchId)?.portViewerConnection?.close();
    this.inputWatchesByWatchId.delete(watchId);
  }

  private answerTheAsk(ask: StudioViewAsk): StudioViewAskAnswer {
    const capability = capabilityToAsk(ask);
    if (capability !== null && !this.grantedCapabilities.includes(capability)) return { kind: "refused", because: this.refusalForMissing(capability) };
    switch (ask.kind) {
      case "select":
        this.hostServices.select(ask.selection);
        return { kind: "done" };
      case "open_stream_tab":
        this.hostServices.openStreamTab(ask.stream_tab);
        return { kind: "done" };
      case "send_output":
        if (!this.manifest.outputs.some((declaredOutput) => declaredOutput.name === ask.output)) {
          return { kind: "refused", because: `${this.manifest.title} declares no output named ${ask.output}.` };
        }
        return {
          kind: "refused",
          because: `What a view sends on ${ask.output} reaches its stream once the runtime runs a view's node (${STUDIO_VIEW_NODE_ISSUE}); until then the studio holds nothing it sends.`,
        };
    }
  }
}
