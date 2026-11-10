import { describe, expect, it } from "vitest";
import type { ListedStream, ProjectTransaction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { studioStatusBarWordsOf, type StudioStatusBarSources } from "./studio_status_bar_presentation";

const MAIN_RUNNING: ListedStream = {
  stream: "pattern-main-26aa44",
  display_name: "main",
  location: { project_directory: "/Users/jonathanf/streams/pattern", project: "ab4b415c-debc-454f-8514-c9b6993459d7", stream_asset: "666895f1-e258-4587-8c62-ed07c0cc70db" },
  state: "running",
  node_count: 7,
  failed_because: null,
  capture_devices_whose_access_was_never_asked_for: [],
  action: null,
  step: null,
};

const AN_AGENTS_EDIT: ProjectTransaction = {
  format_version: 1,
  transaction: "43d874c1-0000-4000-8000-000000000001",
  commit: "22857d5b",
  parent_commit: null,
  author_kind: "agent",
  author_name: "claude-code",
  operations: [],
  inverse_operations: [],
  undoes: null,
  redoes: null,
  idempotency_key: null,
  undo_state: "applied",
  applied_at: "2026-11-10T19:00:00Z",
};

const RUNNING_ON_A_MAC: StudioStatusBarSources = {
  runtimeState: "running",
  runtimeDescription: { kind: "read", description: { version: "0.68.55", build_id: "0.68.55+3e1a48c.1", up_for_ms: 1_000, runtime_log_directory: "/tmp/logs" } },
  listedStreams: [MAIN_RUNNING],
  activeStream: "pattern-main-26aa44",
  projectTransactions: {
    kind: "read",
    project_transactions: { project: "ab4b415c-debc-454f-8514-c9b6993459d7", project_directory: "/Users/jonathanf/streams/pattern", transactions: [AN_AGENTS_EDIT], refused_actions: [] },
  },
  platform: "macos",
  wallClockNowMs: Date.parse("2026-11-10T19:02:00Z"),
};

describe("the studio's status bar", () => {
  it("names the runtime's version and this Mac, the open stream's state and size, the newest edit's author and when, and the shortcuts", () => {
    expect(studioStatusBarWordsOf(RUNNING_ON_A_MAC)).toEqual({
      runtime_tone: "running",
      runtime: "tatolabd 0.68.55 · This Mac",
      open_stream: "main running · 7 nodes",
      last_edit: "Last edit by claude-code · 2 minutes ago",
      shortcuts: "F5 Live · ⌘1–5 Layouts",
    });
  });

  it("says the runtime is not running, on Linux as this computer, and leaves out a stream it does not list and a feed with no edit", () => {
    const words = studioStatusBarWordsOf({
      ...RUNNING_ON_A_MAC,
      runtimeState: "not_running",
      listedStreams: null,
      projectTransactions: { kind: "not_read", because: "no runtime answers" },
      platform: "linux",
    });
    expect(words.runtime).toBe("Runtime not running · This computer");
    expect(words.open_stream).toBeNull();
    expect(words.last_edit).toBeNull();
    expect(words.shortcuts).toBe("F5 Live · Ctrl 1–5 Layouts");
  });

  it("names the runtime without a version until its description is read, and a stream with no node count by its state alone", () => {
    const words = studioStatusBarWordsOf({ ...RUNNING_ON_A_MAC, runtimeDescription: { kind: "not_read" }, listedStreams: [{ ...MAIN_RUNNING, state: "stopped", node_count: null }] });
    expect(words.runtime).toBe("tatolabd · This Mac");
    expect(words.open_stream).toBe("main stopped");
  });
});
