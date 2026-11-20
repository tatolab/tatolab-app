// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { ControlledInput } from "../pin_model/controlled_inputs";
import { createInputControlBinder, type InputControlBinder, type InputControlShown } from "../pin_services/input_control_binding";
import { createInputValues } from "../pin_services/input_values";
import type { GraphEditMode, StreamGraphInputValueRead, StreamInputValuesReading } from "../studio_readings";
import { InputControlBinderContext, InputControlMount, useOwnFieldOfTheInput } from "./input_control_mount";
import { NO_PROJECT } from "../node_ui/test_fixtures/node_ui_listing_fixtures";

const COUNT: ControlledInput = {
  address: { graph: { project_folder: "/projects/demo", stream_asset: "11111111-2222-3333-4444-555555555555", level: [] }, node_id: "LOOP-ID", input: "count", member: null },
  declaration: { input_name: "count", label: "count", pin_type: { type: "integer" }, annotations: {}, may_be_unset: false },
  rebuilds_its_node: false,
  driven_by: null,
};

/** A binder that shows what the test tells it, and counts each bind. */
function binderUnderTest() {
  const tellers: ((shown: InputControlShown) => void)[] = [];
  const binder: InputControlBinder = {
    bindInputControl: (_host, _input, _place, whenShown = () => undefined) => {
      tellers.push(whenShown);
      whenShown("pending");
      return { update: () => undefined, unbind: () => undefined };
    },
    bindOwnField: () => {
      throw new Error("the slot binds no own field");
    },
    bindNodeBody: () => {
      throw new Error("the slot binds no node body");
    },
  };
  const show = (shown: InputControlShown) =>
    act(() => {
      for (const tell of tellers) tell(shown);
    });
  return { binder, show, binds: () => tellers.length };
}

afterEach(cleanup);

function SlotOfTheCount({ binder, words }: { binder: InputControlBinder; words: string }) {
  return (
    <InputControlBinderContext value={binder}>
      <InputControlMount input={COUNT} surface="properties" readOnly={false} fallback={<span data-testid="field">{words}</span>} />
    </InputControlBinderContext>
  );
}

test("the slot draws its fallback while the control is pending, and draws a changed fallback again while the table has no control, binding once", () => {
  const { binder, show, binds } = binderUnderTest();
  const { rerender } = render(<SlotOfTheCount binder={binder} words="3" />);
  expect(screen.getByTestId("field").textContent).toBe("3");

  show("no_control");
  rerender(<SlotOfTheCount binder={binder} words="4" />);
  expect(screen.getByTestId("field").textContent).toBe("4");
  rerender(<SlotOfTheCount binder={binder} words="3" />);
  expect(screen.getByTestId("field").textContent).toBe("3");

  show("element");
  expect(screen.queryByTestId("field")).toBeNull();
  expect(binds()).toBe(1);
});

/** The host's values of the stream: the one node `LOOP-ID`, its `count` reading `count`. */
function valuesRead(count: StreamGraphInputValueRead): StreamInputValuesReading {
  return { kind: "values", stream_asset: COUNT.address.graph.stream_asset, values: [{ level: [], node_id: "LOOP-ID", input: "count", member: null, value_read: count }] };
}

function OwnFieldOfTheCount() {
  const ownField = useOwnFieldOfTheInput(COUNT.address, "commit");
  if (ownField === null) return <span data-testid="own-field">only shown</span>;
  return (
    <button type="button" data-testid="own-field" onClick={() => ownField.releaseTheValue({ every: 2 })}>
      {`${JSON.stringify(ownField.shown.value)} ${ownField.shown.comes_from}`}
    </button>
  );
}

function SlotOfTheCountWithItsOwnField({ binder }: { binder: InputControlBinder }) {
  return (
    <InputControlBinderContext value={binder}>
      <InputControlMount input={COUNT} surface="properties" readOnly={false} fallback={<span data-testid="words">3</span>} noControl={<input aria-label="Value of count" />} />
    </InputControlBinderContext>
  );
}

test("the slot draws its fallback while the control is pending and its own field only where the table has no control", () => {
  const { binder, show } = binderUnderTest();
  render(<SlotOfTheCountWithItsOwnField binder={binder} />);
  expect(screen.getByTestId("words").textContent).toBe("3");
  expect(screen.queryByRole("textbox", { name: "Value of count" })).toBeNull();

  show("no_control");
  expect(screen.queryByTestId("words")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Value of count" })).toBeDefined();

  show("element");
  expect(screen.queryByTestId("words")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Value of count" })).toBeNull();
});

test("a surface's own field shows the store's value as each reading changes it, and sends an edit as one commit", async () => {
  const sent: { value: unknown; mode: GraphEditMode }[] = [];
  const inputValues = createInputValues({
    transactInTheProject: (_projectFolder, operations, sending) => {
      for (const operation of operations) if (operation.operation === "set_node_input_value") sent.push({ value: operation.value ?? null, mode: sending.mode });
      return Promise.resolve({ kind: "applied", transaction: { mode: sending.mode, transaction: null, commit: null, operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] } });
    },
    newGestureIdempotencyKey: () => "gesture",
  });
  inputValues.takeTheInputValues(COUNT.address.graph.project_folder, valuesRead({ value: { every: 1 }, comes_from: "saved" }));
  const binder = createInputControlBinder({ watchNodeUiElements: () => () => undefined, inputValues, project: NO_PROJECT });
  render(
    <InputControlBinderContext value={binder}>
      <OwnFieldOfTheCount />
    </InputControlBinderContext>,
  );
  expect(screen.getByTestId("own-field").textContent).toBe('{"every":1} saved');

  act(() => inputValues.takeTheInputValues(COUNT.address.graph.project_folder, valuesRead({ value: null, comes_from: "default" })));
  expect(screen.getByTestId("own-field").textContent).toBe("null default");

  fireEvent.click(screen.getByTestId("own-field"));
  expect(screen.getByTestId("own-field").textContent).toBe('{"every":2} saved');
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
  expect(sent).toEqual([{ value: { every: 2 }, mode: "commit" }]);
});

test("a surface's own field with no binder is only shown", () => {
  render(<OwnFieldOfTheCount />);
  expect(screen.getByTestId("own-field").textContent).toBe("only shown");
});
