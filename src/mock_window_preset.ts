import type { TatolabPlatform } from "./backend/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;

/** Resolves with the first element `selector` matches once it is in the page, or `null` after a few seconds. */
function waitForElement<ElementType extends Element>(selector: string): Promise<ElementType | null> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const look = () => {
      const element = document.querySelector<ElementType>(selector);
      if (element) resolve(element);
      else if (performance.now() - startedAt > PRESET_STEP_TIMEOUT_MILLISECONDS) resolve(null);
      else window.setTimeout(look, PRESET_POLL_MILLISECONDS);
    };
    look();
  });
}

async function clickWhenShown(selector: string): Promise<boolean> {
  const element = await waitForElement<HTMLElement>(selector);
  element?.click();
  return element !== null;
}

/**
 * Browser-mock only: drives the window the way a person would, to the screen `?stream=`, `?tab=`, `?page=settings`,
 * `?sheet=uninstall|uninstalling|uninstalled`, `?setup=waiting`, `?watch=<node>.<port>`, `?levels=errors` and
 * `?search=<query>` name, so each screen can be shown and pictured from its URL.
 */
export async function driveMockWindowToPreset(pageQuery: URLSearchParams, platform: TatolabPlatform): Promise<void> {
  const streamName = pageQuery.get("stream");
  if (streamName !== null) await clickWhenShown(`.stream-list-row[data-stream-name="${CSS.escape(streamName)}"]`);
  const tab = pageQuery.get("tab");
  if (tab !== null) await clickWhenShown(`.streams-page .content-band [data-segment="${CSS.escape(tab)}"]`);
  const watchedPort = pageQuery.get("watch");
  if (watchedPort !== null) {
    const [nodeName, portName] = watchedPort.split(".");
    const portButtons = await waitForElement(`.graph-node[data-node="${CSS.escape(nodeName)}"] [data-watch="port"]`);
    if (portButtons) {
      const portButton = [...document.querySelectorAll<HTMLElement>(`.graph-node[data-node="${CSS.escape(nodeName)}"] [data-watch="port"]`)].find(
        (button) => button.querySelector(".graph-node-port-name")?.textContent === portName,
      );
      portButton?.click();
    }
  }
  if (pageQuery.get("levels") === "errors") await clickWhenShown(`.log-dock-console [data-segment="Errors"]`);
  if (pageQuery.get("page") === "settings") await clickWhenShown(".sidebar-settings-row");
  const sheet = pageQuery.get("sheet");
  if (sheet === "uninstall" || sheet === "uninstalling" || sheet === "uninstalled") {
    if (pageQuery.get("page") !== "settings") await clickWhenShown(".sidebar-settings-row");
    await clickWhenShown(`[data-action="uninstall"]`);
  }
  if (sheet === "uninstalling" || sheet === "uninstalled") await clickWhenShown(".uninstall-sheet[open] .button-destructive");
  if (pageQuery.get("setup") === "waiting") await clickWhenShown(".setup-screen .button-primary");
  const searchQuery = pageQuery.get("search");
  if (searchQuery !== null) {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: platform === "macos", ctrlKey: platform === "linux", bubbles: true }),
    );
    const searchInput = await waitForElement<HTMLInputElement>(".search-overlay[open] .search-input");
    if (searchInput && searchQuery !== "open") {
      searchInput.value = searchQuery;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}
