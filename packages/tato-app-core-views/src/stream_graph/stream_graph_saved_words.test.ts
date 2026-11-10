import { expect, test } from "vitest";
import type { ProjectTransaction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamGraphSavedWords } from "./stream_graph_saved_words";

function transaction(authorKind: string, authorName: string, undoes: string | null = null): ProjectTransaction {
  return {
    format_version: 1,
    transaction: `${authorName}-${undoes ?? "edit"}`,
    commit: "c",
    parent_commit: null,
    author_kind: authorKind,
    author_name: authorName,
    operations: [],
    inverse_operations: [],
    undoes,
    redoes: null,
    idempotency_key: null,
    undo_state: undoes === null ? "applied" : null,
    applied_at: "2026-11-10T12:00:00Z",
  };
}

const JONATHAN = { kind: "person" as const, name: "Jonathan" };

test("the_latest_edit_by_the_person_editing_reads_as_by_you_and_an_agents_by_its_name", () => {
  expect(streamGraphSavedWords([transaction("person", "Jonathan")], JONATHAN)).toBe("Saved · last edit by you");
  expect(streamGraphSavedWords([transaction("agent", "claude-code"), transaction("person", "Jonathan")], JONATHAN)).toBe("Saved · last edit by claude-code (agent)");
  expect(streamGraphSavedWords([transaction("person", "Jonathan")], null)).toBe("Saved · last edit by Jonathan");
});

test("an_undo_counts_as_the_latest_edit_and_a_project_with_no_edit_says_nothing", () => {
  expect(streamGraphSavedWords([transaction("person", "Jonathan", "t1"), transaction("agent", "claude-code")], JONATHAN)).toBe("Saved · last edit by you");
  expect(streamGraphSavedWords([], JONATHAN)).toBeNull();
});
