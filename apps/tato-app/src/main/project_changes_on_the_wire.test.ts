import { expect, test } from "vitest";
import { duplicateFromTheDuplicateProjectToolResult, projectFromTheImportProjectToolResult, projectNameFromTheRenameProjectToolResult } from "./project_changes_on_the_wire.js";
import { projectSummaryFromTheListAssetsToolResult } from "./project_the_runtime_names.js";

test("a project change's answer missing a field is refused naming the tool and the field", () => {
  expect(projectNameFromTheRenameProjectToolResult('{"project":"4d7c"}')).toEqual({ ok: false, failure: "the runtime's rename_project result could not be read: missing field `project_name`" });
  expect(duplicateFromTheDuplicateProjectToolResult('{"project_directory":"/a copy","project":"0378"}')).toEqual({
    ok: false,
    failure: "the runtime's duplicate_project result could not be read: missing field `project_name`",
  });
  expect(projectFromTheImportProjectToolResult('{"project_directory":"/a","name":"Night Show"}')).toEqual({ ok: false, failure: "the runtime's import_project result could not be read: missing field `project`" });
  expect(projectFromTheImportProjectToolResult("not json").ok).toBe(false);
});

test("a project summary reads a missing or null description and last edit as none, and the edit in seconds as milliseconds", () => {
  const summary = projectSummaryFromTheListAssetsToolResult('{"project_directory":"/a","project":"4d7c","project_name":"Night Show","project_description":null,"project_last_edited_at":12,"assets":[]}');
  expect(summary.ok && [summary.value.description, summary.value.last_edited_at_wall_clock_ms]).toEqual([null, 12_000]);
  const fromAnOlderRuntime = projectSummaryFromTheListAssetsToolResult('{"project_directory":"/a","project":"4d7c","project_name":"Night Show","assets":[]}');
  expect(fromAnOlderRuntime.ok && [fromAnOlderRuntime.value.description, fromAnOlderRuntime.value.last_edited_at_wall_clock_ms]).toEqual([null, null]);
});
