// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The commands the window's frontend invokes, under the names it invokes them by. A request that
// changes the machine starts in the background, as the tray's choices do, and its outcome reaches
// the window as the next `tatolab-status-changed`. A question the window awaits is answered with
// its answer or a refusal in words, never a thrown error.

import type { StreamGraphSummary, StreamLogRecordsPage, TatolabStatus, TatolabStreamActionName } from "../../src/backend/tatolab_backend_contract.js";
import type { TatolabCommandAnswerTo, TatolabCommandName } from "../../src/backend/tatolab_electron_bridge_contract.js";
import { isAJsonObject, isAnUnsignedInteger } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import {
  checkForTatolabAppUpdatesOnRequest,
  runInTheBackgroundWithTheController,
  setUpTatolabOnRequest,
  type TatolabAppSharedState,
} from "./tatolab_app_shared_state.js";

/** How long `get_tatolab_status` waits for the poller's first round when the window asks first. */
const FIRST_STATUS_ROUND_WAIT_LIMIT_MS = 15_000;

/** `work`'s answer to the command `commandName`; a failure nothing expected becomes a refusal naming the command. */
export async function answerTheWindow<Answer>(commandName: string, work: () => Promise<Result<Answer, string>>): Promise<Result<Answer, string>> {
  try {
    return await work();
  } catch (unexpectedFailure) {
    return failedWith(`${commandName} ended without an answer: ${describeCaughtFailure(unexpectedFailure)}`);
  }
}

/** `get_tatolab_status`: the status as of the poller's last round. */
export function getTatolabStatus(sharedState: TatolabAppSharedState): Promise<Result<TatolabStatus, string>> {
  return answerTheWindow("get_tatolab_status", async () => {
    const status = await sharedState.statusPublisher.lastPublishedStatusWaitingUpTo(FIRST_STATUS_ROUND_WAIT_LIMIT_MS);
    return status === null ? failedWith("Tatolab has not observed the runtime yet") : succeeded(status);
  });
}

/** `set_run_tatolab { enabled }`: turn "Run Tatolab" on or off. */
export function setRunTatolab(sharedState: TatolabAppSharedState, enabled: boolean): void {
  runInTheBackgroundWithTheController(sharedState, "tatolab-run-tatolab-set", async (controller, statusPublisher) => {
    await controller.setRunTatolab(enabled);
    statusPublisher.requestRefresh();
  });
}

/** `open_login_items_settings`: open System Settings at Login Items, where a user approves the runtime's login item; refused where the platform has no Login Items. */
export function openLoginItemsSettings(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindow("open_login_items_settings", () => sharedState.controller.openLoginItemsSettings());
}

/** `set_up_tatolab`: the one administrator prompt, as the tray's item shows it; refused where the platform has no machine setup. */
export function setUpTatolab(sharedState: TatolabAppSharedState): Result<void, string> {
  return setUpTatolabOnRequest(sharedState);
}

/** `uninstall_tatolab`: uninstall Tatolab, turning "Run Tatolab" off first and ending with the app quitting; refused in words, leaving the app usable, and at once on Linux, where the installer uninstalls. */
export function uninstallTatolab(sharedState: TatolabAppSharedState): Promise<Result<void, string>> {
  return answerTheWindow("uninstall_tatolab", () => sharedState.tatolabUninstall.uninstallTatolab(sharedState.controller));
}

/** `read_stream_log_records { stream, after }`: `stream`'s log records numbered after `after`; refused in the runtime's own words. */
export function readStreamLogRecords(sharedState: TatolabAppSharedState, stream: string, after: number): Promise<Result<StreamLogRecordsPage, string>> {
  return answerTheWindow("read_stream_log_records", async () => {
    const page = await sharedState.controller.readStreamLogRecords(stream, after);
    return page.ok ? page : failedWith(page.failure.failureDescription);
  });
}

/** `describe_stream_graph { stream }`: the graph of the loaded stream `stream`; refused in the runtime's own words. */
export function describeStreamGraph(sharedState: TatolabAppSharedState, stream: string): Promise<Result<StreamGraphSummary, string>> {
  return answerTheWindow("describe_stream_graph", async () => {
    const summary = await sharedState.controller.describeStreamGraph(stream);
    return summary.ok ? summary : failedWith(summary.failure.failureDescription);
  });
}

/** `stop_stream`, `start_stream` or `remove_stream { stream }`: the runtime's tool of that name run on `stream`, then a status round whether it acted or refused; its notice or its refusal in its own words. */
export function runStreamAction(sharedState: TatolabAppSharedState, streamAction: TatolabStreamActionName, stream: string): Promise<Result<string | null, string>> {
  return answerTheWindow(streamAction, async () => {
    const notice = await sharedState.controller.runStreamAction(streamAction, stream);
    sharedState.statusPublisher.requestRefresh();
    return notice.ok ? notice : failedWith(notice.failure.failureDescription);
  });
}

/** `set_run_tatolab`'s arguments as the window sends them, or why they are not. */
export function setRunTatolabArgumentsFrom(commandArguments: unknown): Result<{ enabled: boolean }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["enabled"] !== "boolean") {
    return failedWith("set_run_tatolab needs `enabled`, true or false");
  }
  return succeeded({ enabled: commandArguments["enabled"] });
}

/** `read_stream_log_records`'s arguments as the window sends them, or why they are not. */
export function readStreamLogRecordsArgumentsFrom(commandArguments: unknown): Result<{ stream: string; after: number }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["stream"] !== "string" || !isAnUnsignedInteger(commandArguments["after"])) {
    return failedWith("read_stream_log_records needs `stream`, a stream's name, and `after`, a sequence number from 0");
  }
  return succeeded({ stream: commandArguments["stream"], after: commandArguments["after"] });
}

/** The `{ stream }` arguments of the command `commandName` as the window sends them, or why they are not. */
export function streamArgumentsFrom(commandName: TatolabCommandName, commandArguments: unknown): Result<{ stream: string }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["stream"] !== "string") {
    return failedWith(`${commandName} needs \`stream\`, a stream's name`);
  }
  return succeeded({ stream: commandArguments["stream"] });
}

/** Each command's handler, taking the arguments as the window sent them and answering in the contract's shape. */
export type TatolabWindowCommandHandlers = {
  readonly [CommandName in TatolabCommandName]: (commandArguments: unknown) => Promise<TatolabCommandAnswerTo<CommandName>>;
};

function commandAnswerFrom<Answer>(outcome: Result<Answer, string>): { ok: true; value: Answer } | { ok: false; refusal: string } {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, refusal: outcome.failure };
}

function commandAnswerOfNothingFrom(outcome: Result<unknown, string>): { ok: true; value: null } | { ok: false; refusal: string } {
  return outcome.ok ? { ok: true, value: null } : { ok: false, refusal: outcome.failure };
}

/** The handler of every command the window invokes, over `sharedState`; `quit_tatolab_app` quits through `quitTheApp`. */
export function tatolabWindowCommandHandlers(sharedState: TatolabAppSharedState, quitTheApp: () => void): TatolabWindowCommandHandlers {
  return {
    get_tatolab_status: async () => commandAnswerFrom(await getTatolabStatus(sharedState)),
    set_run_tatolab: async (commandArguments) => {
      const setRunTatolabArguments = setRunTatolabArgumentsFrom(commandArguments);
      if (!setRunTatolabArguments.ok) return { ok: false, refusal: setRunTatolabArguments.failure };
      setRunTatolab(sharedState, setRunTatolabArguments.value.enabled);
      return { ok: true, value: null };
    },
    open_login_items_settings: async () => commandAnswerOfNothingFrom(await openLoginItemsSettings(sharedState)),
    set_up_tatolab: async () => commandAnswerOfNothingFrom(setUpTatolab(sharedState)),
    uninstall_tatolab: async () => commandAnswerOfNothingFrom(await uninstallTatolab(sharedState)),
    quit_tatolab_app: async () => {
      quitTheApp();
      return { ok: true, value: null };
    },
    read_stream_log_records: async (commandArguments) => {
      const readStreamLogRecordsArguments = readStreamLogRecordsArgumentsFrom(commandArguments);
      if (!readStreamLogRecordsArguments.ok) return { ok: false, refusal: readStreamLogRecordsArguments.failure };
      const { stream, after } = readStreamLogRecordsArguments.value;
      return commandAnswerFrom(await readStreamLogRecords(sharedState, stream, after));
    },
    check_for_tatolab_app_updates: async () => {
      checkForTatolabAppUpdatesOnRequest(sharedState, "window");
      return { ok: true, value: null };
    },
    describe_stream_graph: async (commandArguments) => {
      const describeStreamGraphArguments = streamArgumentsFrom("describe_stream_graph", commandArguments);
      if (!describeStreamGraphArguments.ok) return { ok: false, refusal: describeStreamGraphArguments.failure };
      return commandAnswerFrom(await describeStreamGraph(sharedState, describeStreamGraphArguments.value.stream));
    },
    stop_stream: async (commandArguments) => {
      const notice = await streamActionOnTheStreamNamedIn(sharedState, "stop_stream", commandArguments);
      return commandAnswerFrom(notice.ok ? succeeded({ not_recorded_because: notice.value }) : notice);
    },
    start_stream: async (commandArguments) => commandAnswerOfNothingFrom(await streamActionOnTheStreamNamedIn(sharedState, "start_stream", commandArguments)),
    remove_stream: async (commandArguments) => commandAnswerOfNothingFrom(await streamActionOnTheStreamNamedIn(sharedState, "remove_stream", commandArguments)),
  };
}

async function streamActionOnTheStreamNamedIn(
  sharedState: TatolabAppSharedState,
  streamAction: TatolabStreamActionName,
  commandArguments: unknown,
): Promise<Result<string | null, string>> {
  const streamArguments = streamArgumentsFrom(streamAction, commandArguments);
  return streamArguments.ok ? runStreamAction(sharedState, streamAction, streamArguments.value.stream) : streamArguments;
}
