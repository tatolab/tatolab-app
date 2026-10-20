// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TatolabBackend } from "./tatolab_backend";
import type { StreamGraphSummary, StreamLogRecordsPage, TatolabStatus } from "./tatolab_backend_contract";

const TATOLAB_STATUS_CHANGED_EVENT = "tatolab-status-changed";

/** The backend inside Tatolab.app: its commands over Tauri's IPC, and its status event. */
export function createTauriTatolabBackend(): TatolabBackend {
  return {
    getTatolabStatus: () => invoke<TatolabStatus>("get_tatolab_status"),
    setRunTatolab: async (enabled) => {
      await invoke<null>("set_run_tatolab", { enabled });
    },
    openLoginItemsSettings: async () => {
      await invoke<null>("open_login_items_settings");
    },
    setUpTatolab: async () => {
      await invoke<null>("set_up_tatolab");
    },
    quitTatolabApp: async () => {
      await invoke<null>("quit_tatolab_app");
    },
    uninstallTatolab: async () => {
      await invoke<null>("uninstall_tatolab");
    },
    readStreamLogRecords: (streamName, afterSequence) =>
      invoke<StreamLogRecordsPage>("read_stream_log_records", { stream: streamName, after: afterSequence }),
    describeStreamGraph: (streamName) => invoke<StreamGraphSummary>("describe_stream_graph", { stream: streamName }),
    onTatolabStatusChanged: (listener) =>
      listen<TatolabStatus>(TATOLAB_STATUS_CHANGED_EVENT, (statusChangedEvent) => listener(statusChangedEvent.payload)),
  };
}
