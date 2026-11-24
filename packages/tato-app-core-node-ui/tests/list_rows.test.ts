import type { BuiltInPinTypeName, PinType } from "@tatolab/tato-app-view-sdk/pin_types";
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

/** A layer of a compositor: its `label` with no default, its `opacity` defaulting to 1. */
const LAYER: PinType = {
  type: "bundle",
  name: "Layer",
  members: [
    { name: "label", member_type: { type: "string" } },
    { name: "opacity", member_type: { type: "float" }, meaning: "opacity", default_value: 1 },
  ],
};

function mountedListRows(studio: NodeUiElementHost, list: unknown[], state: InputControlState = "editable", elementType: PinType = { type: "string" }): ListRows {
  const control = new ListRows();
  const label = elementType.type === "bundle" ? "layers" : "lines";
  const pin: ControlledPin<"list_of"> = {
    declaration: { input_name: label, label, pin_type: { type: "list_of", element_type: elementType }, annotations: {}, may_be_unset: false },
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
    const fields = [...(control.shadowRoot?.querySelectorAll<TextLine>(".list-row-control > :not(.list-row-words)") ?? [])].map((line) => partOf<HTMLInputElement>(line, "input"));
    if (fields.length !== rowCount) throw new Error(`${fields.length} of ${rowCount} rows drawn`);
    return fields.map((field) => field.value);
  });
}

function fieldOfRow(control: ListRows, index: number): HTMLInputElement {
  const line = control.shadowRoot?.querySelectorAll<TextLine>(".list-row-control > :not(.list-row-words)")[index];
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

  it("moves an element up and down, each as one change carrying the whole List, and not past either end", async () => {
    const control = mountedListRows(studioOfTextLines().studio, ["one", "two", "three"]);
    await wordsOfTheRows(control, 3);
    const fired = eventsFiredBy(control);
    const moveUps = (): HTMLButtonElement[] => [...(control.shadowRoot?.querySelectorAll<HTMLButtonElement>(".list-row-move-up") ?? [])];
    const moveDowns = (): HTMLButtonElement[] => [...(control.shadowRoot?.querySelectorAll<HTMLButtonElement>(".list-row-move-down") ?? [])];
    expect(moveUps().map((button) => button.disabled)).toEqual([true, false, false]);
    expect(moveDowns().map((button) => button.disabled)).toEqual([false, false, true]);
    moveUps()[2]?.click();
    expect(await wordsOfTheRows(control, 3)).toEqual(["one", "three", "two"]);
    moveDowns()[0]?.click();
    expect(await wordsOfTheRows(control, 3)).toEqual(["three", "one", "two"]);
    moveUps()[0]?.click();
    moveDowns()[2]?.click();
    expect(fired).toEqual([
      { name: "change", value: ["one", "three", "two"] },
      { name: "change", value: ["three", "one", "two"] },
    ]);
    expect(moveUps()[1]?.getAttribute("aria-label")).toBe("Move lines 2 up");
    const moved = fieldOfRow(control, 0);
    moved.focus();
    moved.value = "threes";
    moved.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    moved.dispatchEvent(new Event("change"));
    expect(fired.at(-1)).toEqual({ name: "change", value: ["threes", "one", "two"] });
  });

  it("neither moves an element while read only", async () => {
    const control = mountedListRows(studioOfTextLines().studio, ["one", "two"], "read_only");
    await wordsOfTheRows(control, 2);
    const buttons = [...(control.shadowRoot?.querySelectorAll<HTMLButtonElement>(".list-row-move-up, .list-row-move-down") ?? [])];
    expect(buttons.map((button) => button.disabled)).toEqual([true, true, true, true]);
  });

  it("draws a row of a List of bundles as a control for each member under the members' names, a member left out at its default", async () => {
    const { studio, pinsAskedFor } = studioOfTextLines();
    const control = mountedListRows(studio, [{ label: "back" }, { label: "front", opacity: 0.5 }], "editable", LAYER);
    expect(await wordsOfTheRows(control, 2)).toEqual(["back", "front"]);
    expect([...(control.shadowRoot?.querySelectorAll(".list-member-name") ?? [])].map((name) => name.textContent)).toEqual(["label", "opacity"]);
    expect(partOf(control, ".list-member-names").hidden).toBe(false);
    expect(pinsAskedFor.map(({ declaration }) => [declaration.label, declaration.pin_type, declaration.annotations])).toEqual([
      ["label", { type: "string" }, {}],
      ["opacity", { type: "float" }, { meaning: "opacity" }],
      ["label", { type: "string" }, {}],
      ["opacity", { type: "float" }, { meaning: "opacity" }],
    ]);
    await vi.waitFor(() =>
      expect([...(control.shadowRoot?.querySelectorAll(".list-row-words") ?? [])].map((words) => [words.textContent, words.getAttribute("title")])).toEqual([
        ["1", "only Strings in this test"],
        ["0.5", "only Strings in this test"],
      ]),
    );
  });

  it("fires a member's edit as the List's, carrying its element with that member set and the members it left out still left out", async () => {
    const control = mountedListRows(studioOfTextLines().studio, [{ label: "back" }, { label: "front", opacity: 0.5 }], "editable", LAYER);
    await wordsOfTheRows(control, 2);
    const fired = eventsFiredBy(control);
    const field = fieldOfRow(control, 0);
    field.focus();
    field.value = "backdrop";
    field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    field.dispatchEvent(new Event("change"));
    const list = [{ label: "backdrop" }, { label: "front", opacity: 0.5 }];
    expect(fired).toEqual([
      { name: "input", value: list },
      { name: "change", value: list },
    ]);
  });

  it("adds a bundle with each member that declares no default at its type's zero, and moves and removes its rows", async () => {
    const control = mountedListRows(studioOfTextLines().studio, [{ label: "back" }], "editable", LAYER);
    await wordsOfTheRows(control, 1);
    const fired = eventsFiredBy(control);
    partOf<HTMLButtonElement>(control, ".list-add").click();
    expect(await wordsOfTheRows(control, 2)).toEqual(["back", ""]);
    partOf<HTMLButtonElement>(control, ".list-row-move-down").click();
    expect(await wordsOfTheRows(control, 2)).toEqual(["", "back"]);
    partOf<HTMLButtonElement>(control, ".list-row-remove").click();
    expect(await wordsOfTheRows(control, 1)).toEqual(["back"]);
    expect(fired).toEqual([
      { name: "change", value: [{ label: "back" }, { label: "" }] },
      { name: "change", value: [{ label: "" }, { label: "back" }] },
      { name: "change", value: [{ label: "back" }] },
    ]);
  });

  it("adds `{}` for a bundle whose every member declares a default, and nothing for one whose member without a default has no zero", () => {
    expect(aNewElementOf({ type: "bundle", members: [{ name: "opacity", member_type: { type: "float" }, default_value: 1 }] }, {})).toEqual({});
    expect(aNewElementOf({ type: "bundle", members: [{ name: "picture", member_type: { type: "asset" } }] }, {})).toBeUndefined();
    const control = mountedListRows(NO_STUDIO_CALLS, [], "editable", { type: "bundle", members: [{ name: "picture", member_type: { type: "asset" } }] });
    expect(partOf(control, ".list-add").hidden).toBe(true);
  });

  it("shows no member names over a List of one small type", () => {
    const control = mountedListRows(studioOfTextLines().studio, ["one"]);
    expect(partOf(control, ".list-member-names").hidden).toBe(true);
  });
});
