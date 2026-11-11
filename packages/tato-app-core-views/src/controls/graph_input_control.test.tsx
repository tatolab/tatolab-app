import type { TatoAppViewConnection, ViewAskDone } from "@tatolab/tato-app-view-sdk";
import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { GraphInputControl } from "./graph_input_control";
import type { GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const STREAM = "s06-perform-main-0df4a7";

const BRIGHTNESS: GraphInputOfTheStream = { node_id: "3fd9fe1a", port_name: "brightness", family: "channels", current_value: 0.5, range: { lowest: 0, highest: 1 }, control: "slider" };
const CUE: GraphInputOfTheStream = { node_id: "3067457b", port_name: "cue", family: "records", current_value: { scene: "intro" }, range: null, control: "json" };
const STROBE: GraphInputOfTheStream = { node_id: "5b1c0e2a", port_name: "strobe", family: "channels", current_value: false, range: null, control: "toggle" };

/** The control drawn over a Studio that answers each write at once with `answerOf(value)`, recording each write it is asked for. */
function drawTheControl(graphInput: GraphInputOfTheStream, answerOf: (value: JsonValue) => ViewAskDone = () => ({ kind: "done" })) {
  const writesAskedFor: { stream: string; input: string; value: JsonValue }[] = [];
  const connection: Pick<TatoAppViewConnection, "writeGraphInput"> = {
    writeGraphInput: async (stream, input, value) => {
      writesAskedFor.push({ stream, input, value });
      return answerOf(value);
    },
  };
  const controlHolder = document.createElement("ul");
  document.body.append(controlHolder);
  act(() => createRoot(controlHolder).render(<GraphInputControl connection={connection} stream={STREAM} graphInput={graphInput} />));
  const field = (selector: string): HTMLElement => controlHolder.querySelector<HTMLElement>(selector) ?? expect.unreachable(`the control drew no ${selector}`);
  const setTheFieldTo = (input: HTMLElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return {
    controlHolder,
    writesAskedFor,
    field,
    moveTheSliderTo: (value: number) => act(async () => setTheFieldTo(field('input[type="range"]'), String(value))),
    typeAndPressEnter: async (words: string) => {
      const input = field("input");
      await act(async () => {
        input.focus();
        setTheFieldTo(input, words);
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
    },
    refusalWords: () => controlHolder.querySelector("[data-graph-input-refusal]")?.textContent ?? null,
  };
}

test("moving a ranged Input's slider hands each value to the running stream by the Input's name, live", async () => {
  const control = drawTheControl(BRIGHTNESS);

  expect(control.field("label").textContent).toBe("brightness");
  await control.moveTheSliderTo(0.8);

  expect(control.writesAskedFor).toEqual([{ stream: STREAM, input: "brightness", value: 0.8 }]);
  expect(control.controlHolder.querySelector("[data-property-live-edit]")).not.toBeNull();
  expect(control.refusalWords()).toBeNull();
});

test("the runtime's refusal of a write shows under the control in its own words", async () => {
  const because = "write_graph_input failed: Runtime error: the project of the stream `s06-perform-main-0df4a7` in /tmp/tatolab-proof-projects/s06-perform is stopped, so no node of it runs to publish on `value`; `start_playback` plays it";
  const control = drawTheControl(BRIGHTNESS, () => ({ kind: "refused", because }));

  await control.moveTheSliderTo(0.3);

  expect(control.refusalWords()).toContain(because);
});

test("a record typed as JSON is handed to the stream on Enter, and words that are not JSON are refused there, writing nothing", async () => {
  const control = drawTheControl(CUE);

  expect(control.controlHolder.querySelector("input")?.value).toBe('{"scene":"intro"}');
  await control.typeAndPressEnter("{scene: finale}");
  expect(control.refusalWords()).toContain("“{scene: finale}” isn't JSON.");
  expect(control.writesAskedFor).toEqual([]);

  await control.typeAndPressEnter('{"scene": "finale"}');
  expect(control.writesAskedFor).toEqual([{ stream: STREAM, input: "cue", value: { scene: "finale" } }]);
  expect(control.refusalWords()).toBeNull();
});

test("a Channels bool is a switch, and switching it hands the stream the other bool", async () => {
  const control = drawTheControl(STROBE);

  await act(async () => control.field("[data-graph-input-toggle]").click());

  expect(control.writesAskedFor).toEqual([{ stream: STREAM, input: "strobe", value: true }]);
});
