import type { TatolabPlatform } from "../shared/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;
const GRAPH_FIT_SETTLE_MILLISECONDS = 600;

/** How long the first-run preset waits for the mock runtime to come up before it presses Get Started. */
const MOCK_RUNTIME_STARTUP_WAIT_MILLISECONDS = 6000;

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

/** The add-stream dialog opened from the sidebar's + menu on New project or Import project. */
async function openTheAddStreamDialogOn(menuChoice: "new-project" | "add-stream"): Promise<void> {
  await clickWhenShown(`[data-window-navigation="add-project-menu"]`);
  await clickWhenShown(`[data-window-navigation="${menuChoice}"]`);
}

/** The add-stream dialog driven to the step `addStep` names, as a person would get there. */
async function driveAddStreamToPreset(addStep: string | null): Promise<void> {
  if (addStep === "new" || addStep === "created") {
    await openTheAddStreamDialogOn("new-project");
    if (addStep === "created") await clickWhenShown(`[data-add-stream-action="create"]:not([disabled])`);
    return;
  }
  await openTheAddStreamDialogOn("add-stream");
  if (addStep !== "folder" && addStep !== "compiling" && addStep !== "done" && addStep !== "away") return;
  await clickWhenShown(`[data-add-stream-action="choose_folder"]`);
  if (addStep === "folder") return;
  await waitForElement(`[data-add-stream-checks]`);
  await clickWhenShown(`[data-add-stream-action="add"]:not([disabled])`);
  if (addStep === "away") {
    await waitForElement(`[data-add-stream-step="compiling"]`);
    await clickWhenShown(`[data-form-dialog-close]`);
    await waitForElement(`[data-add-stream-run-notice]`, MOCK_RUN_STREAM_ANSWER_TIMEOUT_MILLISECONDS);
    return;
  }
  if (addStep === "done") await waitForElement(`[data-add-stream-step="running"], [data-add-stream-name-taken]`, MOCK_RUN_STREAM_ANSWER_TIMEOUT_MILLISECONDS);
}

/** Types `text` into the controlled field `field` as a person would, so React's onChange sees it. */
function typeIntoAField(field: HTMLInputElement, text: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Settings › Relays driven to `?relay=add:<kind>|configure:<relay_id>|remove:<relay_id>`, then each `?relay_fill=<setting>:<text>` typed and `?relay_submit=pressed`. */
async function driveRelaysToPreset(pageQuery: URLSearchParams): Promise<void> {
  const [relayDialog = "", relayDialogSubject = ""] = (pageQuery.get("relay") ?? "").split(":");
  if (relayDialog === "add") {
    await clickWhenShown(`[data-relay-action="add-menu"]`);
    await clickWhenShown(`[data-relay-adapter-choice="${CSS.escape(relayDialogSubject)}"]`);
  } else if (relayDialog === "configure") {
    await clickWhenShown(`[data-relay-row="${CSS.escape(relayDialogSubject)}"] [data-relay-action="configure"]`);
  } else if (relayDialog === "remove") {
    await clickWhenShown(`[data-relay-row="${CSS.escape(relayDialogSubject)}"] [data-relay-action="more"]`);
    await clickWhenShown(`[data-relay-action="remove"]`);
    return;
  } else {
    return;
  }
  await waitForElement("[data-relay-dialog]");
  for (const fill of pageQuery.getAll("relay_fill")) {
    const separator = fill.indexOf(":");
    const settingName = fill.slice(0, separator);
    if (separator <= 0) continue;
    if (document.querySelector(`[data-relay-setting-field="${CSS.escape(settingName)}"]`) === null) {
      await clickWhenShown(`[data-relay-setting="${CSS.escape(settingName)}"] [data-relay-action="replace-secret"]`);
    }
    const field = await waitForElement<HTMLInputElement>(`[data-relay-setting-field="${CSS.escape(settingName)}"]`);
    if (field !== null) typeIntoAField(field, fill.slice(separator + 1));
  }
  if (pageQuery.get("relay_submit") === "pressed") await clickWhenShown(`[data-relay-action="add"]:not([disabled]), [data-relay-action="save"]:not([disabled])`);
}

async function clickWhenShown(selector: string, timeoutMilliseconds = PRESET_STEP_TIMEOUT_MILLISECONDS): Promise<boolean> {
  const element = await waitForElement<HTMLElement>(selector, timeoutMilliseconds);
  element?.click();
  return element !== null;
}

/**
 * Browser-mock only: drives the window the way a person would, to the screen `?stream=`, `?tab=overview|graph|logs|inspect`,
 * `?stream_page_action=<action>` (a header or menu action of the stream's page, once its graph shows: `stop_stream` there gives
 * the steps as of the last load), `?inspect=tree`,
 * `?page=settings|add-stream` (the add-stream dialog, on Import project), on Settings `?section=general|appearance|runtime|relays|command-line|about`, on its Relays
 * `?relay=add:<adapter>|configure:<relay_id>|remove:<relay_id>` (that dialog open) with each `?relay_fill=<setting>:<text>` typed into it and `?relay_submit=pressed`
 * (Add relay or Save pressed), with the backend's `?relays=local` and `?secret_file=cancel` (Choose file… cancelled), and on its Runtime
 * `?restart=pressed` (Restart runtime pressed: Starting, then Running up 0m) or `?restart=refused` (the service manager refusing it),
 * `?choose_python=pressed` (Choose Your Own… pressed, with the backend's `?python=chosen|not_offered` and `?python_pick=cancel|not_python`), with the
 * backend's `?runtime_log=none`, `?open_at_login=on|approval|not_offered`, `?notifications=unsupported` and `?cli_version=reading|unreadable`, on About the backend's `?app_build=release|modified|none`, the backend's `?stream_page_requested=<stream>` (a
 * click on that stream's failure notification), on the add-stream dialog `?add=folder|compiling|done|away` (a folder chosen, compiling, the stream running, or
 * the dialog closed while it compiled and the run's notice shown once it answers) or
 * `?add=new|created` (opened on New project, a new project proposed, then Create pressed, which writes it with `tatolab new` and adds it), with the backend's `?add_folder=` (`no-venv` for a run that
 * makes the `.venv` first), `?add_venv=refused` (uv refusing to make it), `?add_run=warning` and `?add_cli=missing`, on Settings › Command line the backend's `?usr_local_bin=linked|cancel`, `?remove=<stream>`, `?stream_action=stop_stream|start_stream:<stream>` (with
 * `?stop_not_recorded=<stream>`, the backend's option, for a stop the runtime could not record),
 * `?sheet=uninstall|uninstalling|uninstalled`, on first run `?setup=getting_set_up` (Continue pressed on Welcome) or `?setup=get_started` (then
 * Get Started once the runtime answers) and `?setup_step_action=<action>` (a step's action pressed), with the backend's `?state=setup`, or
 * `?first_run=unfinished` over any runtime state, as `?state=approval|blocked|never-answered`, and its `?first_run_remember=refused`,
 * on Settings › Command line `?link=pressed` (Link in /usr/local/bin… pressed), on Graph `?step=<step>` (selected), `?focus=<step>` (its card
 * holding keyboard focus), `?pin=<step>.<port>`
 * (its preview pinned), `?hover=<step>.<port>` (its hover preview open), `?previews=off` and `?counters=off`,
 * on Logs `?levels=info|warnings|errors`, `?held_records=<n>` and `?log_folder=missing` (the backend's options for the pointer row and a refused open), `?record=<sequence>` or `?record=problem` (the newest warning or error selected),
 * `?only_step=<step>` (that step alone chosen in the step menu) and `?step_menu=open`, and `?search=<query>` name, so each screen can be shown and pictured from its URL. `?theme=light|dark` is read by the page's first script, before first paint.
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
    await waitForElement("[data-stream-output-preview], [data-stream-graph-step]");
    const headerActionSelector = `[data-stream-page-header] [data-stream-action="${CSS.escape(streamPageAction)}"]`;
    if (document.querySelector(headerActionSelector) === null) await clickWhenShown(`[data-stream-page-header] [data-stream-action="more"]`);
    await clickWhenShown(`${headerActionSelector}, [data-stream-action="${CSS.escape(streamPageAction)}"][role="menuitem"]`);
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
  const onlyStep = pageQuery.get("only_step");
  if (onlyStep !== null) {
    await clickWhenShown("[data-stream-log-step-filter]");
    await clickWhenShown(`[data-stream-log-step-choice="${CSS.escape(onlyStep)}"]`);
  }
  if (pageQuery.get("step_menu") === "open" && document.querySelector('[data-slot="dropdown-menu-content"]') === null) await clickWhenShown("[data-stream-log-step-filter]");
  const page = pageQuery.get("page");
  if (page === "settings") await clickWhenShown(`[data-window-navigation="settings"]`);
  if (page === "add-stream") await driveAddStreamToPreset(pageQuery.get("add"));
  const settingsSection = pageQuery.get("section");
  if (page === "settings" && settingsSection !== null) await clickWhenShown(`[data-settings-section="${CSS.escape(settingsSection)}"]`);
  if (page === "settings" && settingsSection === "relays") await driveRelaysToPreset(pageQuery);
  if (pageQuery.get("restart") === "pressed" || pageQuery.get("restart") === "refused") await clickWhenShown(`[data-runtime-action="restart"]:not([disabled])`);
  if (pageQuery.get("choose_python") === "pressed") await clickWhenShown(`[data-settings-action="choose-your-own-python"]:not([disabled])`);
  const sheet = pageQuery.get("sheet");
  if (sheet === "uninstall" || sheet === "uninstalling" || sheet === "uninstalled") {
    if (page !== "settings") await clickWhenShown(`[data-window-navigation="settings"]`);
    await clickWhenShown(`[data-action="uninstall"]`);
  }
  if (sheet === "uninstalling" || sheet === "uninstalled") await clickWhenShown(".uninstall-sheet[open] .button-destructive");
  const firstRunStep = pageQuery.get("setup");
  if (firstRunStep === "getting_set_up" || firstRunStep === "get_started") await clickWhenShown(`[data-getting-started-action="continue"]`);
  if (firstRunStep === "get_started") await clickWhenShown(`[data-getting-started-action="get_started"]:not([disabled])`, MOCK_RUNTIME_STARTUP_WAIT_MILLISECONDS);
  const setupStepAction = pageQuery.get("setup_step_action");
  if (setupStepAction !== null) await clickWhenShown(`[data-getting-started-step-action="${CSS.escape(setupStepAction)}"]`);
  if (pageQuery.get("link") === "pressed") await clickWhenShown(`[data-settings-action="link-in-usr-local-bin"]`);
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
