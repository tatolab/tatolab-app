// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphSummary, StreamLogRecordsPage, TatolabStatus } from "./tatolab_backend_contract";

/** The app backend's commands and status event, real inside Tauri or mocked in a browser. */
export interface TatolabBackend {
  getTatolabStatus(): Promise<TatolabStatus>;
  setRunTatolab(enabled: boolean): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
  setUpTatolab(): Promise<void>;
  quitTatolabApp(): Promise<void>;
  /** On macOS uninstalls Tatolab and quits at the end, rejecting with the reason when it can't; on Linux rejects with how to. */
  uninstallTatolab(): Promise<void>;
  readStreamLogRecords(streamName: string, afterSequence: number): Promise<StreamLogRecordsPage>;
  describeStreamGraph(streamName: string): Promise<StreamGraphSummary>;
  onTatolabStatusChanged(listener: (status: TatolabStatus) => void): Promise<() => void>;
}

/** Whether the page runs in Tatolab.app's webview rather than a browser. */
export function isRunningInsideTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** The text of a rejected command: Tauri rejects with the backend's error string. */
export function describeBackendRejection(rejection: unknown): string {
  if (typeof rejection === "string") return rejection;
  if (rejection instanceof Error) return rejection.message;
  return JSON.stringify(rejection);
}
