import { createElement } from "../dom";

/** The dock never gets shorter than this. */
export const SMALLEST_LOG_DOCK_HEIGHT_PIXELS = 120;
/** The canvas above the dock never gets shorter than this. */
export const SMALLEST_GRAPH_CANVAS_HEIGHT_PIXELS = 160;
const DEFAULT_LOG_DOCK_SHARE = 0.46;
const DEFAULT_LOG_DOCK_SMALLEST_PIXELS = 200;
const DEFAULT_LOG_DOCK_LARGEST_PIXELS = 420;
const KEYBOARD_STEP_PIXELS = 16;
/** Where the person's own dock height is kept between launches. */
export const LOG_DOCK_HEIGHT_STORAGE_KEY = "tatolab.logDockHeightPixels";

/** The dock's height before the person drags it: 46% of the workspace, within 200 and 420 px, and clamped to fit. */
export function defaultLogDockHeight(workspaceHeight: number): number {
  const shareOfWorkspace = Math.round(workspaceHeight * DEFAULT_LOG_DOCK_SHARE);
  const withinBounds = Math.min(DEFAULT_LOG_DOCK_LARGEST_PIXELS, Math.max(DEFAULT_LOG_DOCK_SMALLEST_PIXELS, shareOfWorkspace));
  return clampLogDockHeight(withinBounds, workspaceHeight);
}

/** `requestedHeight` kept at least 120 px, and short enough to leave the canvas 160 px; the dock wins a tie. */
export function clampLogDockHeight(requestedHeight: number, workspaceHeight: number): number {
  const tallestDock = workspaceHeight - SMALLEST_GRAPH_CANVAS_HEIGHT_PIXELS;
  return Math.round(Math.max(SMALLEST_LOG_DOCK_HEIGHT_PIXELS, Math.min(requestedHeight, tallestDock)));
}

function readStoredLogDockHeight(): number | null {
  try {
    const storedText = window.localStorage.getItem(LOG_DOCK_HEIGHT_STORAGE_KEY);
    const storedHeight = storedText === null ? Number.NaN : Number(storedText);
    return Number.isFinite(storedHeight) ? storedHeight : null;
  } catch {
    return null;
  }
}

function writeStoredLogDockHeight(height: number | null): void {
  try {
    if (height === null) window.localStorage.removeItem(LOG_DOCK_HEIGHT_STORAGE_KEY);
    else window.localStorage.setItem(LOG_DOCK_HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // A webview with storage turned off keeps the height for this session only.
  }
}

/**
 * The line between the canvas and the log dock: drag it, or focus it and press ↑ or ↓, to resize the dock, and
 * double-click it to put the dock back. It sets `--log-dock-height` on the workspace and re-clamps on every resize.
 */
export class LogDockSplitter {
  readonly element: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private chosenHeight: number | null = readStoredLogDockHeight();
  private shownHeight = 0;

  constructor(private readonly workspaceElement: HTMLElement) {
    this.element = createElement("div", {
      class: "log-dock-splitter",
      role: "separator",
      tabindex: "0",
      "aria-orientation": "horizontal",
      "aria-label": "Resize the log dock",
      "aria-valuemin": String(SMALLEST_LOG_DOCK_HEIGHT_PIXELS),
    });
    this.element.addEventListener("pointerdown", (pointerEvent) => this.startDragging(pointerEvent));
    this.element.addEventListener("dblclick", () => {
      this.chosenHeight = null;
      writeStoredLogDockHeight(null);
      this.applyHeight();
    });
    this.element.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "ArrowUp" && keyboardEvent.key !== "ArrowDown") return;
      keyboardEvent.preventDefault();
      this.chooseHeight(this.shownHeight + (keyboardEvent.key === "ArrowUp" ? KEYBOARD_STEP_PIXELS : -KEYBOARD_STEP_PIXELS));
    });
    this.resizeObserver = new ResizeObserver(() => this.applyHeight());
    this.resizeObserver.observe(workspaceElement);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
  }

  private startDragging(pointerEvent: PointerEvent): void {
    if (pointerEvent.button !== 0) return;
    pointerEvent.preventDefault();
    this.element.setPointerCapture(pointerEvent.pointerId);
    this.element.dataset.dragging = "true";
    const workspaceBottom = this.workspaceElement.getBoundingClientRect().bottom;
    const onPointerMove = (moveEvent: PointerEvent) => this.chooseHeight(workspaceBottom - moveEvent.clientY);
    const onPointerUp = () => {
      delete this.element.dataset.dragging;
      this.element.removeEventListener("pointermove", onPointerMove);
      this.element.removeEventListener("pointerup", onPointerUp);
      this.element.removeEventListener("pointercancel", onPointerUp);
      writeStoredLogDockHeight(this.chosenHeight);
    };
    this.element.addEventListener("pointermove", onPointerMove);
    this.element.addEventListener("pointerup", onPointerUp);
    this.element.addEventListener("pointercancel", onPointerUp);
  }

  private chooseHeight(requestedHeight: number): void {
    const workspaceHeight = this.workspaceElement.clientHeight;
    if (workspaceHeight === 0) return;
    this.chosenHeight = clampLogDockHeight(requestedHeight, workspaceHeight);
    if (this.element.dataset.dragging !== "true") writeStoredLogDockHeight(this.chosenHeight);
    this.applyHeight();
  }

  private applyHeight(): void {
    const workspaceHeight = this.workspaceElement.clientHeight;
    if (workspaceHeight === 0) return;
    this.shownHeight =
      this.chosenHeight === null ? defaultLogDockHeight(workspaceHeight) : clampLogDockHeight(this.chosenHeight, workspaceHeight);
    this.workspaceElement.style.setProperty("--log-dock-height", `${this.shownHeight}px`);
    this.element.setAttribute("aria-valuenow", String(this.shownHeight));
    this.element.setAttribute("aria-valuemax", String(Math.max(SMALLEST_LOG_DOCK_HEIGHT_PIXELS, workspaceHeight - SMALLEST_GRAPH_CANVAS_HEIGHT_PIXELS)));
  }
}
