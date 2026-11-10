// The open project's change feed for every view that watches it: read once from the backend when
// the first view watches, then each reading the main process sends as the runtime applies a
// transaction. A window follows, undoes and redoes only in its own open project.

import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { ProjectTransaction, ProjectTransactionApplying, ProjectTransactionAuthor, ProjectTransactionsReading, StopWatching } from "./studio_view_contract";

/** Why a view naming a folder other than the window's open project reads, undoes and redoes nothing there. */
export function onlyTheOpenProjectsFeedRefusal(projectFolder: string): string {
  return `Tato Studio follows the history of this window's project only, not ${projectFolder}.`;
}

/** The open project's change feed, and undo and redo on it. */
export class ProjectTransactionsReadings {
  private latestReading: ProjectTransactionsReading | null = null;
  private readonly listeners = new Set<(reading: ProjectTransactionsReading) => void>();
  private stopListeningToTheBackend: (() => void) | null = null;

  constructor(
    private readonly backend: Pick<TatolabBackend, "readOpenProjectTransactions" | "onProjectTransactionsChanged" | "undoInTheOpenProject" | "redoInTheOpenProject">,
    private readonly readTheOpenProjectFolder: () => string | null,
  ) {}

  /** `projectFolder`'s feed: the latest reading at once when there is one, then each new one; refused for a folder that is not the window's open project. */
  readonly watchProjectTransactions = (projectFolder: string, listener: (reading: ProjectTransactionsReading) => void): StopWatching => {
    const listenerOfTheFolder = (reading: ProjectTransactionsReading) =>
      listener(this.readTheOpenProjectFolder() === projectFolder ? reading : { kind: "not_read", because: onlyTheOpenProjectsFeedRefusal(projectFolder) });
    this.listeners.add(listenerOfTheFolder);
    this.listenToTheBackend();
    if (this.latestReading !== null) listenerOfTheFolder(this.latestReading);
    return () => {
      this.listeners.delete(listenerOfTheFolder);
      if (this.listeners.size > 0) return;
      this.stopListeningToTheBackend?.();
      this.stopListeningToTheBackend = null;
      this.latestReading = null;
    };
  };

  /** The runtime's `undo` by `author` on the open project. */
  readonly undoInTheProject = (projectFolder: string, author: ProjectTransactionAuthor): Promise<ProjectTransactionApplying> =>
    this.undoOrRedo(projectFolder, () => this.backend.undoInTheOpenProject(author));

  /** The runtime's `redo` by `author` on the open project. */
  readonly redoInTheProject = (projectFolder: string, author: ProjectTransactionAuthor): Promise<ProjectTransactionApplying> =>
    this.undoOrRedo(projectFolder, () => this.backend.redoInTheOpenProject(author));

  private async undoOrRedo(projectFolder: string, apply: () => Promise<ProjectTransaction>): Promise<ProjectTransactionApplying> {
    if (this.readTheOpenProjectFolder() !== projectFolder) return { kind: "not_applied", because: onlyTheOpenProjectsFeedRefusal(projectFolder) };
    return apply().then(
      (transaction) => ({ kind: "applied", transaction }),
      (rejection: unknown) => ({ kind: "not_applied", because: describeBackendRejection(rejection) }),
    );
  }

  private listenToTheBackend(): void {
    if (this.stopListeningToTheBackend !== null) return;
    this.stopListeningToTheBackend = this.backend.onProjectTransactionsChanged((reading) => this.publish(reading));
    this.backend.readOpenProjectTransactions().then(
      (reading) => {
        if (this.latestReading === null) this.publish(reading);
      },
      (rejection: unknown) => {
        if (this.latestReading === null) this.publish({ kind: "not_read", because: describeBackendRejection(rejection) });
      },
    );
  }

  private publish(reading: ProjectTransactionsReading): void {
    if (this.stopListeningToTheBackend === null) return;
    this.latestReading = reading;
    for (const listener of [...this.listeners]) listener(reading);
  }
}
