// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { StreamGraphSummary, StreamLogRecordsPage, TatolabStatus } from "./tatolab_backend_contract";

/** The app backend's commands and status event, real inside Tatolab.app or mocked in a browser. */
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

/** Where the page runs: Tatolab.app's Tauri webview, its Electron window, or a browser showing the mock. */
export type TatolabWindowHost = "tauri" | "electron" | "browser";

/** The host this page runs in, told by what each one puts on `window`. */
export function tatolabWindowHost(): TatolabWindowHost {
  if ("__TAURI_INTERNALS__" in window) return "tauri";
  if (window.tatolabElectronBridge !== undefined) return "electron";
  return "browser";
}

/** The text of a rejected command: Tauri and the Electron backend reject with the backend's refusal string. */
export function describeBackendRejection(rejection: unknown): string {
  if (typeof rejection === "string") return rejection;
  if (rejection instanceof Error) return rejection.message;
  return JSON.stringify(rejection);
}
