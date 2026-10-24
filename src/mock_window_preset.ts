// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabPlatform } from "./backend/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;
const GRAPH_FIT_SETTLE_MILLISECONDS = 600;

/** How long the done preset waits for the mock runtime's answer to a run. */
const MOCK_RUN_STREAM_ANSWER_TIMEOUT_MILLISECONDS = 8000;

/** Resolves with the first element `selector` matches once it is in the page, or `null` after `timeoutMilliseconds`. */
function waitForElement<ElementType extends Element>(selector: string, timeoutMilliseconds = PRESET_STEP_TIMEOUT_MILLISECONDS): Promise<ElementType | null> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const look = () => {
      const element = document.querySelector<ElementType>(selector);
      if (element) resolve(element);
      else if (performance.now() - startedAt > timeoutMilliseconds) resolve(null);
      else window.setTimeout(look, PRESET_POLL_MILLISECONDS);
    };
    look();
  });
}

/** The output port row `<step>.<port>` names on a Graph tab's card. */
function graphOutputPortSelector(stepDotPort: string): string {
  const [stepName = "", portName = ""] = stepDotPort.split(".");
  return `[data-stream-graph-step="${CSS.escape(stepName)}"] [data-step-output-port="${CSS.escape(portName)}"]`;
}

/** The Add stream page driven to the step `addStep` names, as a person would get there. */
async function driveAddStreamToPreset(addStep: string | null): Promise<void> {
  if (addStep === "new" || addStep === "created") {
    await clickWhenShown(`[data-add-stream-source="new_project"]`);
    if (addStep === "created") await clickWhenShown(`[data-add-stream-action="create"]:not([disabled])`);
    return;
  }
  if (addStep !== "folder" && addStep !== "compiling" && addStep !== "done") return;
  await clickWhenShown(`[data-add-stream-action="choose_folder"]`);
  if (addStep === "folder") return;
  await waitForElement(`[data-add-stream-checks]`);
  await clickWhenShown(`[data-add-stream-action="compile_and_run"]:not([disabled])`);
  if (addStep === "done") await waitForElement(`[data-add-stream-step="running"], [data-add-stream-name-taken]`, MOCK_RUN_STREAM_ANSWER_TIMEOUT_MILLISECONDS);
}

async function clickWhenShown(selector: string): Promise<boolean> {
  const element = await waitForElement<HTMLElement>(selector);
  element?.click();
  return element !== null;
}

/**
 * Browser-mock only: drives the window the way a person would, to the screen `?stream=`, `?tab=overview|graph|logs|inspect`,
 * `?stream_page_action=<action>` (a header button of the stream's page, once its steps show: `stop_stream` there gives
 * the steps as of the last load), `?inspect=tree`,
 * `?page=settings|add-stream`, on Add stream `?add=folder|compiling|done` (a folder chosen, compiling, the stream running) or
 * `?add=new|created` (a new project proposed, then written by `tatolab new`), with the backend's `?add_folder=`, `?add_run=warning` and
 * `?add_cli=missing`, `?remove=<stream>`, `?stream_action=stop_stream|start_stream:<stream>` (with
 * `?stop_not_recorded=<stream>`, the backend's option, for a stop the runtime could not record),
 * `?sheet=uninstall|uninstalling|uninstalled`, `?setup=waiting`, on Graph `?step=<step>` (selected), `?focus=<step>` (its card
 * holding keyboard focus), `?pin=<step>.<port>`
 * (its preview pinned), `?hover=<step>.<port>` (its hover preview open), `?previews=off` and `?counters=off`,
 * on Logs `?levels=info|warnings|errors`, `?held_records=<n>` and `?log_folder=missing` (the backend's options for the pointer row and a refused open), `?record=<sequence>` or `?record=problem` (the newest warning or error selected) and
 * `?details=closed`, `?only_step=<step>` (that step alone chosen in the step menu) and `?step_menu=open`, and `?search=<query>` name, so each screen can be shown and pictured from its URL. `?theme=light|dark` is read by the page's first script, before first paint.
 */
export async function driveMockWindowToPreset(pageQuery: URLSearchParams, platform: TatolabPlatform): Promise<void> {
  const streamName = pageQuery.get("stream");
  const rowStreamAction = pageQuery.get("stream_action");
  if (rowStreamAction !== null) {
    const [streamAction, actedOnStreamName] = rowStreamAction.split(":");
    await clickWhenShown(`[data-stream-row="${CSS.escape(actedOnStreamName ?? "")}"] [data-stream-action="${CSS.escape(streamAction)}"]`);
  }
  const streamToRemove = pageQuery.get("remove");
  if (streamToRemove !== null) {
    await clickWhenShown(`[data-stream-row="${CSS.escape(streamToRemove)}"] [data-stream-action="more"]`);
    await clickWhenShown(`[data-slot="dropdown-menu-item"][data-stream-action="remove_stream"]`);
  }
  if (streamName !== null) await clickWhenShown(`[data-stream-row="${CSS.escape(streamName)}"]`);
  const tab = pageQuery.get("tab");
  if (tab !== null) await clickWhenShown(`[data-stream-page-header] [data-stream-tab="${CSS.escape(tab)}"]`);
  const streamPageAction = pageQuery.get("stream_page_action");
  if (streamPageAction !== null) {
    await waitForElement("[data-stream-step]");
    await clickWhenShown(`[data-stream-page-header] [data-stream-action="${CSS.escape(streamPageAction)}"]`);
  }
  if (pageQuery.get("inspect") === "tree") await clickWhenShown(`[data-graph-document-view-choice="tree"]`);
  if (pageQuery.get("previews") === "off") await clickWhenShown(`[data-stream-graph-toolbar="previews"]`);
  if (pageQuery.get("counters") === "off") await clickWhenShown(`[data-stream-graph-toolbar="counters"]`);
  const selectedStep = pageQuery.get("step");
  if (selectedStep !== null) await clickWhenShown(`[data-stream-graph-step="${CSS.escape(selectedStep)}"]`);
  const focusedStep = pageQuery.get("focus");
  if (focusedStep !== null) (await waitForElement<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(focusedStep)}"]`))?.focus();
  const pinnedOutput = pageQuery.get("pin");
  if (pinnedOutput !== null) await clickWhenShown(graphOutputPortSelector(pinnedOutput));
  const hoveredOutput = pageQuery.get("hover");
  if (hoveredOutput !== null) {
    const outputPort = await waitForElement<HTMLElement>(graphOutputPortSelector(hoveredOutput));
    // The canvas fits itself to view as it opens; the hover preview opens beside the port once it has stopped.
    await new Promise((settled) => window.setTimeout(settled, GRAPH_FIT_SETTLE_MILLISECONDS));
    // React's onMouseEnter listens for the mouseover a pointer arriving on the port fires.
    outputPort?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }
  const shownLevels = pageQuery.get("levels");
  const levelFilterOfShownLevels: Record<string, string> = { info: "info", warnings: "warn", errors: "error" };
  if (shownLevels !== null && levelFilterOfShownLevels[shownLevels] !== undefined) {
    await clickWhenShown(`[data-stream-log-level-filter="${levelFilterOfShownLevels[shownLevels]}"]`);
  }
  const selectedRecord = pageQuery.get("record");
  if (selectedRecord !== null) {
    await waitForElement("[data-stream-log-record]");
    const logRows = [...document.querySelectorAll<HTMLElement>("[data-stream-log-record]")];
    const rowToSelect = /^\d+$/.test(selectedRecord)
      ? logRows.find((logRow) => logRow.dataset.streamLogRecord === selectedRecord)
      : [...logRows].reverse().find((logRow) => logRow.dataset.streamLogLevelTone === "error" || logRow.dataset.streamLogLevelTone === "warn");
    // React's onMouseDown listens for the mousedown a click on the row fires.
    rowToSelect?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  }
  if (pageQuery.get("details") === "closed") await clickWhenShown(`[data-stream-log-toolbar="details"]`);
  const onlyStep = pageQuery.get("only_step");
  if (onlyStep !== null) {
    await clickWhenShown("[data-stream-log-step-filter]");
    await clickWhenShown(`[data-stream-log-step-choice="${CSS.escape(onlyStep)}"]`);
  }
  if (pageQuery.get("step_menu") === "open" && document.querySelector('[data-slot="dropdown-menu-content"]') === null) await clickWhenShown("[data-stream-log-step-filter]");
  const page = pageQuery.get("page");
  if (page === "settings" || page === "add-stream") await clickWhenShown(`[data-window-navigation="${page}"]`);
  if (page === "add-stream") await driveAddStreamToPreset(pageQuery.get("add"));
  const sheet = pageQuery.get("sheet");
  if (sheet === "uninstall" || sheet === "uninstalling" || sheet === "uninstalled") {
    if (page !== "settings") await clickWhenShown(`[data-window-navigation="settings"]`);
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
