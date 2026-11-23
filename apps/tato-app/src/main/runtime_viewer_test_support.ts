// Tests' stand-in for what the runtime answers a port viewer's `open_viewer` on Linux. Never imported by shipped code.

import type { OpenedRuntimeViewer } from "./runtime_viewer_control_connection.js";

/** An `open_viewer` result in the shape `OpenViewerToolResult` (`local_api_wire_contract.rs`) serializes to. */
export const OPEN_VIEWER_RESULT_ON_LINUX = {
  viewer: "pattern-main-1a2b3c/7f3a/video",
  stream: "pattern-main-1a2b3c",
  node_id: "7f3a",
  node_name: "pattern",
  port: "video",
  iceoryx2_domain_root: "/run/user/1000/tatolab/iceoryx2",
  channel: "streamlib/pattern-main-1a2b3c/pattern/video",
  wake_service: "streamlib/9c1d/notify",
  pin_type: { type: "texture" as const },
  viewer_reads: "latest_message" as const,
  surface_share_address: "/run/user/1000/tatolab/surface-share.sock",
};

/** `OPEN_VIEWER_RESULT_ON_LINUX` as the app reads it. */
export const LINUX_VIEWER: OpenedRuntimeViewer = OPEN_VIEWER_RESULT_ON_LINUX;

