import { expect, test } from "vitest";
import type { PortViewerEvent, PortViewerImageFrameFacts } from "../../shared/tatolab_backend_contract";
import { PortViewerConnections } from "./port_viewer_connections";
import type { PortViewerConnectionEvent } from "./studio_view_contract";

const CAMERA_VIDEO = { stream: "studio", node: "camera", port: "video" };

function fakePortViewerBackend() {
  const eventListeners: ((event: PortViewerEvent) => void)[] = [];
  const imageFrameListeners: ((videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => void)[] = [];
  const closedPortViewers: string[] = [];
  let openRefusal: string | null = null;
  return {
    backend: {
      openPortViewer: async () => {
        if (openRefusal !== null) throw openRefusal;
        return "port-viewer-1";
      },
      closePortViewer: async (portViewer: string) => {
        closedPortViewers.push(portViewer);
      },
      onPortViewerEvent: (listener: (event: PortViewerEvent) => void) => {
        eventListeners.push(listener);
        return () => undefined;
      },
      onPortViewerImageFrame: (listener: (videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => void) => {
        imageFrameListeners.push(listener);
        return () => undefined;
      },
    },
    sendAnEvent: (event: PortViewerEvent) => eventListeners.forEach((listener) => listener(event)),
    sendAnImageFrame: (videoFrame: VideoFrame, frameFacts: PortViewerImageFrameFacts) => imageFrameListeners.forEach((listener) => listener(videoFrame, frameFacts)),
    closedPortViewers,
    refuseToOpen: (refusal: string) => {
      openRefusal = refusal;
    },
  };
}

function aVideoFrameThatCountsItsCloses(): { videoFrame: VideoFrame; closes: () => number } {
  let closes = 0;
  const videoFrame = new Proxy(Object.create(null), {
    get: (_target, property) => (property === "close" ? () => (closes += 1) : undefined),
  });
  return { videoFrame, closes: () => closes };
}

const settled = () => new Promise((settle) => setTimeout(settle, 0));

test("a port viewer's events and frames reach the connection that opened it, and frames for no connection are closed", async () => {
  const fake = fakePortViewerBackend();
  const connections = new PortViewerConnections(fake.backend);
  const eventsHeard: PortViewerConnectionEvent["kind"][] = [];
  connections.watchPortViewer(CAMERA_VIDEO, (event) => eventsHeard.push(event.kind));
  const frameForNoConnection = aVideoFrameThatCountsItsCloses();
  fake.sendAnImageFrame(frameForNoConnection.videoFrame, { port_viewer: "port-viewer-1", format_wire_name: "bgra32", skipped_since_last_read: 0 });
  await settled();

  fake.sendAnImageFrame(aVideoFrameThatCountsItsCloses().videoFrame, { port_viewer: "port-viewer-1", format_wire_name: "bgra32", skipped_since_last_read: 0 });
  fake.sendAnEvent({ port_viewer: "port-viewer-1", kind: "message", port_family: "records", payload_byte_length: 96, skipped_since_last_read: 0 });
  fake.sendAnEvent({ port_viewer: "port-viewer-9", kind: "message", port_family: "records", payload_byte_length: 96, skipped_since_last_read: 0 });
  fake.sendAnEvent({ port_viewer: "port-viewer-1", kind: "reopening", because: "the runtime stopped" });

  expect(eventsHeard).toEqual(["image_frame", "message", "reopening"]);
  expect(frameForNoConnection.closes()).toBe(1);
});

test("an end ends the connection once, and closing a connection closes its port viewer", async () => {
  const fake = fakePortViewerBackend();
  const connections = new PortViewerConnections(fake.backend);
  const eventsHeard: PortViewerConnectionEvent[] = [];
  const portViewerConnection = connections.watchPortViewer(CAMERA_VIDEO, (event) => eventsHeard.push(event));
  await settled();

  portViewerConnection.close();
  fake.sendAnEvent({ port_viewer: "port-viewer-1", kind: "ended", because: "stopped" });
  await settled();

  expect(eventsHeard).toEqual([]);
  expect(fake.closedPortViewers).toEqual(["port-viewer-1"]);
});

test("a refused open ends the connection in the runtime's words", async () => {
  const fake = fakePortViewerBackend();
  fake.refuseToOpen("no node named `mic` in stream `studio`");
  const connections = new PortViewerConnections(fake.backend);
  const eventsHeard: PortViewerConnectionEvent[] = [];
  connections.watchPortViewer({ ...CAMERA_VIDEO, node: "mic" }, (event) => eventsHeard.push(event));
  await settled();

  expect(eventsHeard).toEqual([{ kind: "ended", because: "no node named `mic` in stream `studio`" }]);
});
