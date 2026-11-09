import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { ProjectLogRecord } from "../shared/tatolab_backend_contract.js";
import { projectLogRecordFromItsJsonlLine, projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";

const recordedFixture = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

/** The text of a recorded JSON-RPC response's one tool result block. */
async function recordedToolResultText(fixtureFileName: string): Promise<string> {
  const response: { result: { content: { text: string }[] } } = JSON.parse(await recordedFixture(fixtureFileName));
  const toolResultText = response.result.content[0]?.text;
  return toolResultText ?? expect.unreachable(`${fixtureFileName} holds no tool result text`);
}

test("a_real_first_page_of_one_streams_records_keeps_each_records_shown_fields_its_action_and_its_stream", async () => {
  const page = projectLogRecordsPageFromTheLogsToolResult(
    await recordedToolResultText("local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-first-4.json"),
  );
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.project_directory).toBe("/tmp/tatolab-proof-projects/pattern");
  expect(page.value.next_after).toBe("1:7830");
  expect(page.value.records_no_longer_held).toBe(false);
  expect(page.value.records[0]).toEqual({
    host_ts_ns: 1793462184837063934,
    level: "info",
    source: "rust",
    target: "streamlib_engine::core::runtime::loaded_stream",
    message: "Loading the stream `pattern-main-d76f70` from /tmp/tatolab-proof-projects/pattern",
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: false,
    action: "Rnd53mwtsrixjyxk7h3jfq5j5-2",
    stream: "pattern-main-d76f70",
    jsonl_line:
      '{"schema_version":2,"host_ts":1793462184837063934,"runtime_id":"Rnd53mwtsrixjyxk7h3jfq5j5","stream":"pattern-main-d76f70","action":"Rnd53mwtsrixjyxk7h3jfq5j5-2","source":"rust","level":"info","message":"Loading the stream `pattern-main-d76f70` from /tmp/tatolab-proof-projects/pattern","target":"streamlib_engine::core::runtime::loaded_stream","intercepted":false}',
  });
  expect(page.value.records[1]?.attrs).toEqual({ processor_class_import_path: "nodes.halftone_lens_effect:HalftoneLensEffect" });
});

test("a_real_page_of_python_records_reads_numbers_as_text_and_marks_them_sent_by_their_own_process", async () => {
  const page = projectLogRecordsPageFromTheLogsToolResult(
    await recordedToolResultText("local-api-logs-tool-result-of-the-project-pattern-narrowed-to-its-stream-main-3-python-records.json"),
  );
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.next_after).toBe("1:38940");
  expect(page.value.records[0]).toMatchObject({
    source: "python",
    message: "helper process started",
    attrs: { entrypoint: "nodes.halftone_lens_effect:HalftoneLensEffect", pid: "1939" },
    processor_id: "Pxskdyyryfy3k0ckaha40tm9t",
    sent_by_its_own_process: true,
    stream: "pattern-main-d76f70",
  });
  expect(page.value.records[2]).toMatchObject({ source: "rust", processor_id: null, sent_by_its_own_process: false });
});

test("a_real_failed_streams_records_hold_its_traceback_under_the_action_that_failed_it", async () => {
  const page = projectLogRecordsPageFromTheLogsToolResult(
    await recordedToolResultText("local-api-logs-tool-result-of-the-project-doorways-narrowed-to-its-failed-stream-back-door.json"),
  );
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.records).toHaveLength(1);
  expect(page.value.records[0]).toMatchObject({ level: "error", stream: "doorways-back_door-8630d0", action: "Rnd53mwtsrixjyxk7h3jfq5j5-7" });
  expect(page.value.records[0]?.message).toContain("RuntimeError: the back door's camera is not plugged in");
});

test("a_record_missing_its_optional_fields_or_carrying_unknown_ones_still_reads", () => {
  const toolResult = {
    project_directory: "/tmp/p",
    records: [{ a_field_from_later: [1, 2], level: 3, action: 4 }, "not an object", null],
    next_after: "1:90",
    records_no_longer_held: true,
    a_top_level_field_from_later: true,
  };

  const recordWithoutItsFields = (jsonlLine: string): ProjectLogRecord => ({
    host_ts_ns: null,
    level: null,
    source: null,
    target: null,
    message: "",
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: false,
    action: null,
    stream: null,
    jsonl_line: jsonlLine,
  });
  expect(projectLogRecordsPageFromTheLogsToolResult(JSON.stringify(toolResult))).toEqual({
    ok: true,
    value: {
      project_directory: "/tmp/p",
      records: [recordWithoutItsFields('{"a_field_from_later":[1,2],"level":3,"action":4}'), recordWithoutItsFields('"not an object"'), recordWithoutItsFields("null")],
      next_after: "1:90",
      records_no_longer_held: true,
    },
  });
});

test("a_records_jsonl_line_keeps_every_digit_the_runtime_wrote", () => {
  const toolResultText =
    '{"project_directory":"/tmp/p","next_after":"1:120","records_no_longer_held":false,"records":[{"host_ts":1791759307069355001,"level":"info","message":"m","attrs":{"ratio":1.50,"big":[12345678901234567891]}}]}';

  const page = projectLogRecordsPageFromTheLogsToolResult(toolResultText);
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.records[0]?.jsonl_line).toBe('{"host_ts":1791759307069355001,"level":"info","message":"m","attrs":{"ratio":1.50,"big":[12345678901234567891]}}');
});

test("every_attribute_that_is_not_a_string_reads_as_its_json_text", () => {
  const record = projectLogRecordFromItsJsonlLine({ attrs: { count: 2, ready: true, nothing: null, shape: { w: 1280, h: 720 }, note: "as is" } }, "");

  expect(Object.entries(record.attrs)).toEqual([
    ["count", "2"],
    ["note", "as is"],
    ["nothing", "null"],
    ["ready", "true"],
    ["shape", '{"h":720,"w":1280}'],
  ]);
});

test("a_result_naming_no_cursor_or_a_numbered_one_is_refused", () => {
  const withNoCursor = projectLogRecordsPageFromTheLogsToolResult(JSON.stringify({ project_directory: "/tmp/p", records: [], records_no_longer_held: false }));
  const withANumberedCursor = projectLogRecordsPageFromTheLogsToolResult(
    JSON.stringify({ project_directory: "/tmp/p", records: [], next_after: 7, records_no_longer_held: false }),
  );

  expect(!withNoCursor.ok && withNoCursor.failure).toBe("the runtime's logs result could not be read: missing field `next_after`");
  expect(!withANumberedCursor.ok && withANumberedCursor.failure).toContain("next_after");
});
