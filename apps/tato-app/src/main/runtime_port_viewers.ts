// The Node visualizer's reads of any output port of any running node: one `/control/ws` connection for every
// viewer the app's windows hold, one runtime viewer per port however many windows show it, and a
// read of each port's latest message on every tick. An Image frame goes to each window as a shared
// texture and is released once every window has let go of it; a frame a shared texture cannot
// carry goes as its pixels, and every other family's message goes read by its family.

import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { PortViewerEvent, PortViewerImageFrameFacts, PortViewerTarget, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import type { OpenedRuntimeViewer, RuntimeViewerTarget } from "./runtime_viewer_control_connection.js";
import { portViewerMessageReadingOf } from "./port_viewer_message_reading.js";
import { failedWith, succeeded, describeCaughtFailure, type Result } from "./result.js";
import {
  sharedTextureImportOfARuntimeViewerFrame,
  type RuntimeViewerChannelReaderOfTheAddon,
  type RuntimeViewerMessageRead,
  type SharedTextureImportOfARuntimeViewerFrame,
} from "./runtime_viewer_image_frame_import.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The connection port viewers are opened over: `RuntimeViewerControlConnection`. */
export interface RuntimeViewerConnection {
  openViewer(target: RuntimeViewerTarget): Promise<Result<OpenedRuntimeViewer, LocalApiRequestFailure>>;
  closeViewer(viewer: string): Promise<Result<string, LocalApiRequestFailure>>;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  isOpen(): boolean;
  close(): void;
}

/** A studio window or a view popped out of one: where its port viewers' events and Image frames go. */
export interface WindowShowingPortViewers {
  sendTheWindowAPortViewerEvent(event: PortViewerEvent): void;
  /** Hand the window `imageFrame` as a shared texture; `whenTheWindowLetsGo` is called once the window, and Electron, hold no reference to it, whether the hand-over succeeded or not. */
  sendTheWindowAnImageFrame(
    imageFrame: SharedTextureImportOfARuntimeViewerFrame,
    frameFacts: PortViewerImageFrameFacts,
    whenTheWindowLetsGo: () => void,
  ): Promise<Result<void, string>>;
}

/** What the port viewers reach: the runtime, the viewer addon, and the clock their reads tick on. */
export interface RuntimePortViewersSources {
  openTheViewerConnection(): Promise<Result<RuntimeViewerConnection, LocalApiRequestFailure>>;
  /** The addon's reader of the channel `openedViewer` names, as the iceoryx2 node `viewerNodeName`; refused in the addon's words, or because this build carries no addon. */
  openAChannelReader(openedViewer: OpenedRuntimeViewer, viewerNodeName: string): Result<RuntimeViewerChannelReaderOfTheAddon, string>;
  /** The process that imports the frames, which `open_viewer` admits on macOS: the main process. */
  viewerProcessId: number;
  /** Call `then` once, `afterMs` from now. */
  waitThen(afterMs: number, then: () => void): void;
  /** The state the runtime's last listing gives the stream `stream`, or `null` when it lists no such stream. */
  streamStateTheRuntimeListsNow(stream: string): string | null;
  tatolabAppLog: TatolabAppLog;
}

/** How long a port viewer waits, after its connection to the runtime closed or its stream was not yet running, before it opens the port again. */
export const PORT_VIEWER_REOPEN_AFTER_MS = 1_000;

/** One window's port viewer. */
interface PortViewerSubscription {
  target: PortViewerTarget;
  windowShowingPortViewers: WindowShowingPortViewers;
}

/** One runtime viewer held open, shared by every port viewer of its port. */
interface RuntimeViewerHeldOpen {
  openedViewer: OpenedRuntimeViewer;
  channelReader: RuntimeViewerChannelReaderOfTheAddon;
  aReadIsUnderWay: boolean;
  aWriteCameDuringTheRead: boolean;
}

/** Why a runtime viewer did not open, and whether it was `open_viewer`'s own refusal rather than the connection's or the addon's. */
interface RuntimeViewerOpenFailure {
  words: string;
  theRuntimeRefusedToOpenIt: boolean;
}

/** The listed states of a stream whose nodes run once its project is started, resumed or done stopping, so `open_viewer`'s refusal on it is waited out. */
const STREAM_STATES_A_PORT_VIEWER_WAITS_OUT: ReadonlySet<string> = new Set(["stopped", "paused", "preparing", "stopping"]);

/** The listed states of a stream a load or a stop is working on: its nodes, and the channels a runtime viewer held open on them, are being replaced. */
const STREAM_STATES_WHILE_ITS_NODES_ARE_REPLACED: ReadonlySet<string> = new Set(["preparing", "stopping"]);

/** Whether the runtime lists `listedStream` with a stream action working on it, which replaces its nodes. */
function aStreamActionReplacesTheNodesOf(listedStream: ListedStream): boolean {
  return listedStream.action !== null || STREAM_STATES_WHILE_ITS_NODES_ARE_REPLACED.has(listedStream.state);
}

function portViewerTargetKey(target: PortViewerTarget): string {
  return JSON.stringify([target.stream, target.node_id, target.port]);
}

/** Every port viewer the app's windows hold, by the id each was opened under. */
export class RuntimePortViewers {
  private readonly subscriptionsByPortViewer = new Map<string, PortViewerSubscription>();
  private readonly runtimeViewersByTargetKey = new Map<string, RuntimeViewerHeldOpen>();
  private readonly targetKeysBeingOpened = new Set<string>();
  private readonly targetKeysAwaitingAReopen = new Set<string>();
  private readonly streamsSeenWhileTheirNodesWereReplaced = new Set<string>();
  private viewerConnection: RuntimeViewerConnection | null = null;
  private portViewersOpened = 0;

  constructor(private readonly sources: RuntimePortViewersSources) {}

  /** Open a port viewer of `target` for `windowShowingPortViewers`, answering the id its events arrive under; refused in the runtime's or the addon's words. */
  async openAPortViewer(target: PortViewerTarget, windowShowingPortViewers: WindowShowingPortViewers): Promise<Result<{ port_viewer: string }, string>> {
    const runtimeViewer = await this.theRuntimeViewerOf(target);
    const theStreamIsNotYetRunning = !runtimeViewer.ok && this.theRuntimeRefusedAStreamThatIsNotYetRunning(target, runtimeViewer.failure);
    if (!runtimeViewer.ok && !theStreamIsNotYetRunning) return failedWith(runtimeViewer.failure.words);
    this.portViewersOpened += 1;
    const portViewer = `port-viewer-${this.portViewersOpened}`;
    this.subscriptionsByPortViewer.set(portViewer, { target, windowShowingPortViewers });
    if (theStreamIsNotYetRunning) this.reopenAfterAWait(portViewerTargetKey(target));
    return succeeded({ port_viewer: portViewer });
  }

  /** Close the port viewer `portViewer` that `windowShowingPortViewers` opened, and its runtime viewer once no window shows that port; one already closed, or another window's, is left as it is. */
  closeAPortViewer(portViewer: string, windowShowingPortViewers: WindowShowingPortViewers): void {
    if (this.subscriptionsByPortViewer.get(portViewer)?.windowShowingPortViewers !== windowShowingPortViewers) return;
    this.closeThePortViewer(portViewer);
  }

  private closeThePortViewer(portViewer: string): void {
    const subscription = this.subscriptionsByPortViewer.get(portViewer);
    if (subscription === undefined) return;
    this.subscriptionsByPortViewer.delete(portViewer);
    const targetKey = portViewerTargetKey(subscription.target);
    if (this.subscriptionsOf(targetKey).length === 0) this.closeTheRuntimeViewer(targetKey);
  }

  /** Open again each runtime viewer of a stream the runtime listed with a stream action working on it and now lists without one, and not stopped between a reload's stop and its start: a reload replaced the node it read, whose new channel the viewer held open does not carry. */
  noticeStatus(status: Pick<TatolabStatus, "streams">): void {
    for (const listedStream of status.streams ?? []) {
      if (aStreamActionReplacesTheNodesOf(listedStream)) {
        this.streamsSeenWhileTheirNodesWereReplaced.add(listedStream.stream);
      } else if (listedStream.state !== "stopped" && this.streamsSeenWhileTheirNodesWereReplaced.delete(listedStream.stream)) {
        this.reopenEveryRuntimeViewerOfTheStream(listedStream.stream);
      }
    }
  }

  private reopenEveryRuntimeViewerOfTheStream(stream: string): void {
    for (const [targetKey, heldOpen] of [...this.runtimeViewersByTargetKey]) {
      if (heldOpen.openedViewer.stream !== stream) continue;
      this.closeTheRuntimeViewer(targetKey);
      for (const [portViewer, subscription] of this.subscriptionsOf(targetKey)) {
        subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({
          port_viewer: portViewer,
          kind: "reopening",
          because: `${heldOpen.openedViewer.node_name} › ${heldOpen.openedViewer.port} was replaced as its project loaded again.`,
        });
      }
      this.reopenAfterAWait(targetKey);
    }
  }

  /** Close every port viewer `windowShowingPortViewers` opened, as it closes. */
  closeThePortViewersOf(windowShowingPortViewers: WindowShowingPortViewers): void {
    for (const [portViewer, subscription] of [...this.subscriptionsByPortViewer]) {
      if (subscription.windowShowingPortViewers === windowShowingPortViewers) this.closeThePortViewer(portViewer);
    }
  }

  /** Close every port viewer and the connection they share, as the app quits. */
  closeEveryPortViewer(): void {
    for (const portViewer of [...this.subscriptionsByPortViewer.keys()]) this.closeThePortViewer(portViewer);
    this.viewerConnection?.close();
    this.viewerConnection = null;
  }

  private theRuntimeRefusedAStreamThatIsNotYetRunning(target: PortViewerTarget, openFailure: RuntimeViewerOpenFailure): boolean {
    const listedState = this.sources.streamStateTheRuntimeListsNow(target.stream);
    return openFailure.theRuntimeRefusedToOpenIt && listedState !== null && STREAM_STATES_A_PORT_VIEWER_WAITS_OUT.has(listedState);
  }

  private subscriptionsOf(targetKey: string): [string, PortViewerSubscription][] {
    return [...this.subscriptionsByPortViewer].filter(([, subscription]) => portViewerTargetKey(subscription.target) === targetKey);
  }

  private async theViewerConnection(): Promise<Result<RuntimeViewerConnection, RuntimeViewerOpenFailure>> {
    if (this.viewerConnection !== null && this.viewerConnection.isOpen()) return succeeded(this.viewerConnection);
    const opened = await this.sources.openTheViewerConnection();
    if (!opened.ok) return failedWith({ words: opened.failure.failureDescription, theRuntimeRefusedToOpenIt: false });
    if (this.viewerConnection !== null && this.viewerConnection.isOpen()) {
      opened.value.close();
      return succeeded(this.viewerConnection);
    }
    const viewerConnection = opened.value;
    this.viewerConnection = viewerConnection;
    viewerConnection.onClosed((whyItClosed) => this.reopenEveryRuntimeViewerAfter(viewerConnection, whyItClosed));
    return succeeded(viewerConnection);
  }

  private async theRuntimeViewerOf(target: PortViewerTarget): Promise<Result<RuntimeViewerHeldOpen, RuntimeViewerOpenFailure>> {
    const targetKey = portViewerTargetKey(target);
    const heldOpen = this.runtimeViewersByTargetKey.get(targetKey);
    if (heldOpen !== undefined) return succeeded(heldOpen);
    if (this.targetKeysBeingOpened.has(targetKey)) return failedWith({ words: `${target.node_id} › ${target.port} is already being opened`, theRuntimeRefusedToOpenIt: false });
    this.targetKeysBeingOpened.add(targetKey);
    const opened = await this.openTheRuntimeViewer(target);
    this.targetKeysBeingOpened.delete(targetKey);
    if (!opened.ok) return opened;
    this.runtimeViewersByTargetKey.set(targetKey, opened.value);
    this.readTheLatestMessage(targetKey, opened.value);
    return opened;
  }

  private async openTheRuntimeViewer(target: PortViewerTarget): Promise<Result<RuntimeViewerHeldOpen, RuntimeViewerOpenFailure>> {
    const viewerConnection = await this.theViewerConnection();
    if (!viewerConnection.ok) return viewerConnection;
    const openedViewer = await viewerConnection.value.openViewer({ ...target, viewer_process_id: this.sources.viewerProcessId });
    if (!openedViewer.ok) return failedWith({ words: openedViewer.failure.failureDescription, theRuntimeRefusedToOpenIt: openedViewer.failure.isTheRuntimesRefusal });
    const channelReader = this.sources.openAChannelReader(openedViewer.value, `tato-studio-viewer-${this.sources.viewerProcessId}`);
    if (!channelReader.ok) {
      void viewerConnection.value.closeViewer(openedViewer.value.viewer);
      return failedWith({ words: channelReader.failure, theRuntimeRefusedToOpenIt: false });
    }
    const targetKey = portViewerTargetKey(target);
    const heldOpen: RuntimeViewerHeldOpen = {
      openedViewer: openedViewer.value,
      channelReader: channelReader.value,
      aReadIsUnderWay: false,
      aWriteCameDuringTheRead: false,
    };
    try {
      heldOpen.channelReader.followWrites((failure) => this.heardFromTheWritesFollowed(targetKey, heldOpen, failure));
    } catch (followRefusal) {
      heldOpen.channelReader.close();
      void viewerConnection.value.closeViewer(openedViewer.value.viewer);
      return failedWith({ words: `the viewer could not follow the port's writes: ${describeCaughtFailure(followRefusal)}`, theRuntimeRefusedToOpenIt: false });
    }
    this.sources.tatolabAppLog.info("opened a runtime viewer", { viewer: openedViewer.value.viewer });
    return succeeded(heldOpen);
  }

  private closeTheRuntimeViewer(targetKey: string): void {
    const heldOpen = this.runtimeViewersByTargetKey.get(targetKey);
    if (heldOpen === undefined) return;
    this.runtimeViewersByTargetKey.delete(targetKey);
    heldOpen.channelReader.close();
    if (this.viewerConnection !== null && this.viewerConnection.isOpen()) void this.viewerConnection.closeViewer(heldOpen.openedViewer.viewer);
  }

  private endEveryPortViewerOf(targetKey: string, because: string): void {
    this.closeTheRuntimeViewer(targetKey);
    for (const [portViewer, subscription] of this.subscriptionsOf(targetKey)) {
      this.subscriptionsByPortViewer.delete(portViewer);
      subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({ port_viewer: portViewer, kind: "ended", because });
    }
  }

  private reopenEveryRuntimeViewerAfter(closedConnection: RuntimeViewerConnection, whyItClosed: string): void {
    if (this.viewerConnection !== closedConnection) return;
    this.viewerConnection = null;
    for (const [targetKey, heldOpen] of [...this.runtimeViewersByTargetKey]) {
      this.runtimeViewersByTargetKey.delete(targetKey);
      heldOpen.channelReader.close();
      for (const [portViewer, subscription] of this.subscriptionsOf(targetKey)) {
        subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({ port_viewer: portViewer, kind: "reopening", because: whyItClosed });
      }
      this.reopenAfterAWait(targetKey);
    }
  }

  private reopenAfterAWait(targetKey: string): void {
    if (this.targetKeysAwaitingAReopen.has(targetKey)) return;
    this.targetKeysAwaitingAReopen.add(targetKey);
    this.sources.waitThen(PORT_VIEWER_REOPEN_AFTER_MS, () => {
      this.targetKeysAwaitingAReopen.delete(targetKey);
      const subscriptions = this.subscriptionsOf(targetKey);
      const [firstSubscription] = subscriptions;
      if (firstSubscription === undefined || this.runtimeViewersByTargetKey.has(targetKey)) return;
      void this.theRuntimeViewerOf(firstSubscription[1].target).then((reopened) => {
        if (reopened.ok) {
          if (this.subscriptionsOf(targetKey).length === 0) this.closeTheRuntimeViewer(targetKey);
          return;
        }
        for (const [portViewer, subscription] of this.subscriptionsOf(targetKey)) {
          subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({ port_viewer: portViewer, kind: "reopening", because: reopened.failure.words });
        }
        this.reopenAfterAWait(targetKey);
      });
    });
  }

  private heardFromTheWritesFollowed(targetKey: string, heldOpen: RuntimeViewerHeldOpen, failure: Error | null): void {
    if (this.runtimeViewersByTargetKey.get(targetKey) !== heldOpen) return;
    if (failure !== null) {
      this.endEveryPortViewerOf(targetKey, `The viewer stopped reading ${heldOpen.openedViewer.node_name} › ${heldOpen.openedViewer.port}: ${failure.message}`);
      return;
    }
    this.readTheLatestMessage(targetKey, heldOpen);
  }

  private readTheLatestMessage(targetKey: string, heldOpen: RuntimeViewerHeldOpen): void {
    if (heldOpen.aReadIsUnderWay) {
      heldOpen.aWriteCameDuringTheRead = true;
      return;
    }
    heldOpen.aReadIsUnderWay = true;
    heldOpen.aWriteCameDuringTheRead = false;
    heldOpen.channelReader.readLatestMessage().then(
      (messageRead) => {
        heldOpen.aReadIsUnderWay = false;
        if (this.runtimeViewersByTargetKey.get(targetKey) !== heldOpen) {
          if (messageRead?.imageFrame) heldOpen.channelReader.releaseHeldImageFrame(messageRead.imageFrame.heldFrameId);
          return;
        }
        if (messageRead !== null) this.handTheMessageToItsWindows(targetKey, heldOpen, messageRead);
        if (heldOpen.aWriteCameDuringTheRead && this.runtimeViewersByTargetKey.get(targetKey) === heldOpen) this.readTheLatestMessage(targetKey, heldOpen);
      },
      (readRefusal: unknown) => {
        heldOpen.aReadIsUnderWay = false;
        if (this.runtimeViewersByTargetKey.get(targetKey) !== heldOpen) return;
        this.endEveryPortViewerOf(targetKey, `The viewer stopped reading ${heldOpen.openedViewer.node_name} › ${heldOpen.openedViewer.port}: ${describeCaughtFailure(readRefusal)}`);
      },
    );
  }

  private handTheMessageToItsWindows(targetKey: string, heldOpen: RuntimeViewerHeldOpen, messageRead: RuntimeViewerMessageRead): void {
    const subscriptions = this.subscriptionsOf(targetKey);
    const { imageFrame } = messageRead;
    if (imageFrame === null) {
      const reading = portViewerMessageReadingOf(messageRead);
      for (const [portViewer, subscription] of subscriptions) {
        subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({
          port_viewer: portViewer,
          kind: "message",
          reading,
          skipped_since_last_read: messageRead.skippedSinceLastRead,
        });
      }
      return;
    }
    const releaseTheFrame = () => heldOpen.channelReader.releaseHeldImageFrame(imageFrame.heldFrameId);
    const sharedTextureImport = sharedTextureImportOfARuntimeViewerFrame(imageFrame, messageRead.timestampNs);
    if (!sharedTextureImport.ok) {
      const { cpuReadBytes } = imageFrame;
      releaseTheFrame();
      if (cpuReadBytes === null) {
        this.endEveryPortViewerOf(targetKey, sharedTextureImport.failure);
        return;
      }
      for (const [portViewer, subscription] of subscriptions) {
        subscription.windowShowingPortViewers.sendTheWindowAPortViewerEvent({
          port_viewer: portViewer,
          kind: "image_pixels",
          width: imageFrame.width,
          height: imageFrame.height,
          format_wire_name: imageFrame.formatWireName,
          bytes_per_row: imageFrame.bytesPerRow,
          pixels: new Uint8Array(cpuReadBytes),
          skipped_since_last_read: messageRead.skippedSinceLastRead,
        });
      }
      return;
    }
    let windowsStillHoldingTheFrame = subscriptions.length;
    if (windowsStillHoldingTheFrame === 0) {
      releaseTheFrame();
      return;
    }
    const oneWindowLetGo = () => {
      windowsStillHoldingTheFrame -= 1;
      if (windowsStillHoldingTheFrame === 0) releaseTheFrame();
    };
    for (const [portViewer, subscription] of subscriptions) {
      const frameFacts: PortViewerImageFrameFacts = {
        port_viewer: portViewer,
        format_wire_name: imageFrame.formatWireName,
        skipped_since_last_read: messageRead.skippedSinceLastRead,
      };
      void subscription.windowShowingPortViewers.sendTheWindowAnImageFrame(sharedTextureImport.value, frameFacts, oneWindowLetGo).then((handedOver) => {
        if (!handedOver.ok) this.sources.tatolabAppLog.debug("a port viewer's frame did not reach its window", { port_viewer: portViewer, failure: handedOver.failure });
      });
    }
  }
}
