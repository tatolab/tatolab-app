// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/window_shell.css";
import "./styles/stream_list.css";
import "./styles/streams_page.css";
import "./styles/stream_overview.css";
import "./styles/stream_graph.css";
import "./styles/stream_log_console.css";
import "./styles/watch_placeholder.css";
import "./styles/first_stream_guide.css";
import "./styles/settings_page.css";
import "./styles/first_launch_setup.css";
import "./styles/runtime_state_page.css";
import "./styles/uninstall_sheet.css";
import "./styles/search.css";

import { tatolabWindowHost, type TatolabBackend, type TatolabWindowHost } from "./backend/tatolab_backend";
import type { TatolabStatus } from "./backend/tatolab_backend_contract";
import { createElectronTatolabBackend } from "./backend/electron_tatolab_backend";
import { createTauriTatolabBackend } from "./backend/tauri_tatolab_backend";
import { readTatolabFrontendFeatureFlags } from "./feature_flags";
import { platformOf } from "./presentation/platform_presentation";
import { mountTatolabWindow } from "./views/tatolab_window_view";

const FIRST_STATUS_RETRY_MILLISECONDS = 1000;

async function createBrowserMockBackend(pageQuery: URLSearchParams): Promise<TatolabBackend> {
  const { createMockTatolabBackend, readMockTatolabOptions } = await import("./backend/mock_tatolab_backend");
  return createMockTatolabBackend(readMockTatolabOptions(pageQuery));
}

/** What the Electron app's window says when its preload did not load: it has no way to the app, and never shows the mock in its place. */
const WINDOW_WITHOUT_ITS_BRIDGE_TEXT = "Tatolab's window could not reach the app: its preload did not load. Reinstall Tatolab.";

/** The backend of the host this page runs in: Tauri's IPC, the Electron preload's bridge, or the browser mock; `null` for the app's window without its bridge. */
async function createTatolabBackendFor(windowHost: TatolabWindowHost, pageQuery: URLSearchParams): Promise<TatolabBackend | null> {
  switch (windowHost.kind) {
    case "tauri":
      return createTauriTatolabBackend();
    case "electron":
      return createElectronTatolabBackend(windowHost.tatolabElectronBridge);
    case "electron_without_its_bridge":
      return null;
    case "browser":
      return createBrowserMockBackend(pageQuery);
  }
}

/** The status, asked again each second until the backend answers: the window has nothing to show without one. */
async function readFirstTatolabStatus(backend: TatolabBackend): Promise<TatolabStatus> {
  for (;;) {
    try {
      return await backend.getTatolabStatus();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, FIRST_STATUS_RETRY_MILLISECONDS));
    }
  }
}

/** The window mounts once the first status names its platform; listening before that read misses no change after it. */
async function startTatolabWindow(): Promise<void> {
  const rootElement = document.getElementById("app");
  if (!rootElement) return;
  const pageQuery = new URLSearchParams(window.location.search);
  const windowHost = tatolabWindowHost();
  const backend = await createTatolabBackendFor(windowHost, pageQuery);
  if (backend === null) {
    rootElement.textContent = WINDOW_WITHOUT_ITS_BRIDGE_TEXT;
    return;
  }
  const insideTheApp = windowHost.kind !== "browser";
  const featureFlags = readTatolabFrontendFeatureFlags(insideTheApp, pageQuery);
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await readFirstTatolabStatus(backend);
  showTatolabStatus = mountTatolabWindow(rootElement, backend, platformOf(firstStatus), featureFlags);
  showTatolabStatus(firstStatus);
  if (!insideTheApp) {
    const { driveMockWindowToPreset } = await import("./mock_window_preset");
    driveMockWindowToPreset(pageQuery, platformOf(firstStatus));
  }
}

void startTatolabWindow();
