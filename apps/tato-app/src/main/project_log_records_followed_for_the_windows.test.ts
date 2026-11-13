import { expect, test } from "vitest";
import { projectLogRecordsConnectionOver, projectLogRecordsFollowedForTheWindows, projectLogRecordsPushedIn } from "./project_log_records_followed_for_the_windows.js";
import type { ProjectLogRecordsPushed } from "../shared/tatolab_backend_contract.js";
import { succeeded } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { TatolabRuntimeControlWebSocketConnection } from "./tatolab_runtime_control_operation_call.js";

const quietTatolabAppLog = createTatolabAppLog("error", () => {});

/** Against a real runtime holding a stream of the project: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> TATOLAB_APP_LIVE_PROJECT_DIRECTORY=<project directory> npx vitest run src/main/project_log_records_followed_for_the_windows.test.ts`. */
const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveProjectDirectory = process.env["TATOLAB_APP_LIVE_PROJECT_DIRECTORY"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveProjectDirectory === "")("a_real_runtime_pushes_the_records_written_to_a_followed_projects_log_to_its_window_each_push_following_the_last", async () => {
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
  const recordsPushed: ProjectLogRecordsPushed[] = [];
  const studioWindow = {
    sendTheWindowTheProjectLogRecordsWritten: (projectDirectory: string, pushed: ProjectLogRecordsPushed | null) => {
      projectDirectoriesToldWritten.push(projectDirectory);
      if (pushed !== null) recordsPushed.push(pushed);
    },
  };
  followed.follow(liveProjectDirectory, studioWindow);
  await expect.poll(() => projectDirectoriesToldWritten.length, { timeout: 5_000 }).toBe(1);

  const reloader = await TatolabRuntimeControlWebSocketConnection.open(liveLocalApiSocket, 5_000);
  if (!reloader.ok) return expect.unreachable(reloader.failure.failureDescription);
  const reloaded = await reloader.value.callControlOperation("reload_project", { project_directory: liveProjectDirectory });
  reloader.value.close();

  expect(reloaded.ok && reloaded.value.kind).toBe("answered");
  await expect.poll(() => projectDirectoriesToldWritten.length, { timeout: 10_000 }).toBeGreaterThan(1);
  expect(new Set(projectDirectoriesToldWritten)).toEqual(new Set([liveProjectDirectory]));
  await expect.poll(() => recordsPushed.flatMap((pushed) => pushed.records).length, { timeout: 10_000 }).toBeGreaterThan(0);
  for (const [pushIndex, pushed] of recordsPushed.entries()) {
    if (pushIndex > 0) expect(pushed.after).toBe(recordsPushed[pushIndex - 1]?.next_after);
  }
  followed.stopFollowingEverySubject();
});

test("a_pushed_records_host_timestamp_keeps_the_digits_the_runtime_wrote_and_the_push_keeps_its_cursors", () => {
  const pushed = projectLogRecordsPushedIn({
    project_directory: "/tmp/tatolab-proof-projects/pattern",
    records: [{ host_ts: 1763049600123456789n, level: "info", message: "[start] Starting the stream `pattern-main-d76f70`", stream: "pattern-main-d76f70" }],
    after: "1:7830",
    next_after: "1:7951",
    records_no_longer_held: false,
  });

  expect(pushed?.after).toBe("1:7830");
  expect(pushed?.next_after).toBe("1:7951");
  expect(pushed?.records_no_longer_held).toBe(false);
  expect(pushed?.records.map((record) => [record.stream, record.message])).toEqual([["pattern-main-d76f70", "[start] Starting the stream `pattern-main-d76f70`"]]);
  expect(pushed?.records[0]?.jsonl_line).toContain("1763049600123456789");
});
