import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/window_shell.css";
import "./styles/streams_page.css";
import "./styles/stream_list.css";
import "./styles/stream_detail.css";
import "./styles/stream_graph.css";
import "./styles/stream_log_console.css";
import "./styles/first_stream_guide.css";
import "./styles/settings_page.css";
import "./styles/first_launch_setup.css";

import type { TatolabBackend } from "./backend/tatolab_backend";
import type { TatolabStatus } from "./backend/tatolab_backend_contract";
import { createTauriTatolabBackend } from "./backend/tauri_tatolab_backend";
import { mountTatolabWindow } from "./views/tatolab_window_view";

const FIRST_STATUS_RETRY_MILLISECONDS = 1000;

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

async function startTatolabWindow(): Promise<void> {
  const rootElement = document.getElementById("app");
  if (!rootElement) return;
  const backend = createTauriTatolabBackend();
  const showTatolabStatus = mountTatolabWindow(rootElement, backend);
  await backend.onTatolabStatusChanged(showTatolabStatus);
  showTatolabStatus(await readFirstTatolabStatus(backend));
}

void startTatolabWindow();
