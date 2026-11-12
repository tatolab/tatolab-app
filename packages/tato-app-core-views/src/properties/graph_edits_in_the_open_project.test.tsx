import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { GraphEditMode, ProjectGraphTransactionApplying, StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { useGraphEditsInTheOpenProject, type GraphEditsInTheOpenProject, type GraphEditsOfTheNode } from "./graph_edits_in_the_open_project";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

interface TransactionStudioWasAsked {
  operations: readonly StreamGraphAction[];
  mode: GraphEditMode;
  idempotencyKey: string | null;
  answer: (applying: ProjectGraphTransactionApplying) => Promise<void>;
}

function aStudioThatAnswersEachTransactionLater() {
  const asked: TransactionStudioWasAsked[] = [];
  const connection: Pick<TatoAppViewConnection, "transactInTheProject"> = {
    transactInTheProject: (_projectFolder, operations, sending) =>
      new Promise((resolve) => {
        asked.push({ operations, mode: sending.mode, idempotencyKey: sending.idempotencyKey, answer: (applying) => act(async () => resolve(applying)) });
      }),
  };
  function theTransactionAsked(position: number): TransactionStudioWasAsked {
    const transaction = asked[position];
    if (transaction === undefined) throw new Error(`Studio was asked ${asked.length} transactions, not ${position + 1}.`);
    return transaction;
  }
  return { connection, asked, theTransactionAsked };
}

function drawTheGraphEdits(connection: Pick<TatoAppViewConnection, "transactInTheProject">, projectFolder: string | null) {
  const drawn: { edits: GraphEditsInTheOpenProject | null } = { edits: null };
  function GraphEditsReader() {
    drawn.edits = useGraphEditsInTheOpenProject(connection, projectFolder);
    return null;
  }
  act(() => createRoot(document.createElement("div")).render(<GraphEditsReader />));
  return {
    get edits(): GraphEditsOfTheNode {
      return this.editsOfTheNode("node-id");
    },
    editsOfTheNode(nodeId: string, level: readonly string[] = []): GraphEditsOfTheNode {
      if (drawn.edits === null) throw new Error("The graph edits were not drawn.");
      return drawn.edits.ofTheNode(nodeId, level);
    },
  };
}

function settingFps(fps: number): StreamGraphAction[] {
  return [{ operation: "set_node_config", stream: "stream-asset", node: "node-id", config: { fps } }];
}

function anApplied(mode: GraphEditMode): ProjectGraphTransactionApplying {
  return {
    kind: "applied",
    transaction: { mode, transaction: mode === "commit" ? "transaction-id" : null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] },
  };
}

function aRefusalInTheRuntimesWords(runtimeWords: string): ProjectGraphTransactionApplying {
  return { kind: "refused", refusal: { action: "transact", refused_operation_index: 0, refused_node: "node-id", refused_link: null, refused_field: "fps", runtime_words: runtimeWords } };
}

async function letTheQueuedSendsRun() {
  await act(async () => undefined);
}

test("a drag's live edits wait for the one before, the newest replacing those not sent, and its commit drops a live edit still waiting", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");

  act(() => drawn.edits.sendLive("config:fps", settingFps(31), "drag-key"));
  await letTheQueuedSendsRun();
  act(() => drawn.edits.sendLive("config:fps", settingFps(32), "drag-key"));
  act(() => drawn.edits.sendLive("config:fps", settingFps(33), "drag-key"));
  await letTheQueuedSendsRun();
  expect(studio.asked.map((transaction) => transaction.operations)).toEqual([settingFps(31)]);

  await studio.theTransactionAsked(0).answer(anApplied("live"));
  await letTheQueuedSendsRun();
  expect(studio.asked.map((transaction) => transaction.operations)).toEqual([settingFps(31), settingFps(33)]);

  act(() => drawn.edits.sendLive("config:fps", settingFps(34), "drag-key"));
  let committing: Promise<boolean> = Promise.resolve(false);
  act(() => {
    committing = drawn.edits.commit("config:fps", settingFps(35), "drag-key");
  });
  await studio.theTransactionAsked(1).answer(anApplied("live"));
  await letTheQueuedSendsRun();
  expect(studio.asked.map((transaction) => [transaction.mode, transaction.operations])).toEqual([
    ["live", settingFps(31)],
    ["live", settingFps(33)],
    ["commit", settingFps(35)],
  ]);
  expect(new Set(studio.asked.map((transaction) => transaction.idempotencyKey))).toEqual(new Set(["drag-key"]));

  await studio.theTransactionAsked(2).answer(anApplied("commit"));
  expect(await committing).toBe(true);
});

test("a refusal is kept under its place in the runtime's words, and the next commit there that applies clears it", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");

  act(() => void drawn.edits.commit("config:fps", settingFps(-1)));
  await letTheQueuedSendsRun();
  await studio.theTransactionAsked(0).answer(aRefusalInTheRuntimesWords("fps must be at least 1."));
  expect(drawn.edits.refusalsByPlace.get("config:fps")).toBe("fps must be at least 1.");
  expect(drawn.edits.refusalsByPlace.get("name")).toBeUndefined();

  act(() => void drawn.edits.commit("config:fps", settingFps(24)));
  await letTheQueuedSendsRun();
  await studio.theTransactionAsked(1).answer(anApplied("commit"));
  expect(drawn.edits.refusalsByPlace.has("config:fps")).toBe(false);
});

test("a commit on the node that applies clears every refusal kept for it, as each told of an ask since overtaken", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");
  act(() => drawn.edits.keepTheRefusal("config:width", "fast is not a number."));
  expect(drawn.edits.refusalsByPlace.get("config:width")).toBe("fast is not a number.");

  act(() => void drawn.edits.commit("name", [{ operation: "rename_node", stream: "stream-asset", node: "node-id", name: "Bars" }]));
  await letTheQueuedSendsRun();
  await studio.theTransactionAsked(0).answer(anApplied("commit"));
  expect(drawn.edits.refusalsByPlace.size).toBe(0);
});

test("edits are sent one after another, a later commit waiting for the earlier to be answered", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");

  act(() => void drawn.edits.commit("name", [{ operation: "rename_node", stream: "stream-asset", node: "node-id", name: "Bars" }]));
  act(() => void drawn.edits.commit("config:fps", settingFps(24)));
  await letTheQueuedSendsRun();
  expect(studio.asked).toHaveLength(1);
  expect(studio.theTransactionAsked(0).idempotencyKey).not.toBe("");

  await studio.theTransactionAsked(0).answer(aRefusalInTheRuntimesWords("A node named Bars is already in the stream."));
  await letTheQueuedSendsRun();
  expect(studio.asked).toHaveLength(2);
  expect(studio.theTransactionAsked(1).idempotencyKey).not.toBe(studio.theTransactionAsked(0).idempotencyKey);
});

test("with no project open nothing is sent, and the place says why", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, null);

  let committing: Promise<boolean> = Promise.resolve(true);
  act(() => {
    committing = drawn.edits.commit("config:fps", settingFps(24));
  });
  expect(await act(async () => committing)).toBe(false);
  expect(studio.asked).toHaveLength(0);
  expect(drawn.edits.refusalsByPlace.get("config:fps")).toBe("No project is open, so nothing can be edited.");
});

test("a node's refusals stay with it, so another node's panel shows none of them", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");

  act(() => void drawn.editsOfTheNode("node-id").commit("config:fps", settingFps(-1)));
  await letTheQueuedSendsRun();
  await studio.theTransactionAsked(0).answer(aRefusalInTheRuntimesWords("fps must be at least 1."));

  expect(drawn.editsOfTheNode("node-id").refusalsByPlace.get("config:fps")).toBe("fps must be at least 1.");
  expect(drawn.editsOfTheNode("another-node-id").refusalsByPlace.size).toBe(0);
});

test("a second config edit made before the reading shows the first starts from the config the first sent, and from the reading once it changes", () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");
  const configTheReadingShows = { width: 1280, fps: 30 };

  drawn.edits.rememberTheConfigSent(configTheReadingShows, { width: 1280, fps: 24 });
  expect(drawn.edits.configToEditFrom({ width: 1280, fps: 30 })).toEqual({ width: 1280, fps: 24 });
  expect(drawn.editsOfTheNode("another-node-id").configToEditFrom(configTheReadingShows)).toBe(configTheReadingShows);

  const configTheReadingShowsNext = { width: 1280, fps: 24 };
  expect(drawn.edits.configToEditFrom(configTheReadingShowsNext)).toBe(configTheReadingShowsNext);
});

test("a refused config edit stops later edits starting from the config it sent", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const drawn = drawTheGraphEdits(studio.connection, "/projects/hallways");
  const configTheReadingShows = { fps: 30 };

  drawn.edits.rememberTheConfigSent(configTheReadingShows, { fps: -1 });
  act(() => void drawn.edits.commit("config:fps", settingFps(-1)));
  await letTheQueuedSendsRun();
  await studio.theTransactionAsked(0).answer(aRefusalInTheRuntimesWords("fps must be at least 1."));

  expect(drawn.edits.configToEditFrom(configTheReadingShows)).toBe(configTheReadingShows);
});

test("a node's edits at a level inside a subgraph carry that level, a drag's live edits are not sent, and its commit is", async () => {
  const studio = aStudioThatAnswersEachTransactionLater();
  const graphEdits = drawTheGraphEdits(studio.connection, "/projects/pattern");
  const editsInside = () => graphEdits.editsOfTheNode("node-id", ["subgraph-id"]);

  editsInside().sendLive("config:fps", settingFps(24), "drag");
  await letTheQueuedSendsRun();
  expect(studio.asked).toEqual([]);
  void editsInside().commit("config:fps", settingFps(30), "drag");
  await letTheQueuedSendsRun();
  expect(studio.asked.map((transaction) => [transaction.mode, transaction.operations])).toEqual([["commit", [{ ...settingFps(30)[0], level: ["subgraph-id"] }]]]);
  await studio.theTransactionAsked(0).answer(anApplied("commit"));

  const notedInside = await editsInside().commit("name", [{ operation: "add_note", stream: "stream-asset", text: "Note", position: [0, 0], size: [10, 10] }]);
  expect(notedInside).toBe(false);
  await letTheQueuedSendsRun();
  expect(studio.asked).toHaveLength(1);
  expect(editsInside().refusalsByPlace.get("name")).toBe("The runtime keeps a note only on the stream's own level, not inside a subgraph.");
});
