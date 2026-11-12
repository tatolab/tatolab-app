// The new log records of every project a window follows, pushed by the runtime as
// `project_log_records_written`, which names a project by the directory the app subscribed to it
// as and carries no records: the window reads `logs` on from its cursor.

import { ControlPushesFollowedForTheWindows, type ControlPushesConnection, type ControlPushesFollowedForTheWindowsSources } from "./control_pushes_followed_for_the_windows.js";
import { failedWith, succeeded } from "./result.js";
import type { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

/** A window that follows project logs: where each write to one it follows goes. */
export interface WindowFollowingProjectLogs {
  sendTheWindowTheProjectLogRecordsWritten(projectDirectory: string): void;
}

/** Every project log the app's windows follow, each by its project directory. */
export type ProjectLogRecordsFollowedForTheWindows = ControlPushesFollowedForTheWindows<WindowFollowingProjectLogs>;

/** `controlWebSocketConnection` as the connection project logs are followed over: `subscribe_project_log_records`, and each `project_log_records_written`. */
export function projectLogRecordsConnectionOver(controlWebSocketConnection: TatolabRuntimeControlWebSocketConnection): ControlPushesConnection {
  return {
    subscribeToThePushesOf: async (projectDirectory) => {
      const subscribed = await controlWebSocketConnection.callControlOperation("subscribe_project_log_records", { project_directories: [projectDirectory] });
      if (!subscribed.ok) return failedWith(subscribed.failure.failureDescription);
      return subscribed.value.kind === "refused_by_the_operation" ? failedWith(subscribed.value.words) : succeeded(undefined);
    },
    onPushed: (listener) => {
      controlWebSocketConnection.onNotification("project_log_records_written", (written) => listener(written.project_directory));
    },
    onClosed: (whenTheConnectionCloses) => controlWebSocketConnection.onClosed(whenTheConnectionCloses),
    isOpen: () => controlWebSocketConnection.isOpen(),
    close: () => controlWebSocketConnection.close(),
  };
}

/** The project logs the app's windows follow, each write told to the windows following it. */
export function projectLogRecordsFollowedForTheWindows(
  sources: Omit<ControlPushesFollowedForTheWindowsSources<WindowFollowingProjectLogs>, "tellTheWindowItChanged" | "subjectAsTheLogNamesIt">,
): ProjectLogRecordsFollowedForTheWindows {
  return new ControlPushesFollowedForTheWindows({
    ...sources,
    tellTheWindowItChanged: (windowFollowing, projectDirectory) => windowFollowing.sendTheWindowTheProjectLogRecordsWritten(projectDirectory),
    subjectAsTheLogNamesIt: "project log",
  });
}
