// What a code area keeps in its settings, and the words its header and log show, apart from the
// view so each is read the same way in a test.

import type { CodeFileTab } from "@tatolab/tato-app-view-sdk/design_system/code_file_tab_strip";
import type { LogRecordLine } from "@tatolab/tato-app-view-sdk/design_system/log_record_lines";
import type { JsonValue, OpenProjectReading, ProjectLogRecord, ViewSettings } from "@tatolab/tato-app-view-sdk";

/** A code area's settings: the files it has open, in tab order, the one it shows, whether the project's log shows under it, and the opening it last took. */
export interface CodeViewSettings {
  [settingName: string]: JsonValue;
  open_files: string[];
  shown_file: string | null;
  logs_shown: boolean;
  /** The log's share of the area's height, in percent. */
  logs_size_percent: number;
  /** The id of the opening the area last took, so a frame loaded again does not take it a second time. */
  opening_taken: string | null;
}

/** A new code area: nothing open, the log shown. */
export const DEFAULT_CODE_VIEW_SETTINGS: CodeViewSettings = { open_files: [], shown_file: null, logs_shown: true, logs_size_percent: 30, opening_taken: null };

/** The area's `settings` as a code area's, showing the first open file when the shown one is not open; the defaults for what is not a code area's. */
export function codeViewSettingsOf(settings: ViewSettings): CodeViewSettings {
  if (settings === null) return DEFAULT_CODE_VIEW_SETTINGS;
  const { open_files: openFiles, shown_file: shownFile, logs_shown: logsShown, logs_size_percent: logsSizePercent, opening_taken: openingTaken } = settings;
  const files = Array.isArray(openFiles) ? openFiles.filter((file): file is string => typeof file === "string") : [];
  return {
    open_files: files,
    shown_file: typeof shownFile === "string" && files.includes(shownFile) ? shownFile : (files[0] ?? null),
    logs_shown: typeof logsShown === "boolean" ? logsShown : DEFAULT_CODE_VIEW_SETTINGS.logs_shown,
    logs_size_percent: typeof logsSizePercent === "number" && logsSizePercent > 0 && logsSizePercent < 100 ? logsSizePercent : DEFAULT_CODE_VIEW_SETTINGS.logs_size_percent,
    opening_taken: typeof openingTaken === "string" ? openingTaken : null,
  };
}

/** `settings` with `file` open and shown, its tab added at the end when it is new. */
export function withTheFileShown(settings: CodeViewSettings, file: string): CodeViewSettings {
  return { ...settings, open_files: settings.open_files.includes(file) ? settings.open_files : [...settings.open_files, file], shown_file: file };
}

/** `settings` with `file`'s tab closed, the tab after it shown in its place, or the one before when it was last. */
export function withTheFileClosed(settings: CodeViewSettings, file: string): CodeViewSettings {
  const closedIndex = settings.open_files.indexOf(file);
  if (closedIndex === -1) return settings;
  const openFiles = settings.open_files.filter((openFile) => openFile !== file);
  const shownFile = settings.shown_file !== file ? settings.shown_file : (openFiles[closedIndex] ?? openFiles[closedIndex - 1] ?? null);
  return { ...settings, open_files: openFiles, shown_file: shownFile };
}

function pathPartsOf(file: string): string[] {
  return file.split("/").filter((part) => part !== "");
}

/** Each open file's tab name: its file name, with as many of its folders before it as tell it apart from another open file of the same name. */
export function codeFileTabNames(files: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of files) {
    const parts = pathPartsOf(file);
    let partsShown = 1;
    const nameWith = (count: number, otherParts: string[]) => otherParts.slice(-count).join("/");
    const others = files.filter((other) => other !== file).map(pathPartsOf);
    while (partsShown < parts.length && others.some((otherParts) => nameWith(partsShown, otherParts) === nameWith(partsShown, parts))) partsShown += 1;
    names.set(file, nameWith(partsShown, parts));
  }
  return names;
}

/** The tabs of `openFiles`, each told whether it holds edits not saved and whether it opens read-only. */
export function codeFileTabsOf(openFiles: readonly string[], documentStateOf: (file: string) => { has_edits_not_saved: boolean; is_read_only: boolean }): CodeFileTab[] {
  const names = codeFileTabNames(openFiles);
  return openFiles.map((file) => ({ file, name: names.get(file) ?? file, ...documentStateOf(file) }));
}

/** The projects whose files the file menu offers: the open project first, then each folder import. */
export function projectsWithFilesToOffer(reading: OpenProjectReading | null): { project_name: string; project_folder: string }[] {
  if (reading?.kind !== "read") return [];
  const { open_project } = reading;
  return [
    { project_name: open_project.project.name, project_folder: open_project.project.folder },
    ...open_project.imports.flatMap((importedProject) =>
      importedProject.source.kind === "folder" ? [{ project_name: importedProject.source.project.name, project_folder: importedProject.source.project.folder }] : [],
    ),
  ];
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** A record's time of day on this machine's clock, to the millisecond; blank when it carries none. */
export function logRecordTimeWords(hostTimestampNanoseconds: number | null): string {
  if (hostTimestampNanoseconds === null) return "";
  const at = new Date(Math.floor(hostTimestampNanoseconds / 1_000_000));
  return `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}:${twoDigits(at.getSeconds())}.${String(at.getMilliseconds()).padStart(3, "0")}`;
}

/** A project's log record as the code pane's log shows it: its message, then its attributes as `key=value`. */
export function logRecordLineOf(record: ProjectLogRecord, recordIndex: number): LogRecordLine {
  const attributeWords = Object.entries(record.attrs).map(([key, value]) => `${key}=${value}`);
  return {
    line_id: `${recordIndex}:${record.host_ts_ns ?? ""}`,
    time_words: logRecordTimeWords(record.host_ts_ns),
    level: record.level,
    words: [record.message, ...attributeWords].join("  "),
  };
}
