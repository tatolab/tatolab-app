// One page of a project's log records as the window shows them, read from the runtime's `logs`
// tool result. Each record keeps the JSONL fields the window shows, and the whole record as JSON
// text with the digits the runtime wrote.

import type { ProjectLogRecord, ProjectLogRecordsPage } from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  isAJsonObject,
  isAnUnsignedInteger,
  jsonObject,
  jsonTextsKeepingTheWrittenNumbers,
  jsonTextWithSortedKeys,
  parseJsonOnTheWire,
  requiredText,
  requiredTrueOrFalse,
  type JsonObjectOnTheWire,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The page a `logs` tool result's text holds. */
export function projectLogRecordsPageFromTheLogsToolResult(toolResultText: string): Result<ProjectLogRecordsPage, string> {
  const page = projectLogRecordsPageFromTheParsedToolResult(
    parseJsonOnTheWire(toolResultText),
    jsonTextsKeepingTheWrittenNumbers(toolResultText, recordsOfTheToolResult),
  );
  return page.ok ? page : failedWith(`the runtime's logs result could not be read: ${page.failure}`);
}

/** Each of a parsed tool result's `records`, in order. */
function recordsOfTheToolResult(parsedToolResult: unknown): readonly unknown[] {
  if (!isAJsonObject(parsedToolResult)) return [];
  const records = parsedToolResult["records"];
  return Array.isArray(records) ? records : [];
}

function projectLogRecordsPageFromTheParsedToolResult(
  parsedToolResult: Result<unknown, string>,
  jsonlLineTexts: Result<string[], string>,
): Result<ProjectLogRecordsPage, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the logs result");
  if (!toolResult.ok) return toolResult;
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const recordsOnTheWire = arrayOrEmpty(toolResult.value, "records");
  if (!recordsOnTheWire.ok) return recordsOnTheWire;
  if (!jsonlLineTexts.ok) return jsonlLineTexts;
  const recordsDoNotLineUp = failedWith("the records' JSONL texts do not line up with the records");
  if (jsonlLineTexts.value.length !== recordsOnTheWire.value.length) return recordsDoNotLineUp;
  const records: ProjectLogRecord[] = [];
  for (const [recordIndex, recordOnTheWire] of recordsOnTheWire.value.entries()) {
    const jsonlLineText = jsonlLineTexts.value[recordIndex];
    if (jsonlLineText === undefined) return recordsDoNotLineUp;
    records.push(projectLogRecordFromItsJsonlLine(recordOnTheWire, jsonlLineText));
  }
  const nextAfter = requiredText(toolResult.value, "next_after");
  if (!nextAfter.ok) return nextAfter;
  const recordsNoLongerHeld = requiredTrueOrFalse(toolResult.value, "records_no_longer_held");
  if (!recordsNoLongerHeld.ok) return recordsNoLongerHeld;
  return succeeded({
    project_directory: projectDirectory.value,
    records,
    next_after: nextAfter.value,
    records_no_longer_held: recordsNoLongerHeld.value,
  });
}

/**
 * The record of `jsonlLine` and that line's text: a field that is absent or of another type reads `null`, an absent
 * message reads empty, and an attribute that is not a string reads as its JSON text.
 */
export function projectLogRecordFromItsJsonlLine(jsonlLine: unknown, jsonlLineText: string): ProjectLogRecord {
  const jsonlFields: JsonObjectOnTheWire = isAJsonObject(jsonlLine) ? jsonlLine : {};
  const textField = (fieldName: string) => {
    const fieldValue = jsonlFields[fieldName];
    return typeof fieldValue === "string" ? fieldValue : null;
  };
  const attrsOnTheWire = jsonlFields["attrs"];
  const hostTimestamp = jsonlFields["host_ts"];
  const helperSequence = jsonlFields["source_seq"];
  return {
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
    action: textField("action"),
    stream: textField("stream"),
    jsonl_line: jsonlLineText,
  };
}
