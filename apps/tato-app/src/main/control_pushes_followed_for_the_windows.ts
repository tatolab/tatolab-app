// What the app's windows follow of the runtime's pushes over one `/control/ws` WebSocket: each
// subject, a stream graph or a project's log, is subscribed once however many windows follow it,
// and each push of a followed subject, with what it carries, is handed to every window following
// it. A subject the runtime would not subscribe is subscribed again after a wait. A connection that
// closes is opened again after a wait, and each window told to read its subject again once it is
// subscribed again.

import type { LocalApiRequestFailure } from "./local_api_request_failure.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The parts of a `/control/ws` connection one kind of push is followed over, so a test can stand in for one. */
export interface ControlPushesConnection<Pushed> {
  /** Subscribe to the pushes of `subject`; refused in the runtime's words. */
  subscribeToThePushesOf(subject: string): Promise<Result<void, string>>;
  /** Call `listener` with each subject the runtime pushes a change of on this connection, named as it was subscribed, and what the push carries. */
  onPushed(listener: (subject: string, pushed: Pushed) => void): void;
  onClosed(whenTheConnectionCloses: (whyItClosed: string) => void): void;
  isOpen(): boolean;
  close(): void;
}

/** What following one kind of push reaches: the runtime, the windows, a timer, and the app's log. */
export interface ControlPushesFollowedForTheWindowsSources<WindowFollowing, Pushed> {
  openThePushesConnection(): Promise<Result<ControlPushesConnection<Pushed>, LocalApiRequestFailure>>;
  /** Hand `windowFollowing` what the runtime pushed of `subject`, or `null` to tell it to read `subject` again, as it is subscribed. */
  tellTheWindowItChanged(windowFollowing: WindowFollowing, subject: string, pushed: Pushed | null): void;
  /** Call `then` once, `afterMs` from now. */
  waitThen(afterMs: number, then: () => void): void;
  tatolabAppLog: TatolabAppLog;
  /** What a subject is, as the app's log names it: `stream graph`, `project log`. */
  subjectAsTheLogNamesIt: string;
}

/** How long a subject the runtime would not subscribe, or whose connection closed, waits before it is subscribed again. */
export const CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER_MS = 2_500;

/** Every subject of one kind the app's windows follow, over one connection held open while any window follows one. */
export class ControlPushesFollowedForTheWindows<WindowFollowing, Pushed> {
  private readonly windowsFollowingBySubject = new Map<string, Set<WindowFollowing>>();
  private readonly subjectsSubscribed = new Set<string>();
  private readonly subjectsBeingSubscribed = new Set<string>();
  private readonly subjectsAwaitingASubscribe = new Set<string>();
  private pushesConnection: ControlPushesConnection<Pushed> | null = null;
  private pushesConnectionOpening: Promise<Result<ControlPushesConnection<Pushed>, string>> | null = null;

  constructor(private readonly sources: ControlPushesFollowedForTheWindowsSources<WindowFollowing, Pushed>) {}

  /** Tell `windowFollowing` of each push of `subject` from now on, and once as soon as it is subscribed. */
  follow(subject: string, windowFollowing: WindowFollowing): void {
    const windowsFollowing = this.windowsFollowingBySubject.get(subject) ?? new Set<WindowFollowing>();
    windowsFollowing.add(windowFollowing);
    this.windowsFollowingBySubject.set(subject, windowsFollowing);
    void this.subscribe(subject);
  }

  /** Stop telling `windowFollowing` of `subject`; the connection closes once no window follows any subject. */
  stopFollowing(subject: string, windowFollowing: WindowFollowing): void {
    const windowsFollowing = this.windowsFollowingBySubject.get(subject);
    if (windowsFollowing === undefined) return;
    windowsFollowing.delete(windowFollowing);
    if (windowsFollowing.size === 0) this.windowsFollowingBySubject.delete(subject);
    this.closeTheConnectionOnceNoWindowFollows();
  }

  /** Stop telling `windowFollowing` of any subject, as it closes. */
  stopFollowingEverySubjectOf(windowFollowing: WindowFollowing): void {
    for (const subject of [...this.windowsFollowingBySubject.keys()]) this.stopFollowing(subject, windowFollowing);
  }

  /** Stop following every subject and close the connection, as the app quits. */
  stopFollowingEverySubject(): void {
    this.windowsFollowingBySubject.clear();
    this.closeTheConnectionOnceNoWindowFollows();
  }

  private closeTheConnectionOnceNoWindowFollows(): void {
    if (this.windowsFollowingBySubject.size > 0) return;
    const pushesConnection = this.pushesConnection;
    this.pushesConnection = null;
    this.subjectsSubscribed.clear();
    pushesConnection?.close();
  }

  private async subscribe(subject: string): Promise<void> {
    if (this.subjectsSubscribed.has(subject) || this.subjectsBeingSubscribed.has(subject) || this.subjectsAwaitingASubscribe.has(subject)) return;
    this.subjectsBeingSubscribed.add(subject);
    const opened = await this.thePushesConnection();
    if (!opened.ok) {
      this.subjectsBeingSubscribed.delete(subject);
      this.subscribeAgainAfterAWait(subject, opened.failure);
      return;
    }
    const subscribed = await opened.value.subscribeToThePushesOf(subject);
    this.subjectsBeingSubscribed.delete(subject);
    if (this.pushesConnection !== opened.value || !this.windowsFollowingBySubject.has(subject)) return;
    if (!subscribed.ok) {
      this.subscribeAgainAfterAWait(subject, subscribed.failure);
      return;
    }
    this.subjectsSubscribed.add(subject);
    this.tellTheWindowsItChanged(subject, null);
  }

  private subscribeAgainAfterAWait(subject: string, whyItWasNotSubscribed: string): void {
    if (!this.windowsFollowingBySubject.has(subject) || this.subjectsAwaitingASubscribe.has(subject)) return;
    this.sources.tatolabAppLog.info(`will follow a ${this.sources.subjectAsTheLogNamesIt} again`, { subject, because: whyItWasNotSubscribed });
    this.subjectsAwaitingASubscribe.add(subject);
    this.sources.waitThen(CONTROL_PUSHES_SUBSCRIBED_AGAIN_AFTER_MS, () => {
      this.subjectsAwaitingASubscribe.delete(subject);
      if (this.windowsFollowingBySubject.has(subject)) void this.subscribe(subject);
    });
  }

  private thePushesConnection(): Promise<Result<ControlPushesConnection<Pushed>, string>> {
    if (this.pushesConnection !== null && this.pushesConnection.isOpen()) return Promise.resolve(succeeded(this.pushesConnection));
    if (this.pushesConnectionOpening !== null) return this.pushesConnectionOpening;
    const opening = this.openThePushesConnection().finally(() => {
      if (this.pushesConnectionOpening === opening) this.pushesConnectionOpening = null;
    });
    this.pushesConnectionOpening = opening;
    return opening;
  }

  private async openThePushesConnection(): Promise<Result<ControlPushesConnection<Pushed>, string>> {
    const opened = await this.sources.openThePushesConnection();
    if (!opened.ok) return failedWith(opened.failure.failureDescription);
    const pushesConnection = opened.value;
    if (this.windowsFollowingBySubject.size === 0) {
      pushesConnection.close();
      return failedWith(`no window follows a ${this.sources.subjectAsTheLogNamesIt} any longer`);
    }
    this.pushesConnection = pushesConnection;
    pushesConnection.onPushed((subject, pushed) => {
      if (this.pushesConnection === pushesConnection) this.tellTheWindowsItChanged(subject, pushed);
    });
    pushesConnection.onClosed((whyItClosed) => this.subscribeEverySubjectAgainAfter(pushesConnection, whyItClosed));
    return succeeded(pushesConnection);
  }

  private subscribeEverySubjectAgainAfter(closedConnection: ControlPushesConnection<Pushed>, whyItClosed: string): void {
    if (this.pushesConnection !== closedConnection) return;
    this.pushesConnection = null;
    this.subjectsSubscribed.clear();
    for (const subject of this.windowsFollowingBySubject.keys()) this.subscribeAgainAfterAWait(subject, whyItClosed);
  }

  private tellTheWindowsItChanged(subject: string, pushed: Pushed | null): void {
    for (const windowFollowing of [...(this.windowsFollowingBySubject.get(subject) ?? [])]) this.sources.tellTheWindowItChanged(windowFollowing, subject, pushed);
  }
}
