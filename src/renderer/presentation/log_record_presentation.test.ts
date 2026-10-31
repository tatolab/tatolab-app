import { describe, expect, it } from "vitest";
import type { StreamGraphSummary } from "../../shared/tatolab_backend_contract";
import type { HeldProjectLogRecord } from "../project_log_readings";
import {
  formatLogAttrValue,
  formatLogRecordDateAndTime,
  formatLogRecordTime,
  actionKeyOfTheLastFailure,
  isEarlierRecordsPointerShown,
  jsonlOfStreamLogRows,
  levelFilterOfLogRecord,
  logFolderPathOfProject,
  presentLogLevelWord,
  presentStreamLog,
  presentStreamLogRecordDetails,
  prettyJsonLinesOf,
  searchMatchRangesOf,
  STREAM_LOG_LEVEL_FILTERS,
  type StreamLogFilters,
} from "./log_record_presentation";

function logRecord(sequence: number, recordChanges: Partial<HeldProjectLogRecord> = {}): HeldProjectLogRecord {
  return {
    position: sequence,
    host_ts_ns: null,
    level: "info",
    source: "rust",
    target: "streamlib_engine::core::runtime::loaded_stream",
    message: `record ${sequence}`,
    attrs: {},
    processor_id: null,
    sent_by_its_own_process: false,
    action: "R1-2",
    stream: "front-door-main-8a1b2c",
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

const EVERY_RECORD: StreamLogFilters = { searchText: "", levelFilter: "all", shownStepKeys: new Set(), shownActionKey: null, clearedThroughPosition: 0 };

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
    expect(streamLog.rows.map((row) => row.record.position)).toEqual([3]);
  });

  it("words the step filter as every step, the one chosen, or how many of how many", () => {
    const stepFilterWordsFor = (shownStepKeys: string[]) => presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, shownStepKeys: new Set(shownStepKeys) }).stepFilterWords;

    expect(stepFilterWordsFor([])).toEqual({ words: "All nodes", isOneStepChosen: false });
    expect(stepFilterWordsFor(["Pcam", ""])).toEqual({ words: "2 of 4", isOneStepChosen: false });
  });

  it("searches step names and the message line as the row shows it, quoted values and spacing included", () => {
    const sequencesFound = (searchText: string) => presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, searchText }).rows.map((row) => row.record.position);

    expect(sequencesFound('device="FaceTime')).toEqual([2]);
    expect(sequencesFound("opened  device")).toEqual([2]);
    expect(sequencesFound("opened device")).toEqual([]);
  });

  it("searches messages, step names and key=value fields, ignoring case", () => {
    const sequencesFound = (searchText: string) => presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, searchText }).rows.map((row) => row.record.position);

    expect(sequencesFound("CAMERA OPENED")).toEqual([2]);
    expect(sequencesFound("persondetector")).toEqual([3, 4]);
    expect(sequencesFound("dropped=3")).toEqual([3]);
    expect(sequencesFound("  ")).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves out the records cleared, and says why nothing shows", () => {

    const cleared = presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, clearedThroughPosition: 5 });
    expect(cleared.rows).toEqual([]);
    expect(cleared.emptyWords).toBe("Cleared. New lines appear here.");
    expect(presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, clearedThroughPosition: 3 }).rows.map((row) => row.record.position)).toEqual([4, 5]);
    expect(presentStreamLog(records, FRONT_DOOR_GRAPH, { ...EVERY_RECORD, searchText: "nothing like it" }).emptyWords).toBe("No lines match.");
    expect(presentStreamLog([], FRONT_DOOR_GRAPH, EVERY_RECORD).emptyWords).toBe("No log records yet. New ones show up here as they are written.");
    expect(presentStreamLog(records, FRONT_DOOR_GRAPH, EVERY_RECORD).emptyWords).toBeNull();
  });

  it("divides the rows by day only when they span more than one", () => {
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).getTime() * 1_000_000;
    const recordsOverTwoDays = [logRecord(1, { host_ts_ns: at(19, 23) }), logRecord(2, { host_ts_ns: at(20, 1) }), logRecord(3, { host_ts_ns: at(20, 2) })];

    expect(presentStreamLog(recordsOverTwoDays, null, EVERY_RECORD).rows.map((row) => row.dayDividerWords)).toEqual(["Monday, October 19", "Tuesday, October 20", null]);
    expect(presentStreamLog(recordsOverTwoDays.slice(1), null, EVERY_RECORD).rows.map((row) => row.dayDividerWords)).toEqual([null, null]);
  });

  it("narrows the rows to one stream action, offers each action in the order it began, and divides the rows by action only when they hold more than one", () => {
    const at = (second: number) => new Date(2026, 9, 31, 16, 2, second).getTime() * 1_000_000;
    const recordsOfTwoActions = [
      logRecord(1, { action: "R1-2", host_ts_ns: at(1) }),
      logRecord(2, { action: "R1-2", host_ts_ns: at(2) }),
      logRecord(3, { action: "R1-5", host_ts_ns: at(30) }),
      logRecord(4, { action: null, host_ts_ns: at(31) }),
    ];

    const everyAction = presentStreamLog(recordsOfTwoActions, null, EVERY_RECORD);
    expect(everyAction.rows.map((row) => row.actionDividerWords)).toEqual(["Action at 16:02:01", null, "Action at 16:02:30", "Not under a stream action"]);
    expect(everyAction.actionChoices).toEqual([
      { actionKey: "R1-2", actionWords: "Action at 16:02:01" },
      { actionKey: "R1-5", actionWords: "Action at 16:02:30" },
      { actionKey: "", actionWords: "Not under a stream action" },
    ]);
    expect(everyAction.actionFilterWords).toBe("All actions");
    const oneAction = presentStreamLog(recordsOfTwoActions, null, { ...EVERY_RECORD, shownActionKey: "R1-5" });
    expect(oneAction.rows.map((row) => [row.record.position, row.actionDividerWords])).toEqual([[3, null]]);
    expect(oneAction.actionFilterWords).toBe("Action at 16:02:30");
    expect(oneAction.actionChoices).toHaveLength(3);
    expect(presentStreamLog(recordsOfTwoActions, null, { ...EVERY_RECORD, shownActionKey: "R1-9" }).actionFilterWords).toBe("One action");
  });

  it("numbers the actions begun in the same second, and names an action whose first record has no timestamp plainly", () => {
    const at = (millisecond: number) => new Date(2026, 9, 31, 16, 2, 1, millisecond).getTime() * 1_000_000;
    const recordsOfThreeActions = [
      logRecord(1, { action: "R1-2", host_ts_ns: at(100) }),
      logRecord(2, { action: "R1-3", host_ts_ns: at(400) }),
      logRecord(3, { action: "R1-4", host_ts_ns: at(800) }),
      logRecord(4, { action: "R1-5", host_ts_ns: null }),
    ];

    expect(presentStreamLog(recordsOfThreeActions, null, EVERY_RECORD).actionChoices.map((actionChoice) => actionChoice.actionWords)).toEqual([
      "Action at 16:02:01",
      "Action at 16:02:01 (2)",
      "Action at 16:02:01 (3)",
      "Action",
    ]);
  });

  it("finds the action that failed a stream: its last error's, else its last record's", () => {
    expect(actionKeyOfTheLastFailure([logRecord(1, { action: "R1-2", level: "error" }), logRecord(2, { action: "R1-7", level: "error" }), logRecord(3, { action: "R1-8" })])).toBe("R1-7");
    expect(actionKeyOfTheLastFailure([logRecord(1, { action: "R1-2" }), logRecord(2, { action: "R1-3" })])).toBe("R1-3");
    expect(actionKeyOfTheLastFailure([])).toBeNull();
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

    const sourceNames = { displayNamesByStreamId: new Map([["front-door-main-8a1b2c", "main"]]), actionChoices: [{ actionKey: "R1-2", actionWords: "Action at 16:02:01" }] };
    const details = presentStreamLogRecordDetails(record, FRONT_DOOR_GRAPH, sourceNames);

    expect(details.levelWord).toBe("ERROR");
    expect(details.levelTone).toBe("error");
    expect(details.step).toEqual({ stepKey: "Pdet", stepName: "persondetector", isAStepOfTheGraph: true });
    expect([details.streamWords, details.actionWords]).toEqual(["main", "Action at 16:02:01"]);
    const recordOfTheProject = presentStreamLogRecordDetails(logRecord(3, { stream: null, action: null }), null, sourceNames);
    expect([recordOfTheProject.streamWords, recordOfTheProject.actionWords]).toEqual(["None, the project wrote it", "Not under a stream action"]);
    const recordOfAStreamNotListed = presentStreamLogRecordDetails(logRecord(4, { stream: "lobby-recorder-1c2d3e", action: "R1-9" }), null, sourceNames);
    expect([recordOfAStreamNotListed.streamWords, recordOfAStreamNotListed.actionWords]).toEqual(["lobby-recorder-1c2d3e", "One action"]);
    expect(details.fields).toEqual([{ key: "freed_gb", valueText: "12.4" }]);
    expect(presentStreamLogRecordDetails(logRecord(2, { attrs: { device: "FaceTime HD Camera", fps: "30" } }), null, sourceNames).fieldsTextToCopy).toBe('device="FaceTime HD Camera"  fps=30');
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
    expect(isEarlierRecordsPointerShown(true, EVERY_RECORD)).toBe(true);
    expect(isEarlierRecordsPointerShown(false, EVERY_RECORD)).toBe(false);
    expect(isEarlierRecordsPointerShown(true, { ...EVERY_RECORD, clearedThroughPosition: 9 })).toBe(false);
    expect(isEarlierRecordsPointerShown(true, { ...EVERY_RECORD, searchText: "x" })).toBe(false);
  });

  it("names the project's log folder, home shortened", () => {
    expect(logFolderPathOfProject("/Users/jonathanf/streams/front-door")).toBe("~/streams/front-door/.streamlib/logs/");
  });
});
