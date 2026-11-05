import type { TatolabPlatform } from "../shared/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;

/** How long the first-run preset waits for the mock runtime to come up before it presses Get Started. */
const MOCK_RUNTIME_STARTUP_WAIT_MILLISECONDS = 6000;

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

async function clickWhenShown(selector: string, timeoutMilliseconds = PRESET_STEP_TIMEOUT_MILLISECONDS): Promise<boolean> {
  const element = await waitForElement<HTMLElement>(selector, timeoutMilliseconds);
  element?.click();
  return element !== null;
}

/** Presses the element `selector` matches as a pointer does, for a control that opens on the press rather than the click, as a menu's trigger. */
async function pressWhenShown(selector: string): Promise<boolean> {
  const element = await waitForElement<HTMLElement>(selector);
  if (element === null) return false;
  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    element.dispatchEvent(new PointerEvent(eventName, { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true }));
  }
  element.click();
  return true;
}

/** Presses the studio's shortcut for `key`, held with ⌘ on macOS and Ctrl on Linux. */
function pressTheStudioShortcut(key: string, platform: TatolabPlatform): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: platform === "macos", ctrlKey: platform === "linux", bubbles: true }));
}

/** Opens every closed row of the outliner, from the top, until none is left closed. */
async function openEveryOutlinerRow(): Promise<void> {
  await waitForElement(`[data-outliner] [role="treeitem"]`);
  for (;;) {
    const closedRowToggle = document.querySelector<HTMLElement>(`[data-outliner] [role="treeitem"][aria-expanded="false"] [data-tree-row-toggle]`);
    if (closedRowToggle === null) return;
    closedRowToggle.click();
    await new Promise((settled) => window.setTimeout(settled, PRESET_POLL_MILLISECONDS));
  }
}

/**
 * Drives the mock window to the screen the page's query names, as a person would get there, once the window has
 * mounted. In the studio: `?layout=build|compose|spatial|code|perform` (chosen with its shortcut), `?outliner=open`
 * (every row opened), `?select=<row id>` (that outliner row clicked, as `stream:<stream id>`), `?open_stream=<stream id>`
 * (its row double-clicked, opening its tab), `?select_node=<node name>` (that node's card clicked in the stream graph), `?menu=<menu>` (that menu of the bar opened, as `Window`) with
 * `?submenu=<entry>` (that entry's submenu opened, as `Workspace layout`), and `?area_menu=<area id>` (that area's
 * view-type menu opened); with the backend's `?workspace=none|unreadable` and `?port_families=served` (each port's family in the graph and the catalog). `?page=preferences` opens Preferences, on
 * `?section=general|runtime|command-line|about`; there `?restart=pressed|refused` presses Restart and `?link=pressed`
 * presses Link in /usr/local/bin…. `?sheet=uninstall|uninstalling|uninstalled` opens the uninstall sheet from
 * Preferences, pressing Uninstall for the latter two. On first run, with the backend's `?state=setup`,
 * `?setup=getting_set_up` (Continue pressed on Welcome) or `?setup=get_started` (then Get Started once the runtime
 * answers) and `?setup_step_action=<action>` (a step's action pressed).
 */
export async function driveMockWindowToPreset(pageQuery: URLSearchParams, platform: TatolabPlatform): Promise<void> {
  const firstRunStep = pageQuery.get("setup");
  if (firstRunStep === "getting_set_up" || firstRunStep === "get_started") await clickWhenShown(`[data-getting-started-action="continue"]`);
  if (firstRunStep === "get_started") await clickWhenShown(`[data-getting-started-action="get_started"]:not([disabled])`, MOCK_RUNTIME_STARTUP_WAIT_MILLISECONDS);
  const setupStepAction = pageQuery.get("setup_step_action");
  if (setupStepAction !== null) await clickWhenShown(`[data-getting-started-step-action="${CSS.escape(setupStepAction)}"]`);

  const layout = pageQuery.get("layout");
  const layoutDigit = { build: "1", compose: "2", spatial: "3", code: "4", perform: "5" }[layout ?? ""];
  if (layoutDigit !== undefined && (await waitForElement("[data-workspace-layout]")) !== null) pressTheStudioShortcut(layoutDigit, platform);
  if (pageQuery.get("outliner") === "open") await openEveryOutlinerRow();
  const selectedRow = pageQuery.get("select");
  if (selectedRow !== null) await clickWhenShown(`[data-outliner] [data-tree-row-id="${CSS.escape(selectedRow)}"]`);
  const openedStream = pageQuery.get("open_stream");
  if (openedStream !== null) {
    const streamRow = await waitForElement<HTMLElement>(`[data-outliner] [data-tree-row-id="${CSS.escape(`stream:${openedStream}`)}"]`);
    streamRow?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }
  const selectedNode = pageQuery.get("select_node");
  if (selectedNode !== null) await clickWhenShown(`[data-stream-graph] .react-flow__node:has([data-node-graph-card="${CSS.escape(selectedNode)}"])`);
  const areaMenu = pageQuery.get("area_menu");
  if (areaMenu !== null) await pressWhenShown(`[data-area-view-type-menu="${CSS.escape(areaMenu)}"]`);
  const menu = pageQuery.get("menu");
  if (menu !== null) await pressWhenShown(`[data-studio-menu="${CSS.escape(menu)}"]`);
  const submenu = pageQuery.get("submenu");
  if (submenu !== null) {
    const submenuTrigger = await waitForElement<HTMLElement>(`[data-slot="dropdown-menu-sub-trigger"]`);
    if (submenuTrigger?.textContent?.includes(submenu) === true) submenuTrigger.click();
  }

  const page = pageQuery.get("page");
  const sheet = pageQuery.get("sheet");
  if (page === "preferences" || sheet !== null) pressTheStudioShortcut(",", platform);
  const section = pageQuery.get("section");
  if (page === "preferences" && section !== null) await clickWhenShown(`[data-settings-section="${CSS.escape(section)}"]`);
  if (pageQuery.get("restart") === "pressed" || pageQuery.get("restart") === "refused") await clickWhenShown(`[data-runtime-action="restart"]:not([disabled])`);
  if (pageQuery.get("link") === "pressed") await clickWhenShown(`[data-settings-action="link-in-usr-local-bin"]`);
  if (sheet === "uninstall" || sheet === "uninstalling" || sheet === "uninstalled") await clickWhenShown(`[data-action="uninstall"]`);
  if (sheet === "uninstalling" || sheet === "uninstalled") await clickWhenShown(".uninstall-sheet[open] .button-destructive");
}
