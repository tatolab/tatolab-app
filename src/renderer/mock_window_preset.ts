import type { TatolabPlatform } from "../shared/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;

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

/** Types `text` into the input `selector` matches as a person would, so React sees the change. */
async function typeWhenShown(selector: string, text: string): Promise<void> {
  const input = await waitForElement<HTMLInputElement>(selector);
  if (input === null) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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
 * (its row double-clicked, opening its tab), `?select_node=<node name>` (that node's card clicked in the stream graph), `?code_file=<file>` (that file of the open project, as `nodes/inverting_effect.py`, opened from the code area's + menu, with a layout that shows one), `?run=live` (Live pressed), `?menu=<menu>` (that menu of the bar opened, as `Window`) with
 * `?submenu=<entry>` (that entry's submenu opened, as `Layout`), and `?area_menu=<area id>` (that area's
 * view-type menu opened); with the backend's `?project=none|unreadable` (none shows the Projects window, empty with `?recent=none`), `?popped_out_viewer=<pin as JSON>` (the window a Viewer's Pop out opens), `?get_more=open` (the window File › Get more… opens) with `?catalog=unserved` (get.tatolab.com serving no catalog), and `?port_families=unserved` (no port's family in the graph or the catalog, as a runtime from before strict-port-families). `?page=projects` opens the Projects window from File › Projects; `?page=preferences` opens Preferences, on
 * `?section=general|runtime|command-line|about`; there `?restart=pressed|refused` presses Restart and `?link=pressed`
 * presses Link tatolab, with the backend's `?cli_link=not_linked`. `?sheet=new_project` presses the Projects window's New project, then
 * `?new_project_name=<name>` types that name and `?new_project=browse|create` presses Browse… or Create.
 */
export async function driveMockWindowToPreset(pageQuery: URLSearchParams, platform: TatolabPlatform): Promise<void> {
  const layout = pageQuery.get("layout");
  const layoutDigit = { build: "1", compose: "2", spatial: "3", code: "4", perform: "5" }[layout ?? ""];
  if (layoutDigit !== undefined && (await waitForElement("[data-studio-layout]")) !== null) pressTheStudioShortcut(layoutDigit, platform);
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
  const codeFile = pageQuery.get("code_file");
  if (codeFile !== null) {
    await pressWhenShown(`[data-code-file-menu="open"]`);
    await clickWhenShown(`[data-code-file-choice$="/${CSS.escape(codeFile)}"]`);
  }
  if (pageQuery.get("run") === "live") await clickWhenShown(`[data-studio-run-live]`);
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
  if (page === "projects") {
    await pressWhenShown(`[data-studio-menu="File"]`);
    [...document.querySelectorAll<HTMLElement>(`[role="menuitem"]`)].find((menuItem) => menuItem.textContent?.trim() === "Projects")?.click();
  }
  if (page === "preferences") pressTheStudioShortcut(",", platform);
  const section = pageQuery.get("section");
  if (page === "preferences" && section !== null) await clickWhenShown(`[data-settings-section="${CSS.escape(section)}"]`);
  if (pageQuery.get("restart") === "pressed" || pageQuery.get("restart") === "refused") await clickWhenShown(`[data-runtime-action="restart"]:not([disabled])`);
  if (pageQuery.get("link") === "pressed") await clickWhenShown(`[data-settings-action="link-command-line-tool"]`);
  if (pageQuery.get("sheet") === "new_project") {
    await clickWhenShown(`[data-projects-action="new"]`);
    const newProjectName = pageQuery.get("new_project_name");
    if (newProjectName !== null) await typeWhenShown(`[data-new-project-name]`, newProjectName);
    const newProjectAction = pageQuery.get("new_project");
    if (newProjectAction === "browse" || newProjectAction === "create") await clickWhenShown(`[data-new-project-action="${newProjectAction}"]`);
  }
}
