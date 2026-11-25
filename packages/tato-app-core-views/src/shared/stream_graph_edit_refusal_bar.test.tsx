import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { GraphEditMode, JsonValue, ProjectActionRefusal, ProjectGraphTransactionApplying, StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { StreamGraphEditRefusalBar } from "./stream_graph_edit_refusal_bar";
import { useStreamGraphEditsSentToTheRuntime } from "./stream_graph_edit_sending";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const STREAM_ASSET = "8b0c2d4e-6f71-4a3b-9c5d-1e2f3a4b5c6d";
const STREAM_ID = "every-pin-kind-main-8c1d2e";
const SWEEP = "3e8b1c47-9d2a-4f60-b5e8-1a7c4d9f2e36";
const BEAT = "2f44fe9c-94cb-4bf0-af2c-b91345adc7c9";

const SWEEP_INTO_A_FLOAT: StreamGraphAction = { operation: "connect", stream: STREAM_ASSET, source: { node: SWEEP, port: "result" }, target: { node: BEAT, port: "beats_per_minute" } };

/** The operations of the `transact` streamlib suggests refusing that link, each with `alsoNamed`: its project's `SweepPosition` placed between the two ends, the stream named by its id. */
function placingTheSweepPosition(alsoNamed: { [key: string]: JsonValue } = {}): JsonValue[] {
  return [
    { operation: "add_node", stream: STREAM_ID, type: "nodes.sweep:SweepPosition", as: "conversion", ...alsoNamed },
    { operation: "connect", stream: STREAM_ID, source: { node: SWEEP, port: "result" }, target: { node: "conversion", port: "sweep" }, ...alsoNamed },
    { operation: "connect", stream: STREAM_ID, source: { node: "conversion", port: "result" }, target: { node: BEAT, port: "beats_per_minute" }, ...alsoNamed },
  ];
}

const RUNTIME_WORDS = "cannot link sweep.result to beat.beats_per_minute: a nodes.sweep:Sweep output does not connect to a Float input. To fix: place a `nodes.sweep:SweepPosition` node between them";

function aRefusalSuggesting(suggested: ProjectActionRefusal["suggested_call"]): ProjectGraphTransactionApplying {
  return {
    kind: "refused",
    refusal: {
      refusal_code: "link_needs_a_module_conversion",
      action: "transact",
      refused_operation_index: 0,
      refused_node: null,
      refused_link: { source: { node: SWEEP, port: "result" }, target: { node: BEAT, port: "beats_per_minute" } },
      refused_input: null,
      refused_params_pointer: null,
      refused_file: null,
      suggested_call: suggested,
      runtime_words: RUNTIME_WORDS,
    },
  };
}

const APPLIED: ProjectGraphTransactionApplying = {
  kind: "applied",
  transaction: { mode: "commit", transaction: "t1", commit: "c1", operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] },
};

interface TransactionStudioWasAsked {
  operations: readonly StreamGraphAction[];
  mode: GraphEditMode;
  idempotencyKey: string | null;
}

/** A graph's view drawing the refusal bar of its latest edit beside a canvas it edits, against a Studio answering each transaction with the next of `answers`, each one awaited first. */
function drawTheBarAgainstAStudioAnswering(answers: (ProjectGraphTransactionApplying | Promise<ProjectGraphTransactionApplying>)[]) {
  const asked: TransactionStudioWasAsked[] = [];
  const connection: Pick<TatoAppViewConnection, "transactInTheProject"> = {
    transactInTheProject: async (_projectFolder, operations, sending) => {
      asked.push({ operations, mode: sending.mode, idempotencyKey: sending.idempotencyKey });
      return (await answers.shift()) ?? APPLIED;
    },
  };
  const drawn: { sendTheGesture: (operations: readonly StreamGraphAction[], level?: readonly string[]) => Promise<unknown> } = { sendTheGesture: () => Promise.resolve() };
  function GraphViewStandIn() {
    const { sendTheGesture, sendTheSuggestedEdit, refusalOfTheLatestEdit } = useStreamGraphEditsSentToTheRuntime(connection, "/projects/every-pin-kind");
    drawn.sendTheGesture = sendTheGesture;
    return (
      <>
        <StreamGraphEditRefusalBar refusal={refusalOfTheLatestEdit} sendTheSuggestedEdit={sendTheSuggestedEdit} />
        <div tabIndex={0} data-node-graph-editable="true" />
      </>
    );
  }
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  act(() => createRoot(container).render(<GraphViewStandIn />));
  const theFixButton = () => container.querySelector<HTMLButtonElement>("[data-suggested-graph-edit='take']");
  return {
    asked,
    container,
    theCanvas: () => container.querySelector<HTMLElement>("[data-node-graph-editable]"),
    theFixButton,
    send: (operations: readonly StreamGraphAction[], level?: readonly string[]) => act(async () => void (await drawn.sendTheGesture(operations, level))),
    takeTheFix: () => act(async () => theFixButton()?.click()),
  };
}

test("a refused link whose refusal suggests placing a conversion offers it beside the runtime's words, and taking it sends that transact as given, as one commit", async () => {
  const bar = drawTheBarAgainstAStudioAnswering([aRefusalSuggesting({ operation: "transact", params: { operations: placingTheSweepPosition() } })]);
  await bar.send([SWEEP_INTO_A_FLOAT]);
  expect(bar.container.textContent).toContain(RUNTIME_WORDS);
  expect(bar.theFixButton()?.textContent).toBe("Apply the fix");

  await bar.takeTheFix();
  expect(bar.asked).toHaveLength(2);
  expect(bar.asked[1]).toEqual({ operations: placingTheSweepPosition(), mode: "commit", idempotencyKey: expect.any(String) });
  expect(bar.container.textContent).toBe("");
});

test("a suggested edit inside a placed stream is sent with the level the runtime named, and no level of the view's is added", async () => {
  const atTheLevel = placingTheSweepPosition({ level: ["a1b2c3d4-0000-4000-8000-000000000001"] });
  const bar = drawTheBarAgainstAStudioAnswering([aRefusalSuggesting({ operation: "transact", params: { operations: atTheLevel } })]);
  await bar.send([SWEEP_INTO_A_FLOAT], ["a1b2c3d4-0000-4000-8000-000000000001"]);
  await bar.takeTheFix();
  expect(bar.asked[1]?.operations).toEqual(atTheLevel);
});

test("a suggested edit Studio did not send stays offered beside why, and taken again is sent under the same key, so the runtime applies it once", async () => {
  const suggesting = aRefusalSuggesting({ operation: "transact", params: { operations: placingTheSweepPosition() } });
  const bar = drawTheBarAgainstAStudioAnswering([suggesting, { kind: "not_sent", because: "The runtime didn't answer." }]);
  await bar.send([SWEEP_INTO_A_FLOAT]);
  await bar.takeTheFix();
  expect(bar.container.textContent).toContain("The runtime didn't answer.");
  expect(bar.theFixButton()?.textContent).toBe("Apply the fix");

  await bar.takeTheFix();
  expect(bar.asked).toHaveLength(3);
  expect(bar.asked[2]).toEqual(bar.asked[1]);
  expect(bar.container.textContent).toBe("");
});

test("while the fix is being applied its action waits, saying so, and pressing it again sends nothing more", async () => {
  let answer: (applying: ProjectGraphTransactionApplying) => void = () => undefined;
  const theAnswer = new Promise<ProjectGraphTransactionApplying>((resolve) => (answer = resolve));
  const bar = drawTheBarAgainstAStudioAnswering([aRefusalSuggesting({ operation: "transact", params: { operations: placingTheSweepPosition() } }), theAnswer]);
  await bar.send([SWEEP_INTO_A_FLOAT]);
  await bar.takeTheFix();
  expect(bar.theFixButton()?.getAttribute("aria-disabled")).toBe("true");
  expect(bar.theFixButton()?.getAttribute("aria-label")).toContain("Applying the fix…");
  await bar.takeTheFix();
  expect(bar.asked).toHaveLength(2);

  await act(async () => answer(APPLIED));
  expect(bar.container.textContent).toBe("");
});

test("once the fix applies, the focus goes back to the canvas the person was editing", async () => {
  const bar = drawTheBarAgainstAStudioAnswering([aRefusalSuggesting({ operation: "transact", params: { operations: placingTheSweepPosition() } })]);
  await bar.send([SWEEP_INTO_A_FLOAT]);
  bar.theFixButton()?.focus();
  await bar.takeTheFix();
  expect(document.activeElement).toBe(bar.theCanvas());
});

test("a refusal suggesting a read, or nothing, shows the runtime's words alone", async () => {
  const bar = drawTheBarAgainstAStudioAnswering([aRefusalSuggesting({ operation: "describe_operations", params: { operations: ["transact"] } }), aRefusalSuggesting(null)]);
  await bar.send([SWEEP_INTO_A_FLOAT]);
  expect(bar.container.textContent).toContain(RUNTIME_WORDS);
  expect(bar.theFixButton()).toBeNull();
  await bar.send([SWEEP_INTO_A_FLOAT]);
  expect(bar.container.textContent).toContain(RUNTIME_WORDS);
  expect(bar.theFixButton()).toBeNull();
});
