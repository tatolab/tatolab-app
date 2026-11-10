import { expect, test } from "vitest";
import { onlyTheOpenProjectsFeedRefusal, ProjectTransactionsReadings } from "./project_transactions_readings";
import type { ProjectTransaction, ProjectTransactionsReading } from "./studio_view_contract";

const OPEN_PROJECT_FOLDER = "/home/sam/streams/pattern";

/** Readings over a backend that has undone nothing yet, recording each undo it is asked for. */
function readingsOverAFakeBackend(openProjectFolder: string | null) {
  const undosAsked: string[] = [];
  const transactionsAsked: unknown[] = [];
  const readings = new ProjectTransactionsReadings(
    {
      readOpenProjectTransactions: () => new Promise<ProjectTransactionsReading>(() => undefined),
      onProjectTransactionsChanged: () => () => undefined,
      undoInTheOpenProject: async (author) => {
        undosAsked.push(author.name);
        const undone: ProjectTransaction = {
          format_version: 2,
          transaction: "t2",
          commit: "c2",
          parent_commit: "c1",
          author_kind: author.kind,
          author_name: author.name,
          operations: [],
          inverse_operations: [],
          undoes: "t1",
          redoes: null,
          idempotency_key: null,
          undo_state: null,
          applied_at: "2026-11-10T18:17:12Z",
        };
        return undone;
      },
      redoInTheOpenProject: async () => Promise.reject(new Error("redo failed: Sam has undone nothing that is left to redo")),
      transactInTheOpenProject: async (operations, mode, idempotencyKey) => {
        transactionsAsked.push({ operations, mode, idempotencyKey });
        if (operations[0]?.operation === "remove_node") return Promise.reject(new Error("No runtime answers."));
        return { kind: "refused", refusal: { action: "transact", refused_operation_index: 0, refused_node: "n", refused_link: null, refused_field: null, runtime_words: "no node n" } };
      },
    },
    () => openProjectFolder,
  );
  return { readings, undosAsked, transactionsAsked };
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

test("a graph transaction reaches the backend only for the window's open project, its structured refusal kept whole and any other in its own words", async () => {
  const { readings, transactionsAsked } = readingsOverAFakeBackend(OPEN_PROJECT_FOLDER);
  const rename = { operation: "rename_node", stream: "s", node: "n", name: "camera" } as const;

  expect(await readings.transactInTheProject("/home/sam/streams/imports/lobby-wall", [rename], "commit", "k1")).toEqual({ kind: "not_sent", because: onlyTheOpenProjectsFeedRefusal("/home/sam/streams/imports/lobby-wall") });
  expect(await readings.transactInTheProject(OPEN_PROJECT_FOLDER, [rename], "commit", "k1")).toMatchObject({ kind: "refused", refusal: { refused_node: "n", runtime_words: "no node n" } });
  expect(await readings.transactInTheProject(OPEN_PROJECT_FOLDER, [{ operation: "remove_node", stream: "s", node: "n" }], "live", null)).toEqual({ kind: "not_sent", because: "No runtime answers." });
  expect(transactionsAsked).toEqual([
    { operations: [rename], mode: "commit", idempotencyKey: "k1" },
    { operations: [{ operation: "remove_node", stream: "s", node: "n" }], mode: "live", idempotencyKey: null },
  ]);
});
