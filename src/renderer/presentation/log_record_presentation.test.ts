// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { ListedStream, StreamGraphSummary, StreamLogRecord } from "../../shared/tatolab_backend_contract";
import {
  formatLogAttrValue,
  formatLogRecordDateAndTime,
  formatLogRecordTime,
  isEarlierRecordsPointerShown,
  jsonlOfStreamLogRows,
  levelFilterOfLogRecord,
  logFolderPathOfStream,
  presentLogLevelWord,
  presentStreamLog,
  presentStreamLogRecordDetails,
  presentStreamLogsOfAStreamNotLoaded,
  prettyJsonLinesOf,
  searchMatchRangesOf,
  STREAM_LOG_LEVEL_FILTERS,
  earlierRecordsNotHeldWords,
  streamLoadWords,
  type StreamLogFilters,
} from "./log_record_presentation";

function logRecord(sequence: number, recordChanges: Partial<StreamLogRecord> = {}): StreamLogRecord {
  return {
    sequence,
    host_ts_ns: null,
    level: "info",
    source: "rust",
    target: "streamlib_engine::core::runtime::loaded_stream",
    message: `record ${sequence}`,
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: false,
    jsonl_line: `{"seq":${sequence}}`,
    ...recordChanges,
  };
}

const FRONT_DOOR_GRAPH: StreamGraphSummary = {
  stream: "front-door",
  nodes: [
    { id: "Pcam", name: "camera", type: "tatolab.stream:CameraSource", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
    { id: "Pdet", name: "persondetector", type: "nodes.person_detector:PersonDetector", state: "Running", input_ports: [], output_ports: [], dropped_bags_by_link: {}, refused_bags_by_output_port: {} },
  ],
  links: [],
  exposed: [],
  graph_document_text: "{}",
};

const EVERY_RECORD: StreamLogFilters = { searchText: "", levelFilter: "all", shownStepKeys: new Set(), clearedThroughSequence: 0 };

describe("formatLogRecordTime", () => {
  it("writes the local time to the millisecond", () => {
    const recordedAt = new Date(2026, 9, 11, 18, 55, 7, 359);
    expect(formatLogRecordTime(recordedAt.getTime() * 1_000_000)).toBe("18:55:07.359");
  });

  it("reads a nanosecond stamp past 2^53 to the millisecond", () => {
    expect(formatLogRecordTime(1791757115431254000)).toMatch(/^\d{2}:\d{2}:\d{2}\.431$/);
  });

  it("holds the column for a record without a stamp", () => {
    expect(formatLogRecordTime(null)).toBe("--:--:--.---");
  });
});

describe("formatLogRecordDateAndTime", () => {
  it("writes the local date and time to the millisecond", () => {
    const recordedAt = new Date(2026, 9, 20, 21, 14, 8, 990);
    expect(formatLogRecordDateAndTime(recordedAt.getTime() * 1_000_000)).toBe("2026-10-20 21:14:08.990");
    expect(formatLogRecordDateAndTime(null)).toBe("No timestamp");
  });
});

describe("formatLogAttrValue", () => {
  it("quotes a value only when it is empty or holds a space, = or a quote", () => {
    expect(formatLogAttrValue("127.5")).toBe("127.5");
    expect(formatLogAttrValue("FaceTime HD Camera")).toBe('"FaceTime HD Camera"');
    expect(formatLogAttrValue("")).toBe('""');
    expect(formatLogAttrValue("a=b")).toBe('"a=b"');
  });
});

describe("levels", () => {
  it("files warn and error under their own filters and every other level, an unknown one included, under Info", () => {
    expect(STREAM_LOG_LEVEL_FILTERS.map((levelFilter) => levelFilter.label)).toEqual(["All", "Info", "Warnings", "Errors"]);
    expect(["trace", "debug", "info", "notice", null].map(levelFilterOfLogRecord)).toEqual(["info", "info", "info", "info", "info"]);
    expect(levelFilterOfLogRecord("WARN")).toBe("warn");
    expect(levelFilterOfLogRecord("error")).toBe("error");
  });

  it("quiets trace and debug, colours only warn and error, and reads an unknown level as info", () => {
    expect(["trace", "debug", "info", "notice", null, "WARN", "error"].map(presentLogLevelWord)).toEqual(["quiet", "quiet", "plain", "plain", "plain", "warn", "error"]);
  });
});

describe("presentStreamLog", () => {
  const records = [
    logRecord(1),
    logRecord(2, { processor_id: "Pcam", message: "Camera opened", attrs: { device: "FaceTime HD Camera" } }),
    logRecord(3, { processor_id: "Pdet", level: "warn", message: "frame arrived late", attrs: { dropped: "3" } }),
    logRecord(4, { processor_id: "Pdet", level: "error", message: "model failed" }),
    logRecord(5, { processor_id: "Pgone", level: "debug", message: "from a step no longer in the graph" }),
  ];

  it("names each record's step from the graph, the runtime's records as runtime, and an id the graph does not hold as itself", () => {
    const streamLog = presentStreamLog(records, FRONT_DOOR_GRAPH, EVERY_RECORD);

    expect(streamLog.rows.map((row) => row.step.stepName)).toEqual(["runtime", "camera", "persondetector", "persondetector", "Pgone"]);
    expect(streamLog.rows.map((row) => row.step.isAStepOfTheGraph)).toEqual([false, true, true, true, false]);
    expect(streamLog.rows[1]?.messageLineParts).toEqual([
      { text: "Camera opened", kind: "message" },
      { text: "  ", kind: "separator" },
      { text: "device=", kind: "field_key" },
      { text: '"FaceTime HD Camera"', kind: "field_value" },
    ]);
    expect(streamLog.rows.map((row) => row.levelWord)).toEqual(["INFO", "INFO", "WARN", "ERROR", "DEBUG"]);
    expect(streamLog.lineCountWords).toBe("5 lines");
  });

  it("offers each step the records name, in the graph's order, then any the graph does not hold, then the runtime", () => {
    const streamLog = presentStreamLog(records, FRONT_DOOR_GRAPH, EVERY_RECORD);

    expect(streamLog.stepChoices).toEqual([
      { stepKey: "Pcam", stepName: "camera", stepHint: "CameraSource" },
      { stepKey: "Pdet", stepName: "persondetector", stepHint: "PersonDetector" },
      { stepKey: "Pgone", stepName: "Pgone", stepHint: "not in the graph" },
      { stepKey: "", stepName: "runtime", stepHint: "tatolabd" },
    ]);
  });

  it("counts each level among the records the search and steps let through, and shows the level chosen", () => {
    const streamLog = presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, levelFilter: "warn", shownStepKeys: new Set(["Pdet"]) });

    expect(streamLog.levelFilterChoices).toEqual([
      { levelFilter: "all", label: "All", count: 2, labelTone: "plain" },
      { levelFilter: "info", label: "Info", count: 0, labelTone: "plain" },
      { levelFilter: "warn", label: "Warnings", count: 1, labelTone: "warn" },
      { levelFilter: "error", label: "Errors", count: 1, labelTone: "error" },
    ]);
    expect(streamLog.stepFilterWords).toEqual({ words: "persondetector", isOneStepChosen: true });
    expect(streamLog.rows.map((row) => row.record.sequence)).toEqual([3]);
    expect(streamLog.lineCountWords).toBe("1 of 5");
  });

  it("words the step filter as every step, the one chosen, or how many of how many", () => {
    const stepFilterWordsFor = (shownStepKeys: string[]) => presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, shownStepKeys: new Set(shownStepKeys) }).stepFilterWords;

    expect(stepFilterWordsFor([])).toEqual({ words: "All steps", isOneStepChosen: false });
    expect(stepFilterWordsFor(["Pcam", ""])).toEqual({ words: "2 of 4", isOneStepChosen: false });
  });

  it("searches step names and the message line as the row shows it, quoted values and spacing included", () => {
    const sequencesFound = (searchText: string) => presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, searchText }).rows.map((row) => row.record.sequence);

    expect(sequencesFound('device="FaceTime')).toEqual([2]);
    expect(sequencesFound("opened  device")).toEqual([2]);
    expect(sequencesFound("opened device")).toEqual([]);
  });

  it("searches messages, step names and key=value fields, ignoring case", () => {
    const sequencesFound = (searchText: string) => presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, searchText }).rows.map((row) => row.record.sequence);

    expect(sequencesFound("CAMERA OPENED")).toEqual([2]);
    expect(sequencesFound("persondetector")).toEqual([3, 4]);
    expect(sequencesFound("dropped=3")).toEqual([3]);
    expect(sequencesFound("  ")).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves out the records cleared, and says why nothing shows", () => {

    const cleared = presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, clearedThroughSequence: 5 });
    expect(cleared.rows).toEqual([]);
    expect(cleared.lineCountWords).toBe("0 lines");
    expect(cleared.emptyWords).toBe("Cleared. New lines appear here.");
    expect(presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, clearedThroughSequence: 3 }).rows.map((row) => row.record.sequence)).toEqual([4, 5]);
    expect(presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, searchText: "nothing like it" }).emptyWords).toBe("No lines match.");
    expect(presentStreamLog([], FRONT_DOOR_GRAPH, EVERY_RECORD).emptyWords).toBe("No log records yet. New ones show up here as the stream writes them.");
    expect(presentStreamLog(records, FRONT_DOOR_GRAPH, EVERY_RECORD).emptyWords).toBeNull();
  });

  it("divides the rows by day only when they span more than one", () => {
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).getTime() * 1_000_000;
    const recordsOverTwoDays = [logRecord(1, { host_ts_ns: at(19, 23) }), logRecord(2, { host_ts_ns: at(20, 1) }), logRecord(3, { host_ts_ns: at(20, 2) })];

    expect(presentStreamLog(recordsOverTwoDays, null, EVERY_RECORD).rows.map((row) => row.dayDividerWords)).toEqual(["Monday, October 19", "Tuesday, October 20", null]);
    expect(presentStreamLog(recordsOverTwoDays.slice(1), null, EVERY_RECORD).rows.map((row) => row.dayDividerWords)).toEqual([null, null]);
  });

  it("copies the rows shown as the runtime's JSONL lines", () => {
    const streamLog = presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, levelFilter: "error" });

    expect(jsonlOfStreamLogRows(streamLog.rows)).toBe('{"seq":4}');
  });
});

describe("presentStreamLogRecordDetails", () => {
  it("names the step and the process that wrote a record, its fields, and its record pretty-printed with every digit kept", () => {
    const record = logRecord(9, {
      processor_id: "Pdet",
      sent_by_its_own_process: true,
      level: "error",
      message: "model failed",
      attrs: { freed_gb: "12.4" },
      jsonl_line: '{"host_ts":1791759307069355001,"level":"error","attrs":{"freed_gb":12.40,"tags":[],"none":{}}}',
    });

    const details = presentStreamLogRecordDetails(record, FRONT_DOOR_GRAPH);

    expect(details.levelWord).toBe("ERROR");
    expect(details.levelTone).toBe("error");
    expect(details.step).toEqual({ stepKey: "Pdet", stepName: "persondetector", isAStepOfTheGraph: true });
    expect(details.processWords).toBe("own process");
    expect(details.fields).toEqual([{ key: "freed_gb", valueText: "12.4" }]);
    expect(presentStreamLogRecordDetails(logRecord(2, { attrs: { device: "FaceTime HD Camera", fps: "30" } }), null).fieldsTextToCopy).toBe('device="FaceTime HD Camera"  fps=30');
    expect(details.recordJsonLines).toEqual([
      "{",
      '  "host_ts": 1791759307069355001,',
      '  "level": "error",',
      '  "attrs": {',
      '    "freed_gb": 12.40,',
      '    "tags": [],',
      '    "none": {}',
      "  }",
      "}",
    ]);
    expect(presentStreamLogRecordDetails(logRecord(1), null).processWords).toBe("runtime");
  });
});

describe("prettyJsonLinesOf", () => {
  it("indents arrays and strings holding JSON punctuation as they are", () => {
    expect(prettyJsonLinesOf('{"m":"a, {b}: [c]","l":[1,"x"]}')).toEqual(["{", '  "m": "a, {b}: [c]",', '  "l": [', "    1,", '    "x"', "  ]", "}"]);
  });
});

describe("searchMatchRangesOf", () => {
  it("finds every match ignoring case and the search's own outer spaces, and none for an empty search", () => {
    expect(searchMatchRangesOf("Mean=127 mean=128", " MEAN= ")).toEqual([
      [0, 5],
      [9, 14],
    ]);
    expect(searchMatchRangesOf("aaaa", "aa")).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(searchMatchRangesOf("anything", "  ")).toEqual([]);
  });
});

describe("the pointer to records not held", () => {
  it("shows while some are not held and nothing is cleared or searched for", () => {
    expect(isEarlierRecordsPointerShown(3, EVERY_RECORD)).toBe(true);
    expect(isEarlierRecordsPointerShown(0, EVERY_RECORD)).toBe(false);
    expect(isEarlierRecordsPointerShown(3, { ...EVERY_RECORD, clearedThroughSequence: 9 })).toBe(false);
    expect(isEarlierRecordsPointerShown(3, { ...EVERY_RECORD, searchText: "x" })).toBe(false);
  });

  it("counts the earlier records and names the stream's log folder under its project, home shortened", () => {
    expect(earlierRecordsNotHeldWords(1)).toBe("1 earlier record is in");
    expect(earlierRecordsNotHeldWords(2312)).toBe("2,312 earlier records are in");
    expect(logFolderPathOfStream("/Users/jonathanf/streams/front-door")).toBe("~/streams/front-door/.streamlib/logs/");
  });
});

describe("streamLoadWords", () => {
  it("numbers a load the runtime numbers, and names any other as the runtime does", () => {
    expect(streamLoadWords("5")).toBe("Load #5");
    expect(streamLoadWords("front-door#2")).toBe("Load front-door#2");
  });
});

describe("presentStreamLogsOfAStreamNotLoaded", () => {
  const listing = (state: string, failedBecause: string | null): ListedStream => ({
    name: "lobby-recorder",
    state,
    project_directory: "/Users/jonathanf/streams/lobby-recorder",
    node_count: null,
    failed_because: failedBecause,
  });

  it("gives a failed stream its reason in the runtime's words, a loading one its loading words, and any other its not-loaded words", () => {
    expect(presentStreamLogsOfAStreamNotLoaded(listing("failed", "camera 0 is in use by another process"))).toEqual({
      hasFailed: true,
      title: "Failed to load",
      explanation: "camera 0 is in use by another process",
    });
    expect(presentStreamLogsOfAStreamNotLoaded(listing("kept", null))).toEqual({
      hasFailed: false,
      title: "Loading",
      explanation: "Its records show here once the runtime has loaded it.",
    });
    expect(presentStreamLogsOfAStreamNotLoaded(listing("stopped", null))).toEqual({
      hasFailed: false,
      title: "Not loaded",
      explanation: "The runtime holds records only for a loaded stream. Everything it wrote is in the stream's log folder.",
    });
  });
});
