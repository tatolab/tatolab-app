import { describeBackendRejection, type TatolabBackend } from "./backend/tatolab_backend";
import { canCancelTheFollowedAction, followedActionCancelAfter, isStreamActionEnded, type FollowedStreamActionCancel } from "./presentation/add_stream_flow";
import type { StreamActionDescription } from "../shared/tatolab_backend_contract";
import { StreamActionFollowing, type StreamActionFollowingRead } from "./stream_action_following";

/** The backend's commands a project's Reload uses. */
export type ProjectReloadBackend = Pick<TatolabBackend, "reloadProject" | "describeStreamAction" | "cancelStreamAction">;

/** Where a project's last Reload has got to, or what it came to. */
export type ProjectReload =
  | { kind: "queuing" }
  | { kind: "refused"; words: string }
  | { kind: "following"; action: string; description: StreamActionDescription | null; cancel: FollowedStreamActionCancel | null }
  | { kind: "ended"; action: string; description: StreamActionDescription }
  | { kind: "no_longer_followed"; action: string; words: string };

/** Whether a reload is still being queued or followed. */
export function isProjectReloadUnderWay(reload: ProjectReload | null): boolean {
  return reload !== null && (reload.kind === "queuing" || reload.kind === "following");
}

/**
 * Each project's last Reload, held by the window rather than the project's page, so a reload is followed to its end
 * wherever the person goes; one following per project.
 */
export class ProjectReloadsOfTheWindow {
  private readonly reloadsByProjectDirectory = new Map<string, ProjectReload>();
  private readonly followingsByProjectDirectory = new Map<string, StreamActionFollowing>();
  private readonly reloadListeners = new Set<() => void>();

  constructor(private readonly backend: ProjectReloadBackend) {}

  /** `projectDirectory`'s last Reload; `null` when none was asked for, or it was put away. The same object until it changes. */
  readonly readReloadOf = (projectDirectory: string): ProjectReload | null => this.reloadsByProjectDirectory.get(projectDirectory) ?? null;

  /** Calls `reloadListener` after each change to any project's reload; the returned function stops it. */
  readonly subscribeToReloads = (reloadListener: () => void): (() => void) => {
    this.reloadListeners.add(reloadListener);
    return () => this.reloadListeners.delete(reloadListener);
  };

  /** Queue `run_project` on `projectDirectory` and follow it to its end; nothing while its last reload is still under way. */
  reload(projectDirectory: string): void {
    if (isProjectReloadUnderWay(this.readReloadOf(projectDirectory))) return;
    this.setReloadOf(projectDirectory, { kind: "queuing" });
    this.backend.reloadProject(projectDirectory).then(
      (queued) => {
        this.setReloadOf(projectDirectory, { kind: "following", action: queued.action, description: null, cancel: null });
        this.followingOf(projectDirectory).follow(queued.action);
      },
      (rejection: unknown) => this.setReloadOf(projectDirectory, { kind: "refused", words: describeBackendRejection(rejection) }),
    );
  }

  /** Cancel `projectDirectory`'s reload being followed: the runtime drops it from its queue or stops it at its step; the following reads it `cancelled`. */
  cancelTheReloadOf(projectDirectory: string): void {
    const reload = this.readReloadOf(projectDirectory);
    if (reload?.kind !== "following" || !canCancelTheFollowedAction(reload.cancel)) return;
    const { action } = reload;
    const setTheCancel = (event: Parameters<typeof followedActionCancelAfter>[0]): void => {
      const reloadNow = this.readReloadOf(projectDirectory);
      if (reloadNow?.kind === "following" && reloadNow.action === action) this.setReloadOf(projectDirectory, { ...reloadNow, cancel: followedActionCancelAfter(event) });
    };
    setTheCancel({ kind: "cancel_asked" });
    this.backend.cancelStreamAction(action).then(
      () => setTheCancel({ kind: "cancel_answered" }),
      (rejection: unknown) => setTheCancel({ kind: "cancel_refused", words: describeBackendRejection(rejection) }),
    );
  }

  /** Put away what `projectDirectory`'s last reload came to; a reload under way stays. */
  putAwayTheEndedReloadOf(projectDirectory: string): void {
    const reload = this.readReloadOf(projectDirectory);
    if (reload === null || isProjectReloadUnderWay(reload)) return;
    this.reloadsByProjectDirectory.delete(projectDirectory);
    this.notifyReloadListeners();
  }

  private followingOf(projectDirectory: string): StreamActionFollowing {
    const existingFollowing = this.followingsByProjectDirectory.get(projectDirectory);
    if (existingFollowing !== undefined) return existingFollowing;
    const following = new StreamActionFollowing(this.backend, (action, read) => this.takeTheRead(projectDirectory, action, read));
    this.followingsByProjectDirectory.set(projectDirectory, following);
    return following;
  }

  private takeTheRead(projectDirectory: string, action: string, read: StreamActionFollowingRead): void {
    const reload = this.readReloadOf(projectDirectory);
    if (reload?.kind !== "following" || reload.action !== action) return;
    if (read.kind === "no_longer_followed") {
      this.stopFollowing(projectDirectory);
      this.setReloadOf(projectDirectory, { kind: "no_longer_followed", action, words: read.words });
      return;
    }
    const { description } = read;
    if (!isStreamActionEnded(description)) {
      this.setReloadOf(projectDirectory, { ...reload, description });
      return;
    }
    this.stopFollowing(projectDirectory);
    this.setReloadOf(projectDirectory, { kind: "ended", action, description });
  }

  private stopFollowing(projectDirectory: string): void {
    this.followingsByProjectDirectory.get(projectDirectory)?.stop();
    this.followingsByProjectDirectory.delete(projectDirectory);
  }

  private setReloadOf(projectDirectory: string, reload: ProjectReload): void {
    this.reloadsByProjectDirectory.set(projectDirectory, reload);
    this.notifyReloadListeners();
  }

  private notifyReloadListeners(): void {
    for (const reloadListener of this.reloadListeners) reloadListener();
  }
}
