/** How long after its page first paints the window still waits for the page's first status before showing empty. */
export const MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS = 2000;

/** Holds the window's first show until its page has drawn its first status, will draw nothing, or has run past the wait limit; after that a show is immediate. */
export class MainWindowFirstShowGate {
  private pageIsReadyToShow = false;
  private showWaitsForThePage = false;
  private drawWaitLimitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly putTheWindowOnScreen: () => void) {}

  /** The window's page painted for the first time, empty until it draws its first status. */
  pageFirstPainted(): void {
    if (this.pageIsReadyToShow || this.drawWaitLimitTimer !== null) return;
    this.drawWaitLimitTimer = setTimeout(() => this.pageIsReady(), MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS);
  }

  /** The window's page drew its first status. */
  pageDrewItsFirstStatus(): void {
    this.pageIsReady();
  }

  /** The window's page failed to load or its renderer ended: it will draw nothing, so it shows as it is. */
  pageWillDrawNothing(): void {
    this.pageIsReady();
  }

  /** Put the window on screen now, or as soon as its page is ready. */
  show(): void {
    if (this.pageIsReadyToShow) this.putTheWindowOnScreen();
    else this.showWaitsForThePage = true;
  }

  /** Drop a show still waiting for the page. */
  hide(): void {
    this.showWaitsForThePage = false;
  }

  /** Whether a show is waiting for the page, which counts as the window showing. */
  showIsWaitingForThePage(): boolean {
    return this.showWaitsForThePage && !this.pageIsReadyToShow;
  }

  private pageIsReady(): void {
    if (this.drawWaitLimitTimer !== null) clearTimeout(this.drawWaitLimitTimer);
    this.drawWaitLimitTimer = null;
    if (this.pageIsReadyToShow) return;
    this.pageIsReadyToShow = true;
    if (this.showWaitsForThePage) this.putTheWindowOnScreen();
  }
}
