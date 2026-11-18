// The new log records of every project a window follows, pushed by the runtime as
// `project_log_records_written`, which names a project by the directory the app subscribed to it
// as and carries the records written after the cursor `after`, up to `next_after`. A push whose
// records cannot be read reaches the window as a nudge to read `logs` on from its cursor.

import { Effect, Stream } from "effect";
import type { ProjectLogRecordsPushed } from "../shared/tatolab_backend_contract.js";
import type { ControlPushesFeed, ControlPushesFollowed } from "./control_pushes_followed_for_the_windows.js";
import { jsonTextKeepingTheWrittenNumbers } from "./json_on_the_wire.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import type { ControlNotifications } from "./tatolab_runtime_control_operation_call.js";

/** A window that follows project logs: where each write to one it follows goes. */
export interface WindowFollowingProjectLogs {
  sendTheWindowTheProjectLogRecordsWritten(projectDirectory: string, pushed: ProjectLogRecordsPushed | null): void;
}

/** Every project log the app's windows follow, each by its project directory. */
export type ProjectLogRecordsFollowedForTheWindows = ControlPushesFollowed<WindowFollowingProjectLogs>;

/** Project logs as followed on a connection: `subscribe_project_log_records`, and each `project_log_records_written` with its records. */
export const PROJECT_LOG_RECORDS_WRITTEN: ControlPushesFeed<ProjectLogRecordsPushed | null> = {
  subjectAsTheLogNamesIt: "project log",
  subscribe: (connection, projectDirectory) => connection.call("subscribe_project_log_records", { project_directories: [projectDirectory] }).pipe(Effect.asVoid),
  pushes: (connection) =>
    connection.notifications("project_log_records_written").pipe(Stream.map((written) => ({ subject: written.project_directory, pushed: projectLogRecordsPushedIn(written) }))),
};

/** The records `written` pushed, each read as a `logs` page's are, or `null` when they cannot be read. */
export function projectLogRecordsPushedIn(written: ControlNotifications["project_log_records_written"]): ProjectLogRecordsPushed | null {
  const pushedPage = projectLogRecordsPageFromTheLogsToolResult(jsonTextKeepingTheWrittenNumbers(written));
  if (!pushedPage.ok) return null;
  return { records: pushedPage.value.records, after: written.after, next_after: pushedPage.value.next_after, records_no_longer_held: pushedPage.value.records_no_longer_held };
}

/** Hand `windowFollowing` the records the runtime pushed of `projectDirectory`'s log, or `null` to read it again. */
export function tellTheWindowTheProjectLogRecordsWritten(windowFollowing: WindowFollowingProjectLogs, projectDirectory: string, pushed: ProjectLogRecordsPushed | null): void {
  windowFollowing.sendTheWindowTheProjectLogRecordsWritten(projectDirectory, pushed);
}
