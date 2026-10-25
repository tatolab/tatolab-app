// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// One page of a stream's log records as the window shows them, read from the runtime's `logs`
// tool result. Each record keeps the JSONL fields the window shows, and the whole record as JSON
// text with the digits the runtime wrote.

import type { StreamLogRecord, StreamLogRecordsPage } from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  isAnUnsignedInteger,
  jsonObject,
  jsonTextsKeepingTheWrittenNumbers,
  jsonTextWithSortedKeys,
  parseJsonOnTheWire,
  requiredText,
  requiredUnsignedInteger,
  type JsonObjectOnTheWire,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The page a `logs` tool result's text holds. */
export function streamLogRecordsPageFromTheLogsToolResult(toolResultText: string): Result<StreamLogRecordsPage, string> {
  const page = streamLogRecordsPageFromTheParsedToolResult(
    parseJsonOnTheWire(toolResultText),
    jsonTextsKeepingTheWrittenNumbers(toolResultText, recordsOfTheToolResult),
  );
  return page.ok ? page : failedWith(`the runtime's logs result could not be read: ${page.failure}`);
}

/** Each `records[].record` of a parsed tool result, by its place in `records`; `null` for one that holds none. */
function recordsOfTheToolResult(parsedToolResult: unknown): readonly unknown[] {
  if (!isAJsonObject(parsedToolResult)) return [];
  const numberedRecords = parsedToolResult["records"];
  if (!Array.isArray(numberedRecords)) return [];
  return numberedRecords.map((numberedRecord: unknown) => (isAJsonObject(numberedRecord) ? (numberedRecord["record"] ?? null) : null));
}

function streamLogRecordsPageFromTheParsedToolResult(
  parsedToolResult: Result<unknown, string>,
  jsonlLineTexts: Result<string[], string>,
): Result<StreamLogRecordsPage, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the logs result");
  if (!toolResult.ok) return toolResult;
  const stream = requiredText(toolResult.value, "stream");
  if (!stream.ok) return stream;
  const streamInstance = requiredText(toolResult.value, "stream_instance");
  if (!streamInstance.ok) return streamInstance;
  const numberedRecordsOnTheWire = arrayOrEmpty(toolResult.value, "records");
  if (!numberedRecordsOnTheWire.ok) return numberedRecordsOnTheWire;
  if (!jsonlLineTexts.ok) return jsonlLineTexts;
  if (jsonlLineTexts.value.length !== numberedRecordsOnTheWire.value.length) return failedWith("the records' JSONL texts do not line up with the records");
  const records = everyOneRead(
    numberedRecordsOnTheWire.value.map((numberedRecord, recordIndex) => ({ numberedRecord, jsonlLineText: jsonlLineTexts.value[recordIndex] })),
    numberedRecordWithItsJsonlLine,
  );
  if (!records.ok) return records;
  const nextAfter = requiredUnsignedInteger(toolResult.value, "next_after");
  if (!nextAfter.ok) return nextAfter;
  const recordsNoLongerHeld =
    toolResult.value["records_no_longer_held"] === undefined ? succeeded(0) : requiredUnsignedInteger(toolResult.value, "records_no_longer_held");
  if (!recordsNoLongerHeld.ok) return recordsNoLongerHeld;
  return succeeded({
    stream: stream.value,
    stream_instance: streamInstance.value,
    records: records.value,
    next_after: nextAfter.value,
    records_no_longer_held: recordsNoLongerHeld.value,
  });
}

/** One record of the `logs` tool's result: its sequence number beside its JSONL line, with that line's text as the runtime wrote it. */
function numberedRecordWithItsJsonlLine({
  numberedRecord: numberedRecordOnTheWire,
  jsonlLineText,
}: {
  numberedRecord: unknown;
  jsonlLineText: string | undefined;
}): Result<StreamLogRecord, string> {
  if (jsonlLineText === undefined) return failedWith("a record has no JSONL text");
  const numberedRecord = jsonObject(numberedRecordOnTheWire, "a record");
  if (!numberedRecord.ok) return numberedRecord;
  const sequence = requiredUnsignedInteger(numberedRecord.value, "sequence");
  if (!sequence.ok) return sequence;
  return succeeded(streamLogRecordFromItsJsonlLine(sequence.value, numberedRecord.value["record"], jsonlLineText));
}

/**
 * The record numbered `sequence`, from its JSONL line and that line's text: a field that is absent or of another
 * type reads `null`, an absent message reads empty, and an attribute that is not a string reads as its JSON text.
 */
export function streamLogRecordFromItsJsonlLine(sequence: number, jsonlLine: unknown, jsonlLineText: string): StreamLogRecord {
  const jsonlFields: JsonObjectOnTheWire = isAJsonObject(jsonlLine) ? jsonlLine : {};
  const textField = (fieldName: string) => {
    const fieldValue = jsonlFields[fieldName];
    return typeof fieldValue === "string" ? fieldValue : null;
  };
  const attrsOnTheWire = jsonlFields["attrs"];
  const hostTimestamp = jsonlFields["host_ts"];
  const helperSequence = jsonlFields["source_seq"];
  return {
    sequence,
    host_ts_ns: isAnUnsignedInteger(hostTimestamp) ? hostTimestamp : null,
    level: textField("level"),
    source: textField("source"),
    target: textField("target"),
    message: textField("message") ?? "",
    attrs: isAJsonObject(attrsOnTheWire)
      ? Object.fromEntries(
          Object.keys(attrsOnTheWire)
            .sort()
            .map((attributeName) => {
              const attributeValue = attrsOnTheWire[attributeName];
              return [attributeName, typeof attributeValue === "string" ? attributeValue : jsonTextWithSortedKeys(attributeValue)];
            }),
        )
      : {},
    processor_id: textField("processor_id"),
    // `source_seq` marks a record a helper sent over its log IPC; a helper's captured stdout and stderr carry none, but only a helper writes `python`.
    sent_by_its_own_process: (helperSequence !== undefined && helperSequence !== null) || textField("source") === "python",
    jsonl_line: jsonlLineText,
  };
}
