import type { TatolabPlatform } from "../shared/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;
const GRAPH_FIT_SETTLE_MILLISECONDS = 600;

/** How long the first-run preset waits for the mock runtime to come up before it presses Get Started. */
const MOCK_RUNTIME_STARTUP_WAIT_MILLISECONDS = 6000;

/** How long a preset waits for the mock runtime to load a project, making its `.venv` first. */
const MOCK_PROJECT_LOAD_TIMEOUT_MILLISECONDS = 10_000;

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
  if (addStep !== "folder" && addStep !== "following" && addStep !== "done" && addStep !== "away") return;
  await clickWhenShown(`[data-add-stream-action="choose_folder"]`);
  if (addStep === "folder") return;
  await waitForElement(`[data-add-stream-folder]:not([data-add-stream-folder=""])`);
  await clickWhenShown(`[data-add-stream-action="import"]:not([disabled])`);
  if (addStep === "away") {
    await waitForElement(`[data-add-stream-step="following"]`);
    await clickWhenShown(`[data-form-dialog-close]`);
    await waitForElement(`[data-add-stream-run-notice="ended"]`, MOCK_PROJECT_LOAD_TIMEOUT_MILLISECONDS);
    return;
  }
  if (addStep === "following") await waitForElement(`[data-add-stream-step="following"]`);
  if (addStep === "done") await waitForElement(`[data-add-stream-step="ended"]`, MOCK_PROJECT_LOAD_TIMEOUT_MILLISECONDS);
}

/** The load the add-stream dialog follows cancelled once it reaches `making_the_venv`: `pressed` stops while it is cancelling, `ended` once the dialog says it was cancelled. */
async function driveTheAddStreamCancelToPreset(addCancel: string | null): Promise<void> {
  if (addCancel !== "pressed" && addCancel !== "ended") return;
  await waitForElement(`[data-add-stream-load-step="making_the_venv"]`, MOCK_PROJECT_LOAD_TIMEOUT_MILLISECONDS);
  await clickWhenShown(`[data-add-stream-action="cancel_the_load"]:not([disabled])`);
  if (addCancel === "ended") await waitForElement(`[data-add-stream-ending="cancelled"]`, MOCK_PROJECT_LOAD_TIMEOUT_MILLISECONDS);
}

/** Types `text` into the controlled field `field`, one line or several, as a person would, so React's onChange sees it. */
function typeIntoAField(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const fieldPrototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(fieldPrototype, "value")?.set?.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The text `?relay_file=` hands over as the chosen file's, a stand-in moq.pro signing key. */
const MOCK_CHOSEN_FILE_TEXT = '{"kty":"OKP","crv":"Ed25519","x":"mock-public-key","d":"mock-private-key"}\n';

/** Hands `fileName` to the file input `fileInput` as if the person had picked it in the system's file chooser. */
function chooseAFile(fileInput: HTMLInputElement, fileName: string): void {
  const chosenFiles = new DataTransfer();
  chosenFiles.items.add(new File([MOCK_CHOSEN_FILE_TEXT], fileName, { type: "application/json" }));
  fileInput.files = chosenFiles.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Settings › Relays driven to `?relay=add:<kind>|configure:<relay_id>|remove:<relay_id>`, then each `?relay_fill=<setting>:<text>` typed,
 * each `?relay_file=<setting>:<file name>` chosen and `?relay_submit=pressed`.
 */
async function driveRelaysToPreset(pageQuery: URLSearchParams): Promise<void> {
  const [relayDialog = "", relayDialogSubject = ""] = (pageQuery.get("relay") ?? "").split(":");
  if (relayDialog === "add-menu") {
    await clickWhenShown(`[data-relay-action="add-menu"]`);
    return;
  } else if (relayDialog === "add") {
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
    const field = await waitForElement<HTMLInputElement | HTMLTextAreaElement>(`[data-relay-setting-field="${CSS.escape(settingName)}"]`);
    if (field !== null) typeIntoAField(field, fill.slice(separator + 1));
  }
  for (const chosenFile of pageQuery.getAll("relay_file")) {
    const separator = chosenFile.indexOf(":");
    if (separator <= 0) continue;
    const fileInput = await waitForElement<HTMLInputElement>(`[data-relay-setting="${CSS.escape(chosenFile.slice(0, separator))}"] input[type="file"]`);
    if (fileInput !== null) chooseAFile(fileInput, chosenFile.slice(separator + 1));
  }
  if (pageQuery.get("relay_submit") === "pressed") await clickWhenShown(`[data-relay-action="add"]:not([disabled]), [data-relay-action="save"]:not([disabled])`);
}

/**
 * Right-clicks the sidebar row of the stream `streamId`, then stops on the menu (`menu`), or chooses Rename… and
 * types `renameTo` into its dialog's field (by default), or presses Rename too (`pressed`).
 */
async function driveTheRightClickRenameToPreset(streamId: string, renameStep: string | null, renameTo: string | null): Promise<void> {
  const sidebarRow = await waitForElement<HTMLElement>(`[data-sidebar-stream="${CSS.escape(streamId)}"] a`);
  if (sidebarRow === null) return;
  const rowBounds = sidebarRow.getBoundingClientRect();
  sidebarRow.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: rowBounds.left + 24, clientY: rowBounds.top + rowBounds.height / 2 }));
  if (renameStep === "menu") return;
  await clickWhenShown(`[data-slot="context-menu-item"][data-stream-action="rename_stream"]`);
  const displayNameField = await waitForElement<HTMLInputElement>("[data-stream-rename-display-name]");
  if (displayNameField === null || renameTo === null) return;
  typeIntoAField(displayNameField, renameTo);
  if (renameStep === "pressed") await clickWhenShown('[data-stream-rename-action="rename"]:not([disabled])');
}

async function clickWhenShown(selector: string, timeoutMilliseconds = PRESET_STEP_TIMEOUT_MILLISECONDS): Promise<boolean> {
  const element = await waitForElement<HTMLElement>(selector, timeoutMilliseconds);
  element?.click();
  return element !== null;
}

/** A project's page opened from its sidebar folder, on its tab, with Reload pressed and followed or Remove project… chosen, as the preset asks. */
async function driveTheProjectPageToPreset(pageQuery: URLSearchParams): Promise<void> {
  const projectFolderName = pageQuery.get("project");
  if (projectFolderName === null) return;
  await clickWhenShown(`[data-sidebar-project-folder$="/${CSS.escape(projectFolderName)}"] a`);
  const projectTab = pageQuery.get("project_tab");
  if (projectTab !== null) await clickWhenShown(`[data-project-page-header] [data-project-tab="${CSS.escape(projectTab)}"]`);
  const projectAction = pageQuery.get("project_action");
  if (projectAction === "reload" || projectAction === "reloaded" || projectAction === "reload_cancelled") {
    await clickWhenShown(`[data-project-page-header] [data-project-action="reload"]`);
    if (projectAction === "reload_cancelled") await clickWhenShown(`[data-project-page-header] [data-project-action="cancel_reload"]:not([disabled])`);
    if (projectAction === "reloaded" || projectAction === "reload_cancelled") await waitForElement("[data-project-reload-outcome]", MOCK_PROJECT_LOAD_TIMEOUT_MILLISECONDS);
  }
  if (projectAction === "remove_project") {
    await clickWhenShown(`[data-project-page-header] [data-project-action="more"]`);
    await clickWhenShown(`[data-slot="dropdown-menu-item"][data-project-action="remove_project"]`);
  }
}

/**
 * Browser-mock only: drives the window the way a person would, to the screen `?stream=<stream id>` (a mock stream's id, such as `pattern-main-645dbe`), `?tab=overview|graph|logs|inspect`,
 * `?stream_page_action=<action>` (a header or menu action of the stream's page, once its graph shows: `stop_stream` there gives
 * the steps as of the last load), `?inspect=tree`,
 * `?page=settings|add-stream` (the add-stream dialog, on Import project), on Settings `?section=general|appearance|runtime|relays|command-line|about`, on its Relays
 * `?relay=add-menu` (the + menu of adapters open) or `?relay=add:<adapter>|configure:<relay_id>|remove:<relay_id>` (that dialog open) with each
 * `?relay_fill=<setting>:<text>` typed into it, `?relay_file=<setting>:<file name>` chosen as its file and `?relay_submit=pressed` (Add relay or
 * Save pressed), with the backend's `?relays=local|every-field-type` and `?adapter_names=none`, and on its Runtime
 * `?restart=pressed` (Restart runtime pressed: Starting, then Running up 0m) or `?restart=refused` (the service manager refusing it),
 * with the backend's `?runtime_log=none`, `?open_at_login=on|approval|not_offered`, `?notifications=unsupported` and `?cli_version=reading|unreadable`, on About the backend's `?app_build=release|modified|none`, the backend's `?stream_page_requested=<stream id>` (a
 * click on that stream's failure notification), on the add-project dialog `?add=folder|following|done|away` (a folder chosen, its import followed, ended, or
 * the dialog closed while it loads and the load's notice shown once it ends) or
 * `?add=new|created` (opened on New project, then Create pressed, which has the runtime write it and load it), and `?add_cancel=pressed|ended` (Cancel pressed once the load makes its `.venv`, then followed to cancelled), with the backend's `?add_folder=` (`no-venv` for a load that
 * makes the `.venv` first, `several` for two streams, one failing), `?add_new_folder=existing`, `?add_venv=refused` (the runtime's uv refusing to make it) and `?add_action=not_held`, on Settings › Command line the backend's `?usr_local_bin=linked|cancel`, `?remove_project=<stream id>` (Remove project… chosen on that stream's row, its confirmation open), `?rename=<stream id>` (its sidebar row right-clicked and Rename… chosen, with `?rename_to=<name>` typed, and `?rename_step=menu` stopping on the menu or `pressed` pressing Rename), `?stream_action=stop_stream|start_stream:<stream id>` and `?row_cancel=<stream id>` (Cancel pressed on that row),
 * `?project=<folder name>` (that project's page, from its sidebar folder) with `?project_tab=logs` and `?project_action=reload|reloaded|reload_cancelled|remove_project` (Reload pressed, then followed to
 * its end or cancelled, or Remove project… chosen, its confirmation open), and on a project's Logs `?stream_menu=open`,
 * `?sheet=uninstall|uninstalling|uninstalled`, on first run `?setup=getting_set_up` (Continue pressed on Welcome) or `?setup=get_started` (then
 * Get Started once the runtime answers) and `?setup_step_action=<action>` (a step's action pressed), with the backend's `?state=setup`, or
 * `?first_run=unfinished` over any runtime state, as `?state=approval|blocked|never-answered`, and its `?first_run_remember=refused`,
 * on Settings › Command line `?link=pressed` (Link in /usr/local/bin… pressed), on Graph `?step=<step>` (selected), `?focus=<step>` (its card
 * holding keyboard focus), `?pin=<step>.<port>`
 * (its preview pinned), `?hover=<step>.<port>` (its hover preview open), `?previews=off` and `?counters=off`,
 * on Logs `?levels=info|warnings|errors`, `?log_scope=whole_project`, `?held_records=<n>` and `?log_folder=missing` (the backend's options for the pointer row and a refused open), `?record=<position>` or `?record=problem` (the newest warning or error selected),
 * `?action_menu=open`,
 * `?only_step=<step>` (that step alone chosen in the step menu) and `?step_menu=open`, and `?search=<query>` name, so each screen can be shown and pictured from its URL. `?theme=light|dark` is read by the page's first script, before first paint.
 */
export async function driveMockWindowToPreset(pageQuery: URLSearchParams, platform: TatolabPlatform): Promise<void> {
  const streamId = pageQuery.get("stream");
  const rowStreamAction = pageQuery.get("stream_action");
  if (rowStreamAction !== null) {
    const [streamAction, actedOnStreamId] = rowStreamAction.split(":");
    await clickWhenShown(`[data-stream-row="${CSS.escape(actedOnStreamId ?? "")}"] [data-stream-action="${CSS.escape(streamAction)}"]`);
  }
  const streamWhoseActionToCancel = pageQuery.get("row_cancel");
  if (streamWhoseActionToCancel !== null) await clickWhenShown(`[data-stream-row="${CSS.escape(streamWhoseActionToCancel)}"] [data-stream-action="cancel_stream_action"]`);
  const streamToRename = pageQuery.get("rename");
  if (streamToRename !== null) await driveTheRightClickRenameToPreset(streamToRename, pageQuery.get("rename_step"), pageQuery.get("rename_to"));
  const streamWhoseProjectToRemove = pageQuery.get("remove_project");
  if (streamWhoseProjectToRemove !== null) {
    await clickWhenShown(`[data-stream-row="${CSS.escape(streamWhoseProjectToRemove)}"] [data-stream-action="more"]`);
    await clickWhenShown(`[data-slot="dropdown-menu-item"][data-stream-action="remove_project"]`);
  }
  if (streamId !== null) await clickWhenShown(`[data-stream-row="${CSS.escape(streamId)}"]`);
  await driveTheProjectPageToPreset(pageQuery);
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
  if (pageQuery.get("log_scope") === "whole_project") await clickWhenShown(`[data-stream-log-scope="whole_project"]`);
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
  if (pageQuery.get("stream_menu") === "open" && document.querySelector('[data-slot="dropdown-menu-content"]') === null) await clickWhenShown("[data-stream-log-stream-filter]");
  if (pageQuery.get("action_menu") === "open" && document.querySelector('[data-slot="dropdown-menu-content"]') === null) await clickWhenShown("[data-stream-log-action-filter]");
  const page = pageQuery.get("page");
  if (page === "settings") await clickWhenShown(`[data-window-navigation="settings"]`);
  if (page === "add-stream") await driveAddStreamToPreset(pageQuery.get("add"));
  if (page === "add-stream") await driveTheAddStreamCancelToPreset(pageQuery.get("add_cancel"));
  const settingsSection = pageQuery.get("section");
  if (page === "settings" && settingsSection !== null) await clickWhenShown(`[data-settings-section="${CSS.escape(settingsSection)}"]`);
  if (page === "settings" && settingsSection === "relays") await driveRelaysToPreset(pageQuery);
  if (pageQuery.get("restart") === "pressed" || pageQuery.get("restart") === "refused") await clickWhenShown(`[data-runtime-action="restart"]:not([disabled])`);
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
