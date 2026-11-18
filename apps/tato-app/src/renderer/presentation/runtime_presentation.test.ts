import { describe, expect, it } from "vitest";
import type { TatolabStatus } from "../../shared/tatolab_backend_contract";
import { presentRuntimeStatus } from "./runtime_presentation";

function statusWith(statusChanges: Partial<TatolabStatus>): TatolabStatus {
  return {
    app_version: "0.45.0",
    app_build: null,
    platform: "macos",
    runtime_state: "running",
    runtime_not_running_because: null,
    runtime_of_another_age: null,
    machine_name: "ada-macbook-pro",
    streams: [],
    streams_not_listed_because: null,
    command_line_tool_link: { kind: "linked", path: "/Users/ada/.local/bin/tatolab" },
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
    ...statusChanges,
  };
}

describe("presentRuntimeStatus", () => {
  it("shows a running runtime with no banner", () => {
    expect(presentRuntimeStatus(statusWith({}))).toEqual({ runtimeState: "running", tone: "ok", shortLabel: "Running", banner: null });
  });

  it("warns of a running runtime of another age with its notice as the banner", () => {
    const runtimeOfAnotherAge = {
      older_side: "runtime",
      runtime_version: "0.68.90",
      runtime_contract: { version: 3, revision: 0 },
      studio_contract: { version: 3, revision: 1 },
      remedy: "update_the_runtime",
    } as const;
    expect(presentRuntimeStatus(statusWith({ runtime_of_another_age: runtimeOfAnotherAge }))).toEqual({
      runtimeState: "running",
      tone: "warning",
      shortLabel: "Running",
      banner: {
        title: "The runtime is older than this Studio",
        explanation:
          "tatolabd 0.68.90 serves control contract 3, revision 0; this Studio needs contract 3, revision 1. Your projects are untouched. Update the tatolabd that is running. This build of Tato Studio carries no runtime of its own.",
      },
    });
  });

  it("shows a runtime the app is starting as in progress", () => {
    expect(presentRuntimeStatus(statusWith({ runtime_state: "starting", machine_name: null, streams: null }))).toEqual({
      runtimeState: "starting",
      tone: "progress",
      shortLabel: "Starting",
      banner: { title: "Starting the runtime", explanation: "Tato Studio is starting it. This usually takes a few seconds." },
    });
  });

  it("explains a runtime that is not running in the words the app gave", () => {
    const notRunning = statusWith({
      runtime_state: "not_running",
      runtime_not_running_because: "The runtime stopped: it exited with status 1. Tato Studio starts it again shortly.",
      machine_name: null,
      streams: null,
    });
    expect(presentRuntimeStatus(notRunning)).toEqual({
      runtimeState: "not_running",
      tone: "error",
      shortLabel: "Not running",
      banner: { title: "The runtime isn't running", explanation: "The runtime stopped: it exited with status 1. Tato Studio starts it again shortly." },
    });
    expect(presentRuntimeStatus(statusWith({ runtime_state: "not_running" })).banner?.explanation).toBe("No runtime is answering.");
  });
});
