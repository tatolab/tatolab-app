// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, test } from "vitest";
import { createTatolabAppLog, formatTatolabAppLogLine, tatolabAppLogLevelNamed } from "./tatolab_app_log.js";

describe("tatolab_app_log", () => {
  test("a line names its level, its message and each field, quoting a field that holds a space", () => {
    expect(formatTatolabAppLogLine("warn", "the window did not respond", { what_was_asked: "show", failure: "no window" })).toBe(
      ' WARN the window did not respond what_was_asked=show failure="no window"',
    );
  });

  test("a log writes its level and every level above it, and nothing more verbose", () => {
    const writtenLogLines: string[] = [];
    const tatolabAppLog = createTatolabAppLog("warn", (logLine) => writtenLogLines.push(logLine));
    tatolabAppLog.error("an error");
    tatolabAppLog.warn("a warning");
    tatolabAppLog.info("some information");
    tatolabAppLog.debug("a detail");
    expect(writtenLogLines).toEqual(["ERROR an error", " WARN a warning"]);
  });

  test("TATOLAB_APP_LOG names a level, and anything else means info", () => {
    expect(tatolabAppLogLevelNamed("debug")).toBe("debug");
    expect(tatolabAppLogLevelNamed("verbose")).toBe("info");
    expect(tatolabAppLogLevelNamed(undefined)).toBe("info");
  });
});
