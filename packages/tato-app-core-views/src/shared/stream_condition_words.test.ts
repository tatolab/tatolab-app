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

test("a_computed_value_still_building_warns_and_a_failed_build_fails_saying_to_change_an_input_it_read", () => {
  const condition: StreamCondition = {
    load: "loaded",
    playback: "playing",
    health: "degraded",
    diagnostics: [
      { kind: "computed_value_not_yet_built", place: { on: "node", node_id: "B1", node_name: "blur" }, words: "its computed value kernel is building its first value", recovery: "wait_for_the_node" },
      { kind: "computed_value_build_failed", place: { on: "node", node_id: "T1", node_name: "tint" }, words: "the build of its computed value kernel failed", recovery: "change_an_input_the_build_read" },
      { kind: "computed_value_build_panicked", place: { on: "node", node_id: "T1", node_name: "tint" }, words: "the build of its computed value lut panicked", recovery: "fix_the_code" },
    ],
  };
  expect(streamDiagnosticLines(condition, "Lobby Wall").map(({ tone, lead, whatRecoversFromIt, action }) => ({ tone, lead, whatRecoversFromIt, action }))).toEqual([
    { tone: "warning", lead: "blur:", whatRecoversFromIt: "It clears once the node is ready.", action: { kind: "none" } },
    { tone: "failure", lead: "tint:", whatRecoversFromIt: "Change an input the build read, or fix the code it names. It builds again from the new value.", action: { kind: "none" } },
    { tone: "failure", lead: "tint:", whatRecoversFromIt: "Fix the code, then reload the project.", action: { kind: "ask_studio", recovery: "reload_the_project", label: "Reload project" } },
  ]);
});

test("a_link_whose_pin_types_differ_fails_and_is_disconnected_from_its_line", () => {
  const link = { on: "link", from_node: "convert", from_port: "audio_out", to_node: "meter", to_port: "audio_in" } as const;
  const condition: StreamCondition = { load: "loaded", playback: "playing", health: "degraded", diagnostics: [{ kind: "link_pin_types_differ", place: link, words: "its output carries audio with 1 channel and its input reads audio with 2 channels", recovery: "fix_the_link" }] };
  expect(streamDiagnosticLines(condition, "Lobby Wall")).toMatchObject([{ tone: "failure", lead: "convert.audio_out → meter.audio_in:", action: { kind: "disconnect_the_link", label: "Disconnect link", link } }]);
});

test("two_diagnostics_of_one_kind_at_one_place_are_keyed_apart", () => {
  const place = { on: "node", node_id: "T1", node_name: "tint" } as const;
  const condition: StreamCondition = {
    load: "loaded",
    playback: "playing",
    health: "degraded",
    diagnostics: [
      { kind: "computed_value_build_failed", place, words: "the build of its computed value kernel failed", recovery: "change_an_input_the_build_read" },
      { kind: "computed_value_build_failed", place, words: "the build of its computed value lut failed", recovery: "change_an_input_the_build_read" },
    ],
  };
  expect(streamDiagnosticLines(condition, "Lobby Wall").map((line) => line.key)).toEqual(["computed_value_build_failed@node:T1", "computed_value_build_failed@node:T1#2"]);
});
