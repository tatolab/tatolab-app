import "./styles/window.css";

import { tatolabWindowHost, type TatolabBackend, type TatolabWindowHost } from "./backend/tatolab_backend";
import type { TatolabStatus } from "../shared/tatolab_backend_contract";
import { createElectronTatolabBackend } from "./backend/electron_tatolab_backend";
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

/** What a built window says when opened in a browser: the mock is served only by the dev server. */
const BUILT_WINDOW_IN_A_BROWSER_TEXT = "Tatolab's window runs inside Tatolab.app. The mock window is served by node scripts/serve_the_mock_window_in_a_browser.mjs.";

/** The backend of the host this page runs in: the preload's bridge, or the browser mock under the dev server; `null` where the page has none. */
async function createTatolabBackendFor(windowHost: TatolabWindowHost, pageQuery: URLSearchParams): Promise<TatolabBackend | null> {
  switch (windowHost.kind) {
    case "electron":
      return createElectronTatolabBackend(windowHost.tatolabElectronBridge);
    case "electron_without_its_bridge":
      return null;
    case "browser":
      // A build leaves the mock out: `import.meta.env.DEV` is false there, so the bundler drops its import.
      return import.meta.env.DEV ? createBrowserMockBackend(pageQuery) : null;
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
    rootElement.textContent = windowHost.kind === "browser" ? BUILT_WINDOW_IN_A_BROWSER_TEXT : WINDOW_WITHOUT_ITS_BRIDGE_TEXT;
    return;
  }
  const insideTheApp = windowHost.kind !== "browser";
  const featureFlags = readTatolabFrontendFeatureFlags(insideTheApp, pageQuery);
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await readFirstTatolabStatus(backend);
  showTatolabStatus = mountTatolabWindow(rootElement, backend, platformOf(firstStatus), featureFlags);
  showTatolabStatus(firstStatus);
  if (!insideTheApp && import.meta.env.DEV) {
    const { driveMockWindowToPreset } = await import("./mock_window_preset");
    driveMockWindowToPreset(pageQuery, platformOf(firstStatus));
  }
}

void startTatolabWindow();
