import { describe, expect, it } from "vitest";
import type { ProjectLogRecord } from "@tatolab/tato-app-view-sdk";
import { codeFileTabNames, codeViewSettingsOf, DEFAULT_CODE_VIEW_SETTINGS, logRecordLineOf, withTheFileClosed, withTheFileShown } from "./code_view_settings";

const PATTERN = "/home/jonathanf/streams/pattern";

describe("a code area's settings and words", () => {
  it("reads an area's settings, showing the first open file when the shown one is not open, and the defaults for what is not a code area's", () => {
    expect(codeViewSettingsOf({ open_files: [`${PATTERN}/stream.py`, 7], shown_file: "/elsewhere.py", logs_shown: false })).toEqual({
      open_files: [`${PATTERN}/stream.py`],
      shown_file: `${PATTERN}/stream.py`,
      logs_shown: false,
      logs_size_percent: DEFAULT_CODE_VIEW_SETTINGS.logs_size_percent,
      opened_on_file: null,
    });
    expect(codeViewSettingsOf(null)).toEqual(DEFAULT_CODE_VIEW_SETTINGS);
    expect(codeViewSettingsOf({ shown_file: "x" })).toMatchObject({ open_files: [], shown_file: null });
  });

  it("opens a file at the end of the tabs, and closing the shown one shows its neighbour", () => {
    const opened = withTheFileShown(withTheFileShown(withTheFileShown(DEFAULT_CODE_VIEW_SETTINGS, "/a.py"), "/b.py"), "/c.py");
    expect(withTheFileShown(opened, "/a.py")).toMatchObject({ open_files: ["/a.py", "/b.py", "/c.py"], shown_file: "/a.py" });
    expect(withTheFileClosed({ ...opened, shown_file: "/b.py" }, "/b.py")).toMatchObject({ open_files: ["/a.py", "/c.py"], shown_file: "/c.py" });
    expect(withTheFileClosed(opened, "/c.py")).toMatchObject({ shown_file: "/b.py" });
    expect(withTheFileClosed(opened, "/a.py")).toMatchObject({ shown_file: "/c.py" });
    expect(withTheFileClosed(withTheFileShown(DEFAULT_CODE_VIEW_SETTINGS, "/a.py"), "/a.py")).toMatchObject({ open_files: [], shown_file: null });
  });

  it("names a tab by its file name, with the folders that tell two of the same name apart", () => {
    const names = codeFileTabNames([`${PATTERN}/stream.py`, "/home/jonathanf/streams/camera/stream.py", `${PATTERN}/nodes/inverting_effect.py`]);
    expect([...names.values()]).toEqual(["pattern/stream.py", "camera/stream.py", "inverting_effect.py"]);
  });

  it("writes a log record as its message then its attributes", () => {
    const record: ProjectLogRecord = {
      host_ts_ns: null,
      level: "info",
      source: "python",
      target: "nodes.brightness_meter",
      message: "brightness",
      attrs: { mean: "112.4" },
      processor_id: "brightnessmeter",
      sent_by_its_own_process: true,
      action: null,
      stream: "pattern-main-1a2b",
      jsonl_line: "{}",
    };
    expect(logRecordLineOf(record, 0)).toEqual({ line_id: "0:", time_words: "", level: "info", words: "brightness  mean=112.4" });
  });
});
