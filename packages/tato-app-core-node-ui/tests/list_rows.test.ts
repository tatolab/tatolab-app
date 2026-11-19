import type { BuiltInPinTypeName } from "@tatolab/tato-app-view-sdk/pin_types";
import type { ControlledPin, InputControlElement, InputControlElementClass, InputControlState, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import ListRows, { aNewElementOf } from "../node_ui/list_rows.ts";
import TextLine from "../node_ui/text_line.ts";
import { eventsFiredBy, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-list_rows-test", ListRows);
customElements.define("tato-studio-list_rows-text_line-test", TextLine);

/** A Studio whose table picks the String text line for each element, handed its pin as the Studio hands it; each pin asked for is kept. */
function studioOfTextLines(): { studio: NodeUiElementHost; pinsAskedFor: ControlledPin<BuiltInPinTypeName>[] } {
  const pinsAskedFor: ControlledPin<BuiltInPinTypeName>[] = [];
  const studio: NodeUiElementHost = {
    ...NO_STUDIO_CALLS,
    inputControlFor: (pin) => {
      pinsAskedFor.push(pin);
      const control = new TextLine();
      if (pin.declaration.pin_type.type !== "string") return Promise.reject(new Error("only Strings in this test"));
      control.pin = { ...pin, declaration: { ...pin.declaration, pin_type: pin.declaration.pin_type } };
      return Promise.resolve(control as InputControlElement<BuiltInPinTypeName>);
    },
  };
  return { studio, pinsAskedFor };
}

function mountedListRows(studio: NodeUiElementHost, list: string[], state: InputControlState = "editable"): ListRows {
  const control = new ListRows();
  const pin: ControlledPin<"list_of"> = {
    declaration: { input_name: "lines", label: "lines", pin_type: { type: "list_of", element_type: { type: "string" } }, annotations: {}, may_be_unset: false },
    surface: "properties",
    studio,
  };
  control.pin = pin;
  control.state = state;
  control.value = list;
  document.body.append(control);
  return control;
}

/** Each row's words, once every row's control is in place. */
async function wordsOfTheRows(control: ListRows, rowCount: number): Promise<string[]> {
  return vi.waitFor(() => {
    const fields = [...(control.shadowRoot?.querySelectorAll<TextLine>(".list-row-control > *") ?? [])].map((line) => partOf<HTMLInputElement>(line, "input"));
    if (fields.length !== rowCount) throw new Error(`${fields.length} of ${rowCount} rows drawn`);
    return fields.map((field) => field.value);
  });
}

function fieldOfRow(control: ListRows, index: number): HTMLInputElement {
  const line = control.shadowRoot?.querySelectorAll<TextLine>(".list-row-control > *")[index];
  if (line === undefined) throw new Error(`no row ${index}`);
  return partOf<HTMLInputElement>(line, "input");
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the List rows", () => {
  it("is the class the Studio defines for a List input", () => {
    expectTypeOf(ListRows).toExtend<InputControlElementClass<"list_of">>();
  });

  it("draws a row for each element with the control the Studio picks, each handed the List's pin typed as its element", async () => {
    const { studio, pinsAskedFor } = studioOfTextLines();
    const control = mountedListRows(studio, ["one", "two"]);
    expect(await wordsOfTheRows(control, 2)).toEqual(["one", "two"]);
    expect(pinsAskedFor.map(({ declaration }) => [declaration.label, declaration.pin_type])).toEqual([
      ["lines element", { type: "string" }],
      ["lines element", { type: "string" }],
    ]);
    expect(partOf(control, ".list-empty").hidden).toBe(true);
  });

  it("fires an element's input and change as the List's, each carrying the whole List", async () => {
    const control = mountedListRows(studioOfTextLines().studio, ["one", "two"]);
    await wordsOfTheRows(control, 2);
    const fired = eventsFiredBy(control);
    const field = fieldOfRow(control, 1);
    field.focus();
    field.value = "twos";
    field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    field.dispatchEvent(new Event("change"));
    expect(fired).toEqual([
      { name: "input", value: ["one", "twos"] },
      { name: "change", value: ["one", "twos"] },
    ]);
  });

  it("adds an element at its type's zero and removes one, each as one change carrying the whole List", async () => {
    const control = mountedListRows(studioOfTextLines().studio, ["one", "two"]);
    await wordsOfTheRows(control, 2);
    const fired = eventsFiredBy(control);
    partOf<HTMLButtonElement>(control, ".list-add").click();
    expect(await wordsOfTheRows(control, 3)).toEqual(["one", "two", ""]);
    partOf<HTMLButtonElement>(control, ".list-row-remove").click();
    expect(await wordsOfTheRows(control, 2)).toEqual(["two", ""]);
    expect(fired).toEqual([
      { name: "change", value: ["one", "two", ""] },
      { name: "change", value: ["two", ""] },
    ]);
    expect(partOf(control, ".list-row-remove").getAttribute("aria-label")).toBe("Remove lines 1");
  });

  it("says an empty List is empty, and neither adds nor removes while read only", async () => {
    const empty = mountedListRows(studioOfTextLines().studio, []);
    expect(partOf(empty, ".list-empty").hidden).toBe(false);
    empty.remove();
    const control = mountedListRows(studioOfTextLines().studio, ["one"], "read_only");
    await wordsOfTheRows(control, 1);
    const fired = eventsFiredBy(control);
    const add = partOf<HTMLButtonElement>(control, ".list-add");
    const remove = partOf<HTMLButtonElement>(control, ".list-row-remove");
    expect([add.disabled, remove.disabled]).toEqual([true, true]);
    add.click();
    remove.click();
    expect(fired).toEqual([]);
    expect(fieldOfRow(control, 0).readOnly).toBe(true);
  });

  it("shows the Studio's words in a row whose control it does not make", async () => {
    const studio: NodeUiElementHost = { ...NO_STUDIO_CALLS, inputControlFor: () => Promise.reject(new Error("The Studio has not listed its controls yet.")) };
    const control = mountedListRows(studio, ["one"]);
    await vi.waitFor(() => expect(partOf(control, ".list-row-words").textContent).toBe("The Studio has not listed its controls yet."));
  });

  it("adds each type's zero, held to the List's range, and nothing for a type with none", () => {
    expect(aNewElementOf({ type: "float" }, { range: { minimum: 0.5, maximum: 2 } })).toBe(0.5);
    expect(aNewElementOf({ type: "integer" }, { range: { minimum: 0.5, maximum: 4 } })).toBe(1);
    expect(aNewElementOf({ type: "menu", option_names: ["light", "bold"] }, {})).toBe("light");
    expect(aNewElementOf({ type: "vector", component_count: "two" }, {})).toEqual({ x: 0, y: 0 });
    expect(aNewElementOf({ type: "asset" }, {})).toBeUndefined();
  });
});
