// The port viewers the host opens for its views, one per connection, each event and Image frame
// the backend relays routed to the connection whose port viewer it names.

import type { PortViewerEvent, PortViewerImageFrameFacts, PortViewerTarget } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { PortViewerConnection, PortViewerConnectionEvent } from "./studio_view_contract";

type PortViewerBackend = Pick<TatolabBackend, "openPortViewer" | "closePortViewer" | "onPortViewerEvent" | "onPortViewerImageFrame">;

/** Every port viewer connection the host holds, routed through `backend`. */
export class PortViewerConnections {
  private readonly listenersByPortViewer = new Map<string, (event: PortViewerConnectionEvent) => void>();

  constructor(private readonly backend: PortViewerBackend) {
    backend.onPortViewerEvent((event) => this.routeTheEvent(event));
    backend.onPortViewerImageFrame((videoFrame, frameFacts) => this.routeTheImageFrame(videoFrame, frameFacts));
  }

  readonly watchPortViewer = (target: PortViewerTarget, onEvent: (event: PortViewerConnectionEvent) => void): PortViewerConnection => {
    let portViewer: string | null = null;
    let isClosed = false;
    const endWith = (because: string) => {
      if (isClosed) return;
      isClosed = true;
      if (portViewer !== null) this.listenersByPortViewer.delete(portViewer);
      onEvent({ kind: "ended", because });
    };
    this.backend.openPortViewer(target).then(
      (openedPortViewer) => {
        if (isClosed) {
          void this.backend.closePortViewer(openedPortViewer).catch(() => undefined);
          return;
        }
        portViewer = openedPortViewer;
        this.listenersByPortViewer.set(openedPortViewer, (event) => {
          if (event.kind === "ended") endWith(event.because);
          else onEvent(event);
        });
      },
      (rejection: unknown) => endWith(describeBackendRejection(rejection)),
    );
    return {
      close: () => {
        if (isClosed) return;
        isClosed = true;
        if (portViewer === null) return;
        this.listenersByPortViewer.delete(portViewer);
        void this.backend.closePortViewer(portViewer).catch(() => undefined);
      },
    };
  };

  private routeTheEvent(event: PortViewerEvent): void {
    const listener = this.listenersByPortViewer.get(event.port_viewer);
    if (listener === undefined) return;
    if (event.kind === "image_pixels") {
      const { port_viewer: _portViewer, ...imagePixels } = event;
      listener(imagePixels);
    } else if (event.kind === "message") {
      listener({ kind: "message", reading: event.reading, skipped_since_last_read: event.skipped_since_last_read });
    } else {
      listener({ kind: event.kind, because: event.because });
    }
  }

  private routeTheImageFrame(videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts): void {
    const listener = this.listenersByPortViewer.get(frameFacts.port_viewer);
    if (listener === undefined) {
      videoFrame.close();
      return;
    }
    listener({ kind: "image_frame", video_frame: videoFrame, format_wire_name: frameFacts.format_wire_name, skipped_since_last_read: frameFacts.skipped_since_last_read });
  }
}
