// What a runtime viewer held open reads of its port, on every write the port's node notifies of: its
// latest message, or every message for a Channels port, handed to each window showing the port. An Image
// frame goes as a shared texture and is released once every window has let go of it; a frame a shared
// texture cannot carry goes as its pixels; every other family's message goes read by its family. This is
// the frame lane: it runs once per frame, so it holds plain code only, and opening, closing and
// reopening the viewer are the port viewers' own.

import type { PortViewerEvent, PortViewerImageFrameFacts } from "../shared/tatolab_backend_contract.js";
import type { OpenedRuntimeViewer } from "./runtime_viewer_control_connection.js";
import { portViewerMessageReadingOf } from "./port_viewer_message_reading.js";
import { describeCaughtFailure, type Result } from "./result.js";
import {
  sharedTextureImportOfARuntimeViewerFrame,
  type RuntimeViewerChannelReaderOfTheAddon,
  type RuntimeViewerMessageRead,
  type SharedTextureImportOfARuntimeViewerFrame,
} from "./runtime_viewer_image_frame_import.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** A studio window or a view popped out of one: where its port viewers' events and Image frames go. */
export interface WindowShowingPortViewers {
  sendTheWindowAPortViewerEvent(event: PortViewerEvent): void;
  /** Hand the window `imageFrame` as a shared texture; `whenTheWindowLetsGo` is called once the window, and Electron, hold no reference to it, whether the hand-over succeeded or not. */
  sendTheWindowAnImageFrame(imageFrame: SharedTextureImportOfARuntimeViewerFrame, frameFacts: PortViewerImageFrameFacts, whenTheWindowLetsGo: () => void): Promise<Result<void, string>>;
}

/** Why a viewer's reads ended, as the port viewers recover from it: the node stopped writing, so it shows again once the node runs; or its frames cannot reach a window, which opening the port again tries anew. */
export type RuntimePortViewerReadsEnded = { kind: "the_node_stopped_writing"; words: string } | { kind: "the_frames_cannot_reach_a_window"; words: string };

/** What a viewer's reads reach: who shows the port now, and what to do once they cannot go on. */
export interface RuntimePortViewerReadsSources {
  openedViewer: OpenedRuntimeViewer;
  channelReader: RuntimeViewerChannelReaderOfTheAddon;
  /** Each port viewer showing the port now, by its id, and the window it shows in. */
  windowsShowingThePort(): readonly (readonly [string, WindowShowingPortViewers])[];
  /** Called once, when the reads end on their own; never after `stop`. */
  whenTheReadsEnd(ended: RuntimePortViewerReadsEnded): void;
  tatolabAppLog: TatolabAppLog;
}

/** One runtime viewer's reads of its port, from `followWrites` until `stop`. */
export class RuntimePortViewerReads {
  private aReadIsUnderWay = false;
  private aWriteCameDuringTheRead = false;
  private isStopped = false;

  constructor(private readonly sources: RuntimePortViewerReadsSources) {}

  /** Read the port now, and again on each write its node notifies of; throws when the writes cannot be followed. */
  followWrites(): void {
    this.sources.channelReader.followWrites((failure) => {
      if (this.isStopped) return;
      if (failure === null) this.readWhatTheViewerReads();
      else this.endBecause({ kind: "the_node_stopped_writing", words: this.stoppedReadingWords(failure.message) });
    });
    this.readWhatTheViewerReads();
  }

  /** Stop reading: a read under way releases what it read, and nothing reaches a window from now on. */
  stop(): void {
    this.isStopped = true;
  }

  private endBecause(ended: RuntimePortViewerReadsEnded): void {
    if (this.isStopped) return;
    this.isStopped = true;
    this.sources.whenTheReadsEnd(ended);
  }

  private stoppedReadingWords(why: string): string {
    return `The viewer stopped reading ${this.sources.openedViewer.node_name} › ${this.sources.openedViewer.port}: ${why}`;
  }

  private releaseTheFrameOf(messageRead: RuntimeViewerMessageRead): void {
    if (messageRead.imageFrame) this.sources.channelReader.releaseHeldImageFrame(messageRead.imageFrame.heldFrameId);
  }

  private readWhatTheViewerReads(): void {
    if (this.aReadIsUnderWay) {
      this.aWriteCameDuringTheRead = true;
      return;
    }
    this.aReadIsUnderWay = true;
    this.aWriteCameDuringTheRead = false;
    const { channelReader, openedViewer } = this.sources;
    const messagesRead =
      openedViewer.viewer_reads === "every_message" ? channelReader.readEveryMessage() : channelReader.readLatestMessage().then((messageRead) => (messageRead === null ? [] : [messageRead]));
    messagesRead.then(
      (messagesReadNow) => {
        this.aReadIsUnderWay = false;
        for (const messageRead of messagesReadNow) {
          if (this.isStopped) this.releaseTheFrameOf(messageRead);
          else this.handTheMessageToItsWindows(messageRead);
        }
        if (this.aWriteCameDuringTheRead && !this.isStopped) this.readWhatTheViewerReads();
      },
      (readRefusal: unknown) => {
        this.aReadIsUnderWay = false;
        this.endBecause({ kind: "the_node_stopped_writing", words: this.stoppedReadingWords(describeCaughtFailure(readRefusal)) });
      },
    );
  }

  private handTheMessageToItsWindows(messageRead: RuntimeViewerMessageRead): void {
    const windowsShowingThePort = this.sources.windowsShowingThePort();
    const { imageFrame } = messageRead;
    if (imageFrame === null) {
      const reading = portViewerMessageReadingOf(messageRead);
      for (const [portViewer, window] of windowsShowingThePort) {
        window.sendTheWindowAPortViewerEvent({ port_viewer: portViewer, kind: "message", reading, skipped_since_last_read: messageRead.skippedSinceLastRead });
      }
      return;
    }
    const releaseTheFrame = () => this.sources.channelReader.releaseHeldImageFrame(imageFrame.heldFrameId);
    const sharedTextureImport = sharedTextureImportOfARuntimeViewerFrame(imageFrame, messageRead.timestampNs);
    if (!sharedTextureImport.ok) {
      const { cpuReadBytes } = imageFrame;
      releaseTheFrame();
      if (cpuReadBytes === null) {
        this.endBecause({ kind: "the_frames_cannot_reach_a_window", words: sharedTextureImport.failure });
        return;
      }
      for (const [portViewer, window] of windowsShowingThePort) {
        window.sendTheWindowAPortViewerEvent({
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
    let windowsStillHoldingTheFrame = windowsShowingThePort.length;
    if (windowsStillHoldingTheFrame === 0) {
      releaseTheFrame();
      return;
    }
    const oneWindowLetGo = () => {
      windowsStillHoldingTheFrame -= 1;
      if (windowsStillHoldingTheFrame === 0) releaseTheFrame();
    };
    for (const [portViewer, window] of windowsShowingThePort) {
      const frameFacts: PortViewerImageFrameFacts = { port_viewer: portViewer, format_wire_name: imageFrame.formatWireName, skipped_since_last_read: messageRead.skippedSinceLastRead };
      void window.sendTheWindowAnImageFrame(sharedTextureImport.value, frameFacts, oneWindowLetGo).then((handedOver) => {
        if (!handedOver.ok) this.sources.tatolabAppLog.debug("a port viewer's frame did not reach its window", { port_viewer: portViewer, failure: handedOver.failure });
      });
    }
  }
}
