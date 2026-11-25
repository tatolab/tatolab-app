import { expect, test } from "vitest";
import { onlyTheOpenProjectsFeedRefusal, ProjectTransactionsReadings } from "./project_transactions_readings";
import type { ProjectTransaction, ProjectTransactionsReading } from "./studio_view_contract";

const OPEN_PROJECT_FOLDER = "/home/sam/streams/pattern";

/** Readings over a backend that has undone nothing yet, recording each undo it is asked for; each transaction is answered once `transactionsAnswered` settles. */
function readingsOverAFakeBackend(openProject: string | null | (() => string | null), transactionsAnswered: Promise<void> = Promise.resolve()) {
  const readTheOpenProjectFolder = typeof openProject === "function" ? openProject : () => openProject;
  const undosAsked: string[] = [];
  const transactionsAnsweredBeforeEachUndo: number[] = [];
  let transactionsAnsweredSoFar = 0;
  const transactionsAsked: unknown[] = [];
  const checksAsked: unknown[] = [];
  const readings = new ProjectTransactionsReadings(
    {
      readOpenProjectTransactions: () => new Promise<ProjectTransactionsReading>(() => undefined),
      onProjectTransactionsChanged: () => () => undefined,
      undoInTheOpenProject: async (author) => {
        undosAsked.push(author.name);
        transactionsAnsweredBeforeEachUndo.push(transactionsAnsweredSoFar);
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
        await transactionsAnswered;
        // The runtime takes a few turns to answer, as a round trip does.
        for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
        transactionsAnsweredSoFar += 1;
        if (operations[0]?.operation === "remove_node") return Promise.reject(new Error("No runtime answers."));
        return { kind: "refused", refusal: { refusal_code: "refused", action: "transact", refused_operation_index: 0, refused_node: "n", refused_link: null, refused_input: null, refused_params_pointer: null, refused_file: null, suggested_call: null, runtime_words: "no node n" } };
      },
      checkLinkCandidatesInTheOpenProject: async (request) => {
        checksAsked.push(request);
        if (request.among === "node_type_ports") return Promise.reject(new Error("No runtime answers."));
        return { candidates: [{ end: { kind: "placed_port", node: "n", port: "video" }, check: { outcome: "connects" } }] };
      },
      readThePersonEditingInStudio: async () => (readTheOpenProjectFolder() === null ? Promise.reject(new Error("No project is open in this window.")) : { kind: "person", name: "sam" }),
    },
    readTheOpenProjectFolder,
  );
  return { readings, undosAsked, transactionsAsked, checksAsked, transactionsAnsweredBeforeEachUndo };
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

test("an undo asked while an edit is unanswered reaches the backend once that edit is answered, so it takes back the edit just made", async () => {
  let answerTheEdit = (): void => undefined;
  const { readings, undosAsked, transactionsAsked, transactionsAnsweredBeforeEachUndo } = readingsOverAFakeBackend(
    OPEN_PROJECT_FOLDER,
    new Promise<void>((resolve) => {
      answerTheEdit = resolve;
    }),
  );
  const edit = readings.transactInTheProject(OPEN_PROJECT_FOLDER, [{ operation: "rename_node", stream: "s", node: "n", name: "camera" }], "commit", "k1");
  const undo = readings.undoInTheProject(OPEN_PROJECT_FOLDER, { kind: "person", name: "Sam" });
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(undosAsked).toEqual([]);

  const editAfterTheUndo = readings.transactInTheProject(OPEN_PROJECT_FOLDER, [{ operation: "rename_node", stream: "s", node: "n", name: "screen" }], "commit", "k2");
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  expect(transactionsAsked).toHaveLength(1);

  answerTheEdit();
  await edit;
  expect((await undo).kind).toBe("applied");
  await editAfterTheUndo;
  expect(transactionsAnsweredBeforeEachUndo).toEqual([1]);
  expect(transactionsAsked).toHaveLength(2);
});

test("an undo asked while an edit waits on an earlier undo reaches the backend once that edit is answered", async () => {
  let answerTheEdits = (): void => undefined;
  const { readings, undosAsked, transactionsAsked, transactionsAnsweredBeforeEachUndo } = readingsOverAFakeBackend(
    OPEN_PROJECT_FOLDER,
    new Promise<void>((resolve) => {
      answerTheEdits = resolve;
    }),
  );
  const sam = { kind: "person", name: "Sam" } as const;
  const firstEdit = readings.transactInTheProject(OPEN_PROJECT_FOLDER, [{ operation: "rename_node", stream: "s", node: "n", name: "camera" }], "commit", "k1");
  const firstUndo = readings.undoInTheProject(OPEN_PROJECT_FOLDER, sam);
  const editBetween = readings.transactInTheProject(OPEN_PROJECT_FOLDER, [{ operation: "rename_node", stream: "s", node: "n", name: "screen" }], "commit", "k2");
  const secondUndo = readings.undoInTheProject(OPEN_PROJECT_FOLDER, sam);
  answerTheEdits();
  await Promise.all([firstEdit, firstUndo, editBetween, secondUndo]);
  expect(transactionsAsked).toHaveLength(2);
  expect(undosAsked).toEqual(["Sam", "Sam"]);
  expect(transactionsAnsweredBeforeEachUndo).toEqual([1, 2]);
});

test("an undo or redo that waited on an edit is not sent once the window has another project open", async () => {
  let openProjectFolder: string | null = OPEN_PROJECT_FOLDER;
  let answerTheEdit = (): void => undefined;
  const { readings, undosAsked } = readingsOverAFakeBackend(
    () => openProjectFolder,
    new Promise<void>((resolve) => {
      answerTheEdit = resolve;
    }),
  );
  const edit = readings.transactInTheProject(OPEN_PROJECT_FOLDER, [{ operation: "rename_node", stream: "s", node: "n", name: "camera" }], "commit", "k1");
  const undo = readings.undoInTheProject(OPEN_PROJECT_FOLDER, { kind: "person", name: "Sam" });
  const redo = readings.redoInTheProject(OPEN_PROJECT_FOLDER, { kind: "person", name: "Sam" });
  openProjectFolder = "/home/sam/streams/imports/lobby-wall";
  answerTheEdit();
  await edit;
  expect(await undo).toEqual({ kind: "not_applied", because: onlyTheOpenProjectsFeedRefusal(OPEN_PROJECT_FOLDER) });
  expect(await redo).toEqual({ kind: "not_applied", because: onlyTheOpenProjectsFeedRefusal(OPEN_PROJECT_FOLDER) });
  expect(undosAsked).toEqual([]);
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

test("link candidates are checked only for the window's open project, the runtime's answer unchanged and any rejection in its own words", async () => {
  const { readings, checksAsked } = readingsOverAFakeBackend(OPEN_PROJECT_FOLDER);
  const amongPlacedPorts = { stream: "s", from: { output: { node: "m", port: "video" } }, among: "placed_ports", include_refused: true } as const;
  const amongNodeTypePorts = { stream: "s", from: { output: { node: "m", port: "video" } }, among: "node_type_ports" } as const;

  expect(await readings.checkLinkCandidates("/home/sam/streams/imports/lobby-wall", amongPlacedPorts)).toEqual({ kind: "not_checked", because: onlyTheOpenProjectsFeedRefusal("/home/sam/streams/imports/lobby-wall") });
  expect(await readings.checkLinkCandidates(OPEN_PROJECT_FOLDER, amongPlacedPorts)).toEqual({ kind: "checked", result: { candidates: [{ end: { kind: "placed_port", node: "n", port: "video" }, check: { outcome: "connects" } }] } });
  expect(await readings.checkLinkCandidates(OPEN_PROJECT_FOLDER, amongNodeTypePorts)).toEqual({ kind: "not_checked", because: "No runtime answers." });
  expect(checksAsked).toEqual([amongPlacedPorts, amongNodeTypePorts]);
});

test("the person editing is read from the main process, or why it was not", async () => {
  expect(await readingsOverAFakeBackend(OPEN_PROJECT_FOLDER).readings.readThePersonEditing()).toEqual({ kind: "read", author: { kind: "person", name: "sam" } });
  expect(await readingsOverAFakeBackend(null).readings.readThePersonEditing()).toEqual({ kind: "not_read", because: "No project is open in this window." });
});
