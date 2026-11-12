import { expect, test } from "vitest";
import { projectLogRecordsConnectionOver, projectLogRecordsFollowedForTheWindows } from "./project_log_records_followed_for_the_windows.js";
import { succeeded } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** Against a real runtime holding a stream of the project: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> TATOLAB_APP_LIVE_PROJECT_DIRECTORY=<project directory> npx vitest run src/main/project_log_records_followed_for_the_windows.test.ts`. */
const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveProjectDirectory = process.env["TATOLAB_APP_LIVE_PROJECT_DIRECTORY"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveProjectDirectory === "")("a_real_runtime_pushes_a_write_to_a_followed_projects_log_to_its_window", async () => {
  const followed = projectLogRecordsFollowedForTheWindows({
    openThePushesConnection: async () => {
      const opened = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
      return opened.ok ? succeeded(projectLogRecordsConnectionOver(opened.value)) : opened;
    },
    waitThen: (afterMs, then) => {
      setTimeout(then, afterMs);
    },
    tatolabAppLog: quietTatolabAppLog,
  });
  const projectDirectoriesToldWritten: string[] = [];
  const studioWindow = { sendTheWindowTheProjectLogRecordsWritten: (projectDirectory: string) => projectDirectoriesToldWritten.push(projectDirectory) };
  followed.follow(liveProjectDirectory, studioWindow);
  await expect.poll(() => projectDirectoriesToldWritten.length, { timeout: 5_000 }).toBe(1);

  const reloader = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
  if (!reloader.ok) return expect.unreachable(reloader.failure.failureDescription);
  const reloaded = await reloader.value.callControlOperation("reload_project", { project_directory: liveProjectDirectory });
  reloader.value.close();

  expect(reloaded.ok && reloaded.value.kind).toBe("answered");
  await expect.poll(() => projectDirectoriesToldWritten.length, { timeout: 10_000 }).toBeGreaterThan(1);
  expect(new Set(projectDirectoriesToldWritten)).toEqual(new Set([liveProjectDirectory]));
  followed.stopFollowingEverySubject();
});
