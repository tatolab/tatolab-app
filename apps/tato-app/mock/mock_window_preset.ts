import type { TatolabPlatform } from "../src/shared/tatolab_backend_contract";

const PRESET_STEP_TIMEOUT_MILLISECONDS = 3000;
const PRESET_POLL_MILLISECONDS = 40;

/** The first element `selector` matches in the window, or else in a view's frame; a core view's frame is on the window's origin, so its page is reachable. */
function queryTheWindowAndItsViewFrames<ElementType extends Element>(selector: string): ElementType | null {
  const inTheWindow = document.querySelector<ElementType>(selector);
  if (inTheWindow !== null) return inTheWindow;
  for (const viewFrame of document.querySelectorAll<HTMLIFrameElement>("iframe[data-tatolab-view]")) {
    const inTheFrame = viewFrame.contentDocument?.querySelector<ElementType>(selector) ?? null;
    if (inTheFrame !== null) return inTheFrame;
  }
  return null;
}

/** Resolves with the first element `selector` matches once it is in the page or a view's frame, or `null` after `timeoutMilliseconds`. */
function waitForElement<ElementType extends Element>(selector: string, timeoutMilliseconds = PRESET_STEP_TIMEOUT_MILLISECONDS): Promise<ElementType | null> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const look = () => {
      const element = queryTheWindowAndItsViewFrames<ElementType>(selector);
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
    const closedRowToggle = queryTheWindowAndItsViewFrames<HTMLElement>(`[data-outliner] [role="treeitem"][aria-expanded="false"] [data-tree-row-toggle]`);
    if (closedRowToggle === null) return;
    const closedRow = closedRowToggle.closest('[role="treeitem"]');
    closedRowToggle.click();
    // The Outliner keeps a row's opening in its area's settings, so the row draws open once Studio has kept them.
    const startedAt = performance.now();
    while (closedRow?.getAttribute("aria-expanded") === "false" && performance.now() - startedAt < PRESET_STEP_TIMEOUT_MILLISECONDS) {
      await new Promise((settled) => window.setTimeout(settled, PRESET_POLL_MILLISECONDS));
    }
    if (closedRow?.getAttribute("aria-expanded") === "false") return;
  }
}

/**
 * Drives the mock window to the screen the page's query names, as a person would get there, once the window has
 * mounted. In the studio: `?layout=build|compose|spatial|code|perform` (chosen with its shortcut), `?outliner=open`
 * (every row opened), `?select=<row id>` (that outliner row clicked, as `stream:<stream id>`), `?open_stream=<stream id>`
 * (its row double-clicked, opening its tab), `?select_node=<node name>` (that node's card clicked in the stream graph), `?code_file=<file>` (that file of the open project, as `nodes/inverting_effect.py`, opened from the code area's + menu, with a layout that shows one), `?run=live` (Play pressed), `?menu=<menu>` (that menu of the bar opened, as `Window`) with
 * `?submenu=<entry>` (that entry's submenu opened, as `Layout`), and `?area_menu=<area id>` (that area's
 * view-type menu opened) with `?area_view=<view type id>` (that view chosen in it, as a project's view with the backend's `?studio_views=fixture`), `?library_shown=node_types|graph_generators|assets` (that choice of the Library's Show menu, with `?library_asset=<path>` that asset's card clicked, as `media/lobby-intro.mp4`), `?library_row=<row id>` (that Library row clicked, as `source:project/category:Effects/node_type:nodes.inverting_effect:InvertingEffect`, with the backend's `?node_types=unreadable_project` listing every module of the project's own unreadable), `?transaction_row=<transaction>` (that row of Transactions clicked, with the backend's `?developer_mode=on` and `?area_view=transactions`) and `?transactions_filter=open` (its Filter ▾ opened); with the backend's `?project=none|unreadable` (none shows the Projects window, empty with `?recent=none`), `?popped_out_view=<popped-out view as JSON>` (the window an area's Pop out into a window opens), `?module_manager=open` (the window File › Module manager… opens) with `?catalog=unserved` (get.tatolab.com serving no catalog), and `?port_families=unserved` (no port's family in the graph or the catalog, as a runtime from before strict-port-families). `?page=projects` opens the Projects window from File › Projects; `?page=preferences` opens Preferences, on
 * `?section=general|developer|runtime|command-line|about`; there `?restart=pressed|refused` presses Restart and `?link=pressed`
 * presses Link tatolab, with the backend's `?cli_link=not_linked`. `?sheet=new_project` presses the Projects window's New project, then
 * `?new_project_name=<name>` types that name and `?new_project=browse|create` presses Browse… or Create. On the
 * Projects window, `?projects_view=grid|list` chooses that layout from the View menu, `?projects_sort=last_edited|name`
 * that order from the sort menu, `?projects_search=<text>` opens the search and types the text,
 * `?projects_menu=new|view|sort|project` leaves that menu open (`project` the first project's ⋯ menu), and
 * `?projects_dialog=rename|delete|import_archive` opens the first project's Rename or Delete dialog, or the Import project sheet for a `.zip`.
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
  if (pageQuery.get("run") === "live") await clickWhenShown(`[data-studio-play-or-stop="play"]`);
  const areaMenu = pageQuery.get("area_menu");
  if (areaMenu !== null) await pressWhenShown(`[data-area-view-type-menu="${CSS.escape(areaMenu)}"]`);
  const areaView = pageQuery.get("area_view");
  if (areaMenu !== null && areaView !== null) await clickWhenShown(`[data-view-type-choice="${CSS.escape(areaView)}"]`);
  const transactionRow = pageQuery.get("transaction_row");
  if (transactionRow !== null) await clickWhenShown(`[data-record-table-row="${CSS.escape(transactionRow)}"]`);
  if (pageQuery.get("transactions_filter") === "open") await pressWhenShown(`[data-transactions-filter]`);
  const libraryShown = pageQuery.get("library_shown");
  if (libraryShown !== null) {
    await pressWhenShown(`[data-library-shown]`);
    await clickWhenShown(`[data-library-shown-choice="${CSS.escape(libraryShown)}"]`);
  }
  const libraryAsset = pageQuery.get("library_asset");
  if (libraryAsset !== null) await clickWhenShown(`[data-library-asset="${CSS.escape(libraryAsset)}"]`);
  const libraryRow = pageQuery.get("library_row");
  if (libraryRow !== null) await clickWhenShown(`[data-library-declarations] [data-tree-row-id="${CSS.escape(libraryRow)}"]`);
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
  await driveTheProjectsWindowToPreset(pageQuery);
  if (pageQuery.get("sheet") === "new_project") {
    await clickWhenShown(`[data-projects-action="new"]`);
    const newProjectName = pageQuery.get("new_project_name");
    if (newProjectName !== null) await typeWhenShown(`[data-new-project-name]`, newProjectName);
    const newProjectAction = pageQuery.get("new_project");
    if (newProjectAction === "browse" || newProjectAction === "create") await clickWhenShown(`[data-new-project-action="${newProjectAction}"]`);
  }
}

/** The Projects window's layout, order, search and open menu the page's query names. */
async function driveTheProjectsWindowToPreset(pageQuery: URLSearchParams): Promise<void> {
  const projectsView = pageQuery.get("projects_view");
  if (projectsView !== null) {
    await pressWhenShown(`[data-projects-view]`);
    await clickWhenShown(`[data-projects-view-choice="${CSS.escape(projectsView)}"]`);
  }
  const projectsSort = pageQuery.get("projects_sort");
  if (projectsSort !== null) {
    await pressWhenShown(`[data-projects-sort]`);
    await clickWhenShown(`[data-projects-sort-choice="${CSS.escape(projectsSort)}"]`);
  }
  const projectsSearch = pageQuery.get("projects_search");
  if (projectsSearch !== null) {
    await clickWhenShown(`button[data-projects-search]`);
    await typeWhenShown(`input[data-projects-search]`, projectsSearch);
  }
  const projectsMenu = pageQuery.get("projects_menu");
  if (projectsMenu === "new") await pressWhenShown(`[data-projects-action="new-menu"]`);
  if (projectsMenu === "view") await pressWhenShown(`[data-projects-view]`);
  if (projectsMenu === "sort") await pressWhenShown(`[data-projects-sort]`);
  if (projectsMenu === "project") await pressWhenShown(`[data-projects-project] [data-project-more-actions]`);
  const projectsDialog = pageQuery.get("projects_dialog");
  if (projectsDialog === "rename" || projectsDialog === "delete") {
    await pressWhenShown(`[data-projects-project] [data-project-more-actions]`);
    await clickWhenShown(`[data-project-action="${projectsDialog}"]`);
  }
  if (projectsDialog === "import_archive") {
    await pressWhenShown(`[data-projects-action="new-menu"]`);
    await clickWhenShown(`[data-projects-new-menu-choice="import-archive"]`);
  }
}
