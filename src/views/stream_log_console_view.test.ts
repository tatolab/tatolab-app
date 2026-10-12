// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { StreamLogRecord } from "../backend/tatolab_backend_contract";
import { StreamLogConsoleView } from "./stream_log_console_view";

function logRecord(sequence: number, level: string, message: string): StreamLogRecord {
  return { sequence, host_ts_ns: null, level, source: "python", target: null, message, attrs: {} };
}

function shownMessages(logConsole: StreamLogConsoleView): string[] {
  return [...logConsole.element.querySelectorAll<HTMLElement>(".log-line")]
    .filter((line) => !line.hidden)
    .map((line) => line.querySelector(".log-line-message")?.textContent ?? "");
}

function segmentCount(logConsole: StreamLogConsoleView, segmentLabel: string): HTMLElement {
  return logConsole.element.querySelector<HTMLElement>(`[data-segment="${segmentLabel}"] .segmented-control-count`)!;
}

describe("StreamLogConsoleView", () => {
  const records = [
    logRecord(1, "info", "loading"),
    logRecord(2, "warn", "escalate rate"),
    logRecord(3, "error", "read skipped"),
    logRecord(4, "warn", "frame dropped"),
  ];

  it("counts the held warn and error lines on their segments", () => {
    const logConsole = new StreamLogConsoleView("main", "macos");
    logConsole.appendRecords(records);
    expect(segmentCount(logConsole, "Warnings").textContent).toBe("2");
    expect(segmentCount(logConsole, "Errors").textContent).toBe("1");
    expect(segmentCount(logConsole, "Errors").hidden).toBe(false);
  });

  it("shows warn and above under Warnings, and errors alone under Errors", () => {
    const logConsole = new StreamLogConsoleView("main", "macos");
    logConsole.appendRecords(records);
    logConsole.element.querySelector<HTMLButtonElement>('[data-segment="Warnings"]')?.click();
    expect(shownMessages(logConsole)).toEqual(["escalate rate", "read skipped", "frame dropped"]);
    logConsole.showErrorLinesOnly();
    expect(shownMessages(logConsole)).toEqual(["read skipped"]);
  });

  it("sizes the filter field by its own hint, so the whole placeholder always shows", () => {
    const logConsole = new StreamLogConsoleView("main", "linux");
    const filterInput = logConsole.element.querySelector<HTMLInputElement>(".filter-field-input")!;
    const placeholderMeasure = logConsole.element.querySelector(".log-dock-filter-placeholder-measure")!;
    expect(placeholderMeasure.textContent).toBe(filterInput.placeholder);
    expect(placeholderMeasure.getAttribute("aria-hidden")).toBe("true");
    expect(filterInput.parentElement).toBe(placeholderMeasure.parentElement);
  });

  it("clears the text filter on the first Esc and leaves the field on the second", () => {
    const logConsole = new StreamLogConsoleView("main", "macos");
    document.body.replaceChildren(logConsole.element);
    logConsole.appendRecords(records);
    const filterInput = logConsole.element.querySelector<HTMLInputElement>(".filter-field-input")!;
    logConsole.focusTextFilter();
    filterInput.value = "dropped";
    filterInput.dispatchEvent(new Event("input"));
    expect(shownMessages(logConsole)).toEqual(["frame dropped"]);
    filterInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(filterInput.value).toBe("");
    expect(shownMessages(logConsole)).toHaveLength(4);
    expect(document.activeElement).toBe(filterInput);
    filterInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).not.toBe(filterInput);
  });

  it("says when no line matches the filter", () => {
    const logConsole = new StreamLogConsoleView("main", "macos");
    logConsole.appendRecords(records);
    const filterInput = logConsole.element.querySelector<HTMLInputElement>(".filter-field-input")!;
    filterInput.value = "nothing like this";
    filterInput.dispatchEvent(new Event("input"));
    expect(logConsole.element.querySelector(".log-dock-message")?.textContent).toBe("No lines match “nothing like this”.");
  });
});
