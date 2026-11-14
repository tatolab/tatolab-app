import { describe, expect, it } from "vitest";
import type { ProjectTransaction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { studioStatusBarWordsOf, type StudioStatusBarSources } from "./studio_status_bar_presentation";

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

const RUNNING_WITH_AN_EDIT: StudioStatusBarSources = {
  runtimeState: "running",
  runtimeDescription: { kind: "read", description: { version: "0.68.55", build_id: "0.68.55+3e1a48c.1", up_for_ms: 1_000, runtime_log_directory: "/tmp/logs" } },
  projectTransactions: {
    kind: "read",
    project_transactions: { project: "ab4b415c-debc-454f-8514-c9b6993459d7", project_directory: "/Users/jonathanf/streams/pattern", transactions: [AN_AGENTS_EDIT], refused_actions: [] },
  },
  wallClockNowMs: Date.parse("2026-11-10T19:02:00Z"),
};

describe("the studio's status bar", () => {
  it("names the runtime's version without the machine, and the newest edit's author and when", () => {
    expect(studioStatusBarWordsOf(RUNNING_WITH_AN_EDIT)).toEqual({
      runtime_tone: "running",
      runtime: "tatolabd 0.68.55",
      last_edit: "Last edit by claude-code · 2 minutes ago",
    });
  });

  it("says the runtime is not running, and leaves out a feed with no edit", () => {
    const words = studioStatusBarWordsOf({ ...RUNNING_WITH_AN_EDIT, runtimeState: "not_running", projectTransactions: { kind: "not_read", because: "no runtime answers" } });
    expect(words.runtime).toBe("Runtime not running");
    expect(words.last_edit).toBeNull();
  });

  it("says the runtime is starting without naming the machine", () => {
    expect(studioStatusBarWordsOf({ ...RUNNING_WITH_AN_EDIT, runtimeState: "starting" }).runtime).toBe("Runtime starting");
  });

  it("names the runtime without a version until its description is read", () => {
    expect(studioStatusBarWordsOf({ ...RUNNING_WITH_AN_EDIT, runtimeDescription: { kind: "not_read" } }).runtime).toBe("tatolabd");
  });
});
