import { expect, test } from "vitest";
import type { ListedStream, RuntimeState, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import { trayStatusLine } from "./tatolab_status.js";

function listedStreams(streamCount: number): ListedStream[] {
  return Array.from({ length: streamCount }, (_, streamIndex) => ({
    stream: `stream-${streamIndex}-main-3d9f01`,
    display_name: `stream-${streamIndex}`,
    location: { project_directory: `/projects/stream-${streamIndex}`, project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
    state: "running",
    node_count: 2,
    failed_because: null, capture_devices_whose_access_was_never_asked_for: [], action: null, step: null,
  }));
}

function statusWith(runtimeState: RuntimeState, streamCount: number | null): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    runtime_state: runtimeState,
    runtime_not_running_because: runtimeState === "not_running" ? "The runtime stopped: it exited with status 1. Tato Studio starts it again shortly." : null,
    machine_name: null,
    streams: streamCount === null ? null : listedStreams(streamCount),
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "linked", path: "/Users/someone/.local/bin/tatolab" },
    project_venv_syncs_under_way: [],
    project_venv_syncs_just_ended: [],
    project_stream_action_failures: [],
    app_update: { kind: "not_checked" },
    app_update_announcement: null,
    local_api_socket: "/tmp/streamlib-501/local-api.sock",
    stream_failure_notifications: { enabled: true, shown_by_this_desktop: true },
    developer_mode: false,
    open_at_login: { kind: "off" },
    command_line_tool_version: { kind: "read", version: "0.55.2" },
    studio_warnings: [],
  };
}

test("the_tray_line_names_the_runtime_state_and_stream_count", () => {
  expect(trayStatusLine(statusWith("running", 0))).toBe("Runtime running · 0 streams");
  expect(trayStatusLine(statusWith("running", 1))).toBe("Runtime running · 1 stream");
  expect(trayStatusLine(statusWith("running", 3))).toBe("Runtime running · 3 streams");
  expect(trayStatusLine(statusWith("running", null))).toBe("Runtime running");
  expect(trayStatusLine(statusWith("starting", null))).toBe("Starting the runtime…");
  expect(trayStatusLine(statusWith("not_running", null))).toBe("Runtime not running");
});
