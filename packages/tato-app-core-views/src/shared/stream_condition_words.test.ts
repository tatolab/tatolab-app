import { expect, test } from "vitest";
import type { StreamCondition } from "@tatolab/tato-app-view-sdk/studio_readings";
import { streamDiagnosticLines } from "./stream_condition_words";

const CONDITION: StreamCondition = {
  load: "not_loaded",
  playback: "stopped",
  health: "failed",
  diagnostics: [
    { kind: "project_venv_not_made", place: { on: "stream" }, words: "`uv sync` did not make /w/studio/.venv.", recovery: "fix_the_dependencies" },
    { kind: "link_refused", place: { on: "link", from_node: "camera", from_port: "video", to_node: "display", to_port: "video" }, words: "The ports take different frames.", recovery: "fix_the_link" },
    { kind: "edit_not_live", place: { on: "node", node_id: "D1", node_name: "display" }, words: "The running stream refused it.", recovery: "restart_the_playback" },
    { kind: "node_not_ready", place: { on: "node", node_id: "C1", node_name: "camera" }, words: "Waiting for the camera", recovery: "wait_for_the_node" },
  ],
};

test("each_diagnostic_leads_with_where_it_applies_and_carries_the_action_that_recovers_it", () => {
  expect(streamDiagnosticLines(CONDITION, "Lobby Wall").map(({ tone, lead, words, whatRecoversFromIt, action }) => ({ tone, lead, words, whatRecoversFromIt, action }))).toEqual([
    { tone: "failure", lead: "Lobby Wall:", words: "`uv sync` did not make /w/studio/.venv.", whatRecoversFromIt: "Fix the project's Python packages, then reload the project.", action: { kind: "ask_studio", recovery: "reload_the_project", label: "Reload project" } },
    { tone: "failure", lead: "camera.video → display.video:", words: "The ports take different frames.", whatRecoversFromIt: "Disconnect the link, or wire it to ports that take each other.", action: { kind: "disconnect_the_link", label: "Disconnect link", link: { on: "link", from_node: "camera", from_port: "video", to_node: "display", to_port: "video" } } },
    { tone: "warning", lead: "display:", words: "The running stream refused it.", whatRecoversFromIt: "Restart the playback to make it live.", action: { kind: "ask_studio", recovery: "restart_the_playback", label: "Restart playback" } },
    { tone: "warning", lead: "camera:", words: "Waiting for the camera", whatRecoversFromIt: "It clears once the node is ready.", action: { kind: "none" } },
  ]);
});

test("a_stream_the_runtime_lists_no_condition_for_has_no_diagnostics", () => {
  expect(streamDiagnosticLines(null, "Lobby Wall")).toEqual([]);
});

test("a_link_is_disconnected_only_where_the_diagnostic_names_one_and_each_line_is_keyed_by_its_kind_and_place", () => {
  const condition: StreamCondition = { ...CONDITION, diagnostics: [{ kind: "other", place: { on: "stream" }, words: "A newer place.", recovery: "fix_the_link" }, ...CONDITION.diagnostics] };
  const lines = streamDiagnosticLines(condition, "Lobby Wall");
  expect(lines[0]?.action).toEqual({ kind: "none" });
  expect(lines.map((line) => line.key)).toEqual(["other@stream", "project_venv_not_made@stream", "link_refused@link:camera.video->display.video", "edit_not_live@node:D1", "node_not_ready@node:C1"]);
});
