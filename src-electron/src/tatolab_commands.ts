// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The commands the window's frontend invokes, under the names it invokes them by. A request that
// changes the machine starts in the background, as the tray's choices do, and its outcome reaches
// the window as the next `tatolab-status-changed`. A question the window awaits is answered with
// its answer or a refusal in words, never a thrown error.

import type { StreamGraphSummary, StreamLogRecordsPage, TatolabStatus } from "../../src/backend/tatolab_backend_contract.js";
import { isAJsonObject, isAnUnsignedInteger } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { runInTheBackgroundWithTheController, setUpTatolabOnRequest, type TatolabAppSharedState } from "./tatolab_app_shared_state.js";

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

/** `describe_stream_graph`'s arguments as the window sends them, or why they are not. */
export function describeStreamGraphArgumentsFrom(commandArguments: unknown): Result<{ stream: string }, string> {
  if (!isAJsonObject(commandArguments) || typeof commandArguments["stream"] !== "string") {
    return failedWith("describe_stream_graph needs `stream`, a stream's name");
  }
  return succeeded({ stream: commandArguments["stream"] });
}
