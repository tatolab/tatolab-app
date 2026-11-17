// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { ControlledInput } from "../pin_model/controlled_inputs";
import type { InputControlBinder, InputControlShown } from "../pin_services/input_control_binding";
import { InputControlBinderContext, InputControlMount } from "./input_control_mount";

const COUNT: ControlledInput = {
  address: { graph: { project_folder: "/projects/demo", stream_asset: "11111111-2222-3333-4444-555555555555", level: [] }, node_id: "LOOP-ID", input: "count" },
  declaration: { input_name: "count", label: "count", pin_type: { type: "integer" }, annotations: {}, may_be_unset: false },
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
