// The new log records of every project a window follows, pushed by the runtime as
// `project_log_records_written`, which names a project by the directory the app subscribed to it
// as and carries the records written after the cursor `after`, up to `next_after`. A push whose
// records cannot be read reaches the window as a nudge to read `logs` on from its cursor.

import type { ProjectLogRecordsPushed } from "../shared/tatolab_backend_contract.js";
import { ControlPushesFollowedForTheWindows, type ControlPushesConnection, type ControlPushesFollowedForTheWindowsSources } from "./control_pushes_followed_for_the_windows.js";
import { jsonTextKeepingTheWrittenNumbers } from "./json_on_the_wire.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import { failedWith, succeeded } from "./result.js";
import type { ControlNotifications, TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** A window that follows project logs: where each write to one it follows goes. */
export interface WindowFollowingProjectLogs {
  sendTheWindowTheProjectLogRecordsWritten(projectDirectory: string, pushed: ProjectLogRecordsPushed | null): void;
}

/** Every project log the app's windows follow, each by its project directory. */
export type ProjectLogRecordsFollowedForTheWindows = ControlPushesFollowedForTheWindows<WindowFollowingProjectLogs, ProjectLogRecordsPushed | null>;

/** `controlWebSocketConnection` as the connection project logs are followed over: `subscribe_project_log_records`, and each `project_log_records_written` with its records. */
export function projectLogRecordsConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): ControlPushesConnection<ProjectLogRecordsPushed | null> {
  return {
    subscribeToThePushesOf: async (projectDirectory) => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_project_log_records", { project_directories: [projectDirectory] });
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
    },
    onPushed: (listener) => {
      controlWebSocketConnection.onNotification("project_log_records_written", (written) => listener(written.project_directory, projectLogRecordsPushedIn(written)));
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    isOpen: () => controlWebSocketConnection.isOpen(),
    close: () => controlWebSocketConnection.close(),
  };
}

/** The records `written` pushed, each read as a `logs` page's are, or `null` when they cannot be read. */
export function projectLogRecordsPushedIn(written: ControlNotifications["project_log_records_written"]): ProjectLogRecordsPushed | null {
  const pushedPage = projectLogRecordsPageFromTheLogsToolResult(jsonTextKeepingTheWrittenNumbers(written));
  if (!pushedPage.ok) return null;
  return { records: pushedPage.value.records, after: written.after, next_after: pushedPage.value.next_after, records_no_longer_held: pushedPage.value.records_no_longer_held };
}

/** The project logs the app's windows follow, each push handed to the windows following it. */
export function projectLogRecordsFollowedForTheWindows(
  sources: Omit<ControlPushesFollowedForTheWindowsSources<WindowFollowingProjectLogs, ProjectLogRecordsPushed | null>, "tellTheWindowItChanged" | "subjectAsTheLogNamesIt">,
): ProjectLogRecordsFollowedForTheWindows {
  return new ControlPushesFollowedForTheWindows({
    ...sources,
    tellTheWindowItChanged: (windowFollowing, projectDirectory, pushed) => windowFollowing.sendTheWindowTheProjectLogRecordsWritten(projectDirectory, pushed),
    subjectAsTheLogNamesIt: "project log",
  });
}
