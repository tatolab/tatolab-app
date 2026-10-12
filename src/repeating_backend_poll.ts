/** Runs `pollOnce` now and again `intervalMilliseconds` after each run settles, one run at a time, until stopped. */
export class RepeatingBackendPoll {
  private isRunning = false;
  private isPollInFlight = false;
  private pollAgainWhenSettled = false;
  private nextPollTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly pollOnce: () => Promise<void>,
    private readonly intervalMilliseconds: number,
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollNow();
  }

  stop(): void {
    this.isRunning = false;
    this.pollAgainWhenSettled = false;
    clearTimeout(this.nextPollTimer);
  }

  /** Polls at once, or right after the run in flight settles. */
  pollNow(): void {
    if (!this.isRunning) return;
    if (this.isPollInFlight) {
      this.pollAgainWhenSettled = true;
      return;
    }
    clearTimeout(this.nextPollTimer);
    this.isPollInFlight = true;
    void this.pollOnce().finally(() => {
      this.isPollInFlight = false;
      if (!this.isRunning) return;
      if (this.pollAgainWhenSettled) {
        this.pollAgainWhenSettled = false;
        this.pollNow();
        return;
      }
      this.nextPollTimer = setTimeout(() => this.pollNow(), this.intervalMilliseconds);
    });
  }
}
