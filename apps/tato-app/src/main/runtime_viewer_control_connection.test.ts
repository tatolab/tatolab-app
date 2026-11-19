import { expect, test } from "vitest";
import type { Result } from "./result.js";
import { closedViewerFromTheCloseViewerToolResult, openedRuntimeViewerFromTheOpenViewerToolResult } from "./runtime_viewer_control_connection.js";
import { LINUX_VIEWER, OPEN_VIEWER_RESULT_ON_LINUX } from "./runtime_viewer_test_support.js";

function answerOf<T, F>(result: Result<T, F>): T {
  if (!result.ok) return expect.unreachable(JSON.stringify(result.failure));
  return result.value;
}

function failureOf<T, F>(result: Result<T, F>): F {
  if (result.ok) return expect.unreachable(`expected a failure, answered ${JSON.stringify(result.value)}`);
  return result.failure;
}

test("an_open_viewer_result_on_macos_without_a_viewer_process_names_no_surface_share_address", () => {
  const { surface_share_address: _surfaceShareAddress, ...withoutSurfaceShareAddress } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(answerOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutSurfaceShareAddress))).toEqual({ ...LINUX_VIEWER, surface_share_address: null });
});

test("an_open_viewer_result_missing_its_channel_cannot_be_read", () => {
  const { channel: _channel, ...withoutChannel } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutChannel))).toMatch(/^the runtime's open_viewer result could not be read: .*channel/);
  expect(failureOf(closedViewerFromTheCloseViewerToolResult({}))).toMatch(/^the runtime's close_viewer result could not be read: /);
});

test("an_open_viewer_result_missing_its_wake_service_cannot_be_read", () => {
  const { wake_service: _wakeService, ...withoutWakeService } = OPEN_VIEWER_RESULT_ON_LINUX;

  expect(failureOf(openedRuntimeViewerFromTheOpenViewerToolResult(withoutWakeService))).toMatch(/^the runtime's open_viewer result could not be read: .*wake_service/);
});
