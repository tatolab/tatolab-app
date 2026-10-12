import { describe, expect, it } from "vitest";
import {
  formatLogAttrValue,
  formatLogRecordTime,
  LOG_LEVEL_SEGMENTS,
  presentLogLevelWord,
  rankLogLevel,
} from "./log_record_presentation";

describe("rankLogLevel", () => {
  it("orders the runtime's levels and ranks an unknown one as info", () => {
    expect(rankLogLevel("trace")).toBeLessThan(rankLogLevel("debug"));
    expect(rankLogLevel("debug")).toBeLessThan(rankLogLevel("info"));
    expect(rankLogLevel("info")).toBeLessThan(rankLogLevel("warn"));
    expect(rankLogLevel("warn")).toBeLessThan(rankLogLevel("error"));
    expect(rankLogLevel("notice")).toBe(rankLogLevel("info"));
    expect(rankLogLevel(null)).toBe(rankLogLevel("info"));
  });
});

describe("formatLogRecordTime", () => {
  it("writes the local time to the millisecond", () => {
    const recordedAt = new Date(2026, 9, 11, 18, 55, 7, 359);
    expect(formatLogRecordTime(recordedAt.getTime() * 1_000_000)).toBe("18:55:07.359");
  });

  it("reads a nanosecond stamp past 2^53 to the millisecond", () => {
    const formatted = formatLogRecordTime(1791757115431254000);
    expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}\.431$/);
  });

  it("holds the column for a record without a stamp", () => {
    expect(formatLogRecordTime(null)).toBe("--:--:--.---");
  });
});

describe("formatLogAttrValue", () => {
  it("quotes a value only when it is empty or holds a space, = or a quote", () => {
    expect(formatLogAttrValue("127.5")).toBe("127.5");
    expect(formatLogAttrValue("nodes.inverting_effect:InvertingEffect")).toBe("nodes.inverting_effect:InvertingEffect");
    expect(formatLogAttrValue("FaceTime HD Camera")).toBe('"FaceTime HD Camera"');
    expect(formatLogAttrValue("")).toBe('""');
    expect(formatLogAttrValue("a=b")).toBe('"a=b"');
  });
});

describe("LOG_LEVEL_SEGMENTS", () => {
  it("shows everything, warn and above, or errors alone, and counts warn and error lines each at their own level", () => {
    expect(LOG_LEVEL_SEGMENTS.map((segment) => segment.label)).toEqual(["All", "Warnings", "Errors"]);
    const [allSegment, warningsSegment, errorsSegment] = LOG_LEVEL_SEGMENTS;
    expect(allSegment.minimumRank).toBe(rankLogLevel("trace"));
    expect(allSegment.countedRank).toBeNull();
    expect(warningsSegment.minimumRank).toBe(rankLogLevel("warn"));
    expect(warningsSegment.countedRank).toBe(rankLogLevel("warn"));
    expect(errorsSegment.minimumRank).toBe(rankLogLevel("error"));
    expect(errorsSegment.countedRank).toBe(rankLogLevel("error"));
  });
});

describe("presentLogLevelWord", () => {
  it("quiets trace and debug, colours only warn and error, and reads an unknown level as info", () => {
    expect(presentLogLevelWord("trace")).toBe("quiet");
    expect(presentLogLevelWord("debug")).toBe("quiet");
    expect(presentLogLevelWord("info")).toBe("plain");
    expect(presentLogLevelWord("notice")).toBe("plain");
    expect(presentLogLevelWord(null)).toBe("plain");
    expect(presentLogLevelWord("WARN")).toBe("warn");
    expect(presentLogLevelWord("error")).toBe("error");
  });
});
