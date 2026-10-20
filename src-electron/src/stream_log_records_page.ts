// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// One page of a stream's log records as the window shows them, read from the runtime's `logs`
// tool result. Each record keeps the JSONL fields the window shows and drops the rest.

import type { StreamLogRecord, StreamLogRecordsPage } from "../../src/backend/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  isAnUnsignedInteger,
  jsonObject,
  jsonTextWithSortedKeys,
  parseJsonOnTheWire,
  requiredText,
  requiredUnsignedInteger,
  type JsonObjectOnTheWire,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The page a `logs` tool result's text holds. */
export function streamLogRecordsPageFromTheLogsToolResult(toolResultText: string): Result<StreamLogRecordsPage, string> {
  const page = streamLogRecordsPageFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return page.ok ? page : failedWith(`the runtime's logs result could not be read: ${page.failure}`);
}

function streamLogRecordsPageFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<StreamLogRecordsPage, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the logs result");
  if (!toolResult.ok) return toolResult;
  const stream = requiredText(toolResult.value, "stream");
  if (!stream.ok) return stream;
  const streamInstance = requiredText(toolResult.value, "stream_instance");
  if (!streamInstance.ok) return streamInstance;
  const numberedRecordsOnTheWire = arrayOrEmpty(toolResult.value, "records");
  if (!numberedRecordsOnTheWire.ok) return numberedRecordsOnTheWire;
  const records = everyOneRead(numberedRecordsOnTheWire.value, numberedRecordOnTheWire);
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

/** One record of the `logs` tool's result: its sequence number beside its JSONL line. */
function numberedRecordOnTheWire(numberedRecordOnTheWire: unknown): Result<StreamLogRecord, string> {
  const numberedRecord = jsonObject(numberedRecordOnTheWire, "a record");
  if (!numberedRecord.ok) return numberedRecord;
  const sequence = requiredUnsignedInteger(numberedRecord.value, "sequence");
  if (!sequence.ok) return sequence;
  return succeeded(streamLogRecordFromItsJsonlLine(sequence.value, numberedRecord.value["record"]));
}

/**
 * The record numbered `sequence`, from its JSONL line: a field that is absent or of another type reads
 * `null`, an absent message reads empty, and an attribute that is not a string reads as its JSON text.
 */
export function streamLogRecordFromItsJsonlLine(sequence: number, jsonlLine: unknown): StreamLogRecord {
  const jsonlFields: JsonObjectOnTheWire = isAJsonObject(jsonlLine) ? jsonlLine : {};
  const textField = (fieldName: string) => {
    const fieldValue = jsonlFields[fieldName];
    return typeof fieldValue === "string" ? fieldValue : null;
  };
  const attrsOnTheWire = jsonlFields["attrs"];
  const hostTimestamp = jsonlFields["host_ts"];
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
  };
}
