import { expect, test } from "vitest";
import { onlyTheOpenProjectsFeedRefusal, ProjectTransactionsReadings } from "./project_transactions_readings";
import type { ProjectTransaction, ProjectTransactionsReading } from "./studio_view_contract";

const OPEN_PROJECT_FOLDER = "/home/sam/streams/pattern";

/** Readings over a backend that has undone nothing yet, recording each undo it is asked for. */
function readingsOverAFakeBackend(openProjectFolder: string | null) {
  const undosAsked: string[] = [];
  const readings = new ProjectTransactionsReadings(
    {
      readOpenProjectTransactions: () => new Promise<ProjectTransactionsReading>(() => undefined),
      onProjectTransactionsChanged: () => () => undefined,
      undoInTheOpenProject: async (author) => {
        undosAsked.push(author.name);
        const undone: ProjectTransaction = {
          transaction: "t2",
          commit: "c2",
          parent_commit: "c1",
          author_kind: author.kind,
          author_name: author.name,
          operations: [],
          inverse_operations: [],
          undoes: "t1",
          redoes: null,
          applied_at: null,
        };
        return undone;
      },
      redoInTheOpenProject: async () => Promise.reject(new Error("redo failed: Sam has undone nothing that is left to redo")),
    },
    () => openProjectFolder,
  );
  return { readings, undosAsked };
}

test("undo and redo reach the backend only for the window's open project, before any feed is read, and a refusal comes back in its own words", async () => {
  const { readings, undosAsked } = readingsOverAFakeBackend(OPEN_PROJECT_FOLDER);
  const sam = { kind: "person", name: "Sam" } as const;

  expect(await readings.undoInTheProject("/home/sam/streams/imports/lobby-wall", sam)).toEqual({ kind: "not_applied", because: onlyTheOpenProjectsFeedRefusal("/home/sam/streams/imports/lobby-wall") });
  expect((await readings.undoInTheProject(OPEN_PROJECT_FOLDER, sam)).kind).toBe("applied");
  expect(await readings.redoInTheProject(OPEN_PROJECT_FOLDER, sam)).toEqual({ kind: "not_applied", because: "redo failed: Sam has undone nothing that is left to redo" });
  expect(undosAsked).toEqual(["Sam"]);

  const noProjectOpen = readingsOverAFakeBackend(null);
  expect((await noProjectOpen.readings.undoInTheProject(OPEN_PROJECT_FOLDER, sam)).kind).toBe("not_applied");
  expect(noProjectOpen.undosAsked).toEqual([]);
});
