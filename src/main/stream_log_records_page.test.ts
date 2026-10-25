// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import type { StreamLogRecord } from "../shared/tatolab_backend_contract.js";
import { streamLogRecordFromItsJsonlLine, streamLogRecordsPageFromTheLogsToolResult } from "./stream_log_records_page.js";

const recordedFixture = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

/** The page a real runtime answered `logs {stream: "main", after: 0, count: 3}` with. */
const aRealFirstPage = () => recordedFixture("local-api-logs-tool-result-of-the-stream-main-after-0.json");

/** The page a real runtime answered `logs {stream: "main", after: 79, count: 17}` with: Python helpers' records, attributes that are numbers, and a line captured from a helper's stderr. */
const aRealPageOfPythonRecords = () => recordedFixture("local-api-logs-tool-result-of-the-stream-main-after-79.json");

test("a_real_first_page_keeps_each_records_shown_fields", async () => {
  const page = streamLogRecordsPageFromTheLogsToolResult(await aRealFirstPage());
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.stream).toBe("main");
  expect(page.value.stream_instance).toBe("1");
  expect(page.value.next_after).toBe(3);
  expect(page.value.records_no_longer_held).toBe(0);
  expect(page.value.records).toEqual([
    {
      sequence: 1,
      host_ts_ns: 1791759307069355000,
      level: "info",
      source: "rust",
      target: "streamlib_engine::core::runtime::loaded_stream",
      message: "Loading the stream `main` from /private/tmp/tatolab-proof-projects/pattern",
      attrs: {},
      processor_id: null,
      sent_by_its_own_process: false,
      jsonl_line:
        '{"schema_version":1,"host_ts":1791759307069355000,"runtime_id":"Rtefbduuxbizuojf77eijxxbd","stream":"main","source":"rust","level":"info","message":"Loading the stream `main` from /private/tmp/tatolab-proof-projects/pattern","target":"streamlib_engine::core::runtime::loaded_stream","intercepted":false}',
    },
    {
      sequence: 2,
      host_ts_ns: 1791759307221236000,
      level: "info",
      source: "rust",
      target: "streamlib_engine::core::processors::node_types_one_stream_resolves",
      message: "node type described in the stream's processor interpreter registered",
      attrs: { processor_class_import_path: "nodes.inverting_effect:InvertingEffect" },
      processor_id: null,
      sent_by_its_own_process: false,
      jsonl_line: expect.stringContaining('"host_ts":1791759307221236000'),
    },
    {
      sequence: 3,
      host_ts_ns: 1791759307221244000,
      level: "info",
      source: "rust",
      target: "streamlib_engine::core::processors::node_types_one_stream_resolves",
      message: "node type described in the stream's processor interpreter registered",
      attrs: { processor_class_import_path: "nodes.brightness_meter:BrightnessMeter" },
      processor_id: null,
      sent_by_its_own_process: false,
      jsonl_line: expect.stringContaining('"host_ts":1791759307221244000'),
    },
  ]);
});

test("a_real_page_of_python_records_reads_numbers_as_text_and_keeps_a_captured_stderr_line", async () => {
  const page = streamLogRecordsPageFromTheLogsToolResult(await aRealPageOfPythonRecords());
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.next_after).toBe(96);
  expect(page.value.records.map((record) => record.sequence)).toEqual(Array.from({ length: 17 }, (_, recordIndex) => 80 + recordIndex));
  expect(page.value.records[0]).toEqual({
    sequence: 80,
    host_ts_ns: 1791759307360310000,
    level: "info",
    source: "python",
    target: "streamlib::polyglot::python",
    message: "helper process started",
    attrs: { entrypoint: "nodes.inverting_effect:InvertingEffect", pid: "54846" },
    processor_id: "Pgwl3rys4jaz8k9g6pqxxv8kd",
    sent_by_its_own_process: true,
    jsonl_line: expect.stringContaining('"processor_id":"Pgwl3rys4jaz8k9g6pqxxv8kd","source_ts":"2026-10-11T22:55:07.359980+00:00","source_seq":1'),
  });
  const rustRecordOfTheRuntimesOwnProcess = page.value.records[1];
  expect(rustRecordOfTheRuntimesOwnProcess?.processor_id).toBeNull();
  expect(rustRecordOfTheRuntimesOwnProcess?.sent_by_its_own_process).toBe(false);
  const rustRecordAHelperSent = page.value.records[15];
  expect(rustRecordAHelperSent?.source).toBe("rust");
  expect(rustRecordAHelperSent?.sent_by_its_own_process).toBe(true);
  const capturedStderrLine = page.value.records[16];
  expect(capturedStderrLine?.source).toBe("python");
  expect(capturedStderrLine?.level).toBe("warn");
  expect(capturedStderrLine?.message).toBe("[mvk-info] MoltenVK version 1.4.2, supporting Vulkan version 1.4.357.");
  expect(capturedStderrLine?.attrs).toEqual({});
  expect(capturedStderrLine?.processor_id).toBe("Pgwl3rys4jaz8k9g6pqxxv8kd");
  expect(capturedStderrLine?.sent_by_its_own_process).toBe(true);
});

test("a_record_missing_its_optional_fields_or_carrying_unknown_ones_still_reads", () => {
  const toolResult = {
    stream: "main",
    stream_instance: "4",
    records: [{ sequence: 7, record: { a_field_from_later: [1, 2], level: 3 } }, { sequence: 8, record: "not an object" }, { sequence: 9 }],
    next_after: 9,
    a_top_level_field_from_later: true,
  };

  const recordWithoutItsFields = (sequence: number, jsonlLine: string): StreamLogRecord => ({
    sequence,
    host_ts_ns: null,
    level: null,
    source: null,
    target: null,
    message: "",
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: false,
    jsonl_line: jsonlLine,
  });
  expect(streamLogRecordsPageFromTheLogsToolResult(JSON.stringify(toolResult))).toEqual({
    ok: true,
    value: {
      stream: "main",
      stream_instance: "4",
      records: [
        recordWithoutItsFields(7, '{"a_field_from_later":[1,2],"level":3}'),
        recordWithoutItsFields(8, '"not an object"'),
        recordWithoutItsFields(9, "null"),
      ],
      next_after: 9,
      records_no_longer_held: 0,
    },
  });
});

test("a_records_jsonl_line_keeps_every_digit_the_runtime_wrote", () => {
  const toolResultText =
    '{"stream":"main","stream_instance":"1","next_after":1,"records":[{"sequence":1,"record":{"host_ts":1791759307069355001,"level":"info","message":"m","attrs":{"ratio":1.50,"big":[12345678901234567891]}}}]}';

  const page = streamLogRecordsPageFromTheLogsToolResult(toolResultText);
  if (!page.ok) return expect.unreachable(page.failure);

  expect(page.value.records[0]?.jsonl_line).toBe('{"host_ts":1791759307069355001,"level":"info","message":"m","attrs":{"ratio":1.50,"big":[12345678901234567891]}}');
});

test("every_attribute_that_is_not_a_string_reads_as_its_json_text", () => {
  const record = streamLogRecordFromItsJsonlLine(
    1,
    { attrs: { count: 2, ready: true, nothing: null, shape: { w: 1280, h: 720 }, note: "as is" } },
    "",
  );

  expect(Object.entries(record.attrs)).toEqual([
    ["count", "2"],
    ["note", "as is"],
    ["nothing", "null"],
    ["ready", "true"],
    ["shape", '{"h":720,"w":1280}'],
  ]);
});

test("a_result_naming_no_stream_instance_is_refused", () => {
  const page = streamLogRecordsPageFromTheLogsToolResult(JSON.stringify({ stream: "main", records: [], next_after: 0 }));

  expect(!page.ok && page.failure).toContain("stream_instance");
});
