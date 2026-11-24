// The default control of a List input: a row for each element, each with buttons that move it up,
// move it down and remove it, and a button under the rows that adds an element. A row of a List of
// one small type holds the control the Studio's table picks for the element's type; a row of a List
// of bundles holds one control for each member, side by side under the members' names. Each control
// is asked for through `pin.studio.inputControlFor`. The control's value is the whole List: a row
// control's `input` is the List's `input`, its `change` the List's `change`, so each edit is one
// undo step, and so is each add, remove and move; a row control's `cancel` is the List's. An
// element's control is handed the List's pin typed as its element, with the List's annotations, so
// an annotation that names a control names the element's; a member's is handed it typed as the
// member, named by it, with its meaning. A member a stored bundle leaves out shows at its default.
// A control the Studio does not make shows the Studio's words in its place, or for a member, its
// value in words.
// An element is added at its type's zero, held to the List's range, and a bundle with each member
// that declares no default at its type's zero; a type with no zero, as an Asset, is not added here.

import {
  fireInputControlCancel,
  fireInputControlEvent,
  isTheCancelOfAnInputControl,
  valueTheInputControlEventCarries,
  wordsForTheStoredValue,
  type ControlledPin,
  type InputControlElement,
  type InputControlState,
} from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { BuiltInPinTypeName, BundleMember, PinAnnotations, PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import { isAJsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A control in a row, of the List's element type or of one member's type. */
type RowControl = InputControlElement<BuiltInPinTypeName>;

/** Whether `value`, read from the List the host set, is a value a control of its type is handed: the host reads each element in its type's form, so it is one unless it is no JSON at all. */
function isAControlValue(value: unknown): value is RowControl["value"] {
  return isAJsonValue(value) || typeof value === "bigint";
}

/** What a row holds a control for: the whole element, or one member of a bundle. */
interface RowPart {
  /** The pin the part's control is handed. */
  readonly pin: ControlledPin<BuiltInPinTypeName>;
  /** The part's value in `element`. */
  readonly valueIn: (element: unknown) => unknown;
  /** `element` with the part set to `value`. */
  readonly elementWith: (element: unknown, value: unknown) => unknown;
  /** Whether the Studio's refusal of the part's control is shown as the part's value in words, else as the Studio's words. */
  readonly refusalShowsTheValue: boolean;
}

/** One part of one row: where its control goes, and the control once the Studio has made it, or the words shown in its place. */
interface RowCell {
  readonly part: RowPart;
  readonly slot: HTMLDivElement;
  control: RowControl | null;
  words: HTMLSpanElement | null;
}

/** One row: its cells, its buttons. */
interface ListRow {
  readonly row: HTMLDivElement;
  readonly cells: readonly RowCell[];
  readonly move_up: HTMLButtonElement;
  readonly move_down: HTMLButtonElement;
  readonly remove: HTMLButtonElement;
}

/** The 4 by 4 identity, row by row. */
const IDENTITY_TRANSFORM = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** `number` held inside the range `annotations` state. */
function heldToTheRange(number: number, annotations: PinAnnotations): number {
  const minimum = annotations.range?.minimum ?? Number.NEGATIVE_INFINITY;
  const maximum = annotations.range?.maximum ?? Number.POSITIVE_INFINITY;
  return Math.min(maximum, Math.max(minimum, number));
}

/** A bundle with each member that declares no default at its type's zero, leaving out each member that declares one; `undefined` when such a member's type has no zero. */
function aNewBundleOf(members: readonly BundleMember[]): Record<string, unknown> | undefined {
  const bundle: Record<string, unknown> = {};
  for (const member of members) {
    if (member.default_value !== undefined) continue;
    const zero = aNewElementOf(member.member_type, {});
    if (zero === undefined) return undefined;
    bundle[member.name] = zero;
  }
  return bundle;
}

/** The element a List of `elementType` adds: the type's zero, held to `annotations`' range; `undefined` for a type with none. */
export function aNewElementOf(elementType: PinType, annotations: PinAnnotations): unknown {
  switch (elementType.type) {
    case "float":
      return heldToTheRange(0, annotations);
    case "integer":
      return Math.ceil(heldToTheRange(0, annotations));
    case "boolean":
      return false;
    case "string":
      return "";
    case "menu":
      return elementType.option_names[0];
    case "color":
      return { red: 0, green: 0, blue: 0, alpha: 1 };
    case "vector":
      return { two: { x: 0, y: 0 }, three: { x: 0, y: 0, z: 0 }, four: { x: 0, y: 0, z: 0, w: 0 } }[elementType.component_count];
    case "rectangle":
      return { x: 0, y: 0, width: 0, height: 0 };
    case "transform":
      return [...IDENTITY_TRANSFORM];
    case "bundle":
      return aNewBundleOf(elementType.members);
    default:
      return undefined;
  }
}

/** `element`'s members, keyed by name, or none where it is not an object. */
function membersOf(element: unknown): Readonly<Record<string, unknown>> {
  return typeof element === "object" && element !== null && !Array.isArray(element) ? Object.fromEntries(Object.entries(element)) : {};
}

/** The part of a row that is `member` of a List's bundle element: its pin, named by the member and typed as it, and how it reads and sets the member, a member left out reading its default. */
function partOfTheMember(listPin: ControlledPin<"list_of">, member: BundleMember): RowPart {
  const { declaration } = listPin;
  return {
    pin: {
      ...listPin,
      declaration: { ...declaration, label: member.name, pin_type: member.member_type, annotations: member.meaning == null ? {} : { meaning: member.meaning } },
    },
    valueIn: (element) => membersOf(element)[member.name] ?? member.default_value,
    elementWith: (element, value) => ({ ...membersOf(element), [member.name]: value }),
    refusalShowsTheValue: true,
  };
}

/** The parts of each row of a List with the pin `listPin`: one for each member of a bundle element, else one for the whole element. */
function partsOfEachRow(listPin: ControlledPin<"list_of">): RowPart[] {
  const { declaration } = listPin;
  const elementType = declaration.pin_type.element_type;
  if (elementType.type === "bundle") return elementType.members.map((member) => partOfTheMember(listPin, member));
  return [
    {
      pin: { ...listPin, declaration: { ...declaration, label: `${declaration.label} element`, pin_type: elementType } },
      valueIn: (element) => element,
      elementWith: (_element, value) => value,
      refusalShowsTheValue: false,
    },
  ];
}

/** Rows of a List input's elements. */
export default class ListRows extends HTMLElement implements InputControlElement<"list_of"> {
  readonly #memberNames = document.createElement("div");
  readonly #rowsElement = document.createElement("div");
  readonly #empty = document.createElement("span");
  readonly #add = document.createElement("button");
  readonly #rows: ListRow[] = [];
  #pin: ControlledPin<"list_of"> | null = null;
  #parts: readonly RowPart[] = [];
  #list: unknown[] = [];
  #state: InputControlState = "read_only";

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const list = document.createElement("div");
    list.className = "list-rows";
    this.#memberNames.className = "list-member-names";
    this.#memberNames.setAttribute("aria-hidden", "true");
    this.#memberNames.hidden = true;
    this.#rowsElement.className = "list-row-grid";
    this.#empty.className = "list-empty";
    this.#empty.textContent = "Empty";
    this.#add.type = "button";
    this.#add.className = "list-add";
    this.#add.textContent = "+ Add";
    this.#rowsElement.append(this.#memberNames);
    list.append(this.#rowsElement, this.#empty, this.#add);
    shadow.append(list);
    this.#add.addEventListener("click", () => this.#addAnElement());
    this.#showTheButtons();
  }

  set pin(pin: ControlledPin<"list_of">) {
    this.#pin = pin;
    this.#parts = partsOfEachRow(pin);
    this.#rowsElement.style.setProperty("--list-part-count", String(this.#parts.length));
    const elementType = pin.declaration.pin_type.element_type;
    this.#memberNames.hidden = elementType.type !== "bundle";
    this.#memberNames.replaceChildren(
      ...this.#parts.map(({ pin: partPin }) => {
        const name = document.createElement("span");
        name.className = "list-member-name";
        name.textContent = partPin.declaration.label;
        return name;
      }),
      document.createElement("span"),
    );
    this.#add.setAttribute("aria-label", `Add an element to ${pin.declaration.label}`);
    this.#showTheButtons();
  }

  set value(list: unknown[]) {
    this.#list = [...list];
    this.#drawTheRows();
  }

  set state(state: InputControlState) {
    this.#state = state;
    for (const listRow of this.#rows) this.#handTheState(listRow);
    this.#showTheButtons();
  }

  /** Makes a row for each element and drops each row past the List's end, then hands each row's controls its element. */
  #drawTheRows(): void {
    while (this.#rows.length < this.#list.length) this.#rows.push(this.#newRow());
    for (const listRow of this.#rows.splice(this.#list.length)) listRow.row.remove();
    this.#handEachRowItsElement();
  }

  #newRow(): ListRow {
    const row = document.createElement("div");
    row.className = "list-row";
    row.setAttribute("role", "group");
    const cells = this.#parts.map((part): RowCell => {
      const slot = document.createElement("div");
      slot.className = "list-row-control";
      return { part, slot, control: null, words: null };
    });
    const buttons = document.createElement("div");
    buttons.className = "list-row-buttons";
    const moveUp = this.#rowButton("list-row-move-up", "↑");
    const moveDown = this.#rowButton("list-row-move-down", "↓");
    const remove = this.#rowButton("list-row-remove", "×");
    buttons.append(moveUp, moveDown, remove);
    row.append(...cells.map(({ slot }) => slot), buttons);
    this.#rowsElement.append(row);
    const listRow: ListRow = { row, cells, move_up: moveUp, move_down: moveDown, remove };
    moveUp.addEventListener("click", () => this.#moveTheElement(listRow, -1));
    moveDown.addEventListener("click", () => this.#moveTheElement(listRow, 1));
    remove.addEventListener("click", () => this.#removeTheElement(listRow));
    for (const cell of cells) this.#askForTheControl(listRow, cell);
    return listRow;
  }

  #rowButton(className: string, words: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-row-button ${className}`;
    button.textContent = words;
    return button;
  }

  /** Asks the Studio for a cell's control and puts it in the cell once made, or in its place the Studio's words, or the part's value in words. */
  #askForTheControl(listRow: ListRow, cell: RowCell): void {
    const { pin } = cell.part;
    pin.studio.inputControlFor(pin).then(
      (control) => {
        if (!this.#rows.includes(listRow)) return;
        cell.control = control;
        control.setAttribute("data-surface", pin.surface);
        this.#handTheState(listRow);
        this.#handTheElement(listRow, this.#rows.indexOf(listRow));
        control.addEventListener("input", (event) => this.#partEdited(listRow, cell, event));
        control.addEventListener("change", (event) => this.#partEdited(listRow, cell, event));
        control.addEventListener("cancel", (event) => {
          if (isTheCancelOfAnInputControl(event)) fireInputControlCancel(this);
        });
        cell.slot.append(control);
      },
      (refusal: unknown) => {
        if (!this.#rows.includes(listRow)) return;
        const because = refusal instanceof Error ? refusal.message : String(refusal);
        const words = document.createElement("span");
        words.className = "list-row-words";
        words.textContent = because;
        if (cell.part.refusalShowsTheValue) {
          words.setAttribute("role", "group");
          words.setAttribute("aria-label", pin.declaration.label);
          words.title = because;
          words.setAttribute("aria-description", because);
        }
        cell.words = words;
        this.#handTheElement(listRow, this.#rows.indexOf(listRow));
        cell.slot.append(words);
      },
    );
  }

  #handTheState(listRow: ListRow): void {
    const editable = this.#state === "editable";
    const index = this.#rows.indexOf(listRow);
    listRow.remove.disabled = !editable;
    listRow.move_up.disabled = !editable || index <= 0;
    listRow.move_down.disabled = !editable || index < 0 || index >= this.#rows.length - 1;
    for (const { control } of listRow.cells) {
      if (control === null) continue;
      control.setAttribute("data-state", this.#state);
      control.state = this.#state;
    }
  }

  #handTheElement(listRow: ListRow, index: number): void {
    const label = this.#pin?.declaration.label ?? "";
    const position = `${label} ${index + 1}`;
    listRow.row.setAttribute("aria-label", position);
    listRow.move_up.setAttribute("aria-label", `Move ${position} up`);
    listRow.move_down.setAttribute("aria-label", `Move ${position} down`);
    listRow.remove.setAttribute("aria-label", `Remove ${position}`);
    const element = this.#list[index];
    for (const { part, control, words } of listRow.cells) {
      const value = part.valueIn(element);
      if (control !== null && isAControlValue(value)) control.value = value;
      if (words !== null && part.refusalShowsTheValue) words.textContent = wordsForTheStoredValue(isAControlValue(value) ? value : null);
    }
  }

  /** Hands every row its element and its buttons' state, in the order the rows stand. */
  #handEachRowItsElement(): void {
    this.#rows.forEach((listRow, index) => {
      this.#handTheElement(listRow, index);
      this.#handTheState(listRow);
    });
    this.#showTheButtons();
  }

  /** A row control's `input` or `change`, as the List's own, carrying the List with that row's element, so edited, in its place. */
  #partEdited(listRow: ListRow, cell: RowCell, event: Event): void {
    const carried = valueTheInputControlEventCarries(event);
    const index = this.#rows.indexOf(listRow);
    if (carried === null || index < 0 || this.#state !== "editable") return;
    const list = this.#list.with(index, cell.part.elementWith(this.#list[index], carried.value));
    if (event.type === "change") this.#list = list;
    fireInputControlEvent(this, event.type === "change" ? "change" : "input", list);
  }

  #addAnElement(): void {
    const pin = this.#pin;
    if (pin === null || this.#state !== "editable") return;
    const element = aNewElementOf(pin.declaration.pin_type.element_type, pin.declaration.annotations);
    if (element === undefined) return;
    this.#list = [...this.#list, element];
    this.#drawTheRows();
    fireInputControlEvent(this, "change", this.#list);
  }

  #removeTheElement(listRow: ListRow): void {
    const index = this.#rows.indexOf(listRow);
    if (index < 0 || this.#state !== "editable") return;
    this.#list = this.#list.toSpliced(index, 1);
    this.#rows.splice(index, 1);
    listRow.row.remove();
    this.#handEachRowItsElement();
    fireInputControlEvent(this, "change", this.#list);
  }

  /** Swaps a row with the one `step` away, its controls moving with it, as one change. The other row is the one moved in the page, so the pressed button keeps its focus, which passes to the row's other move button where the move leaves it disabled. */
  #moveTheElement(listRow: ListRow, step: -1 | 1): void {
    const index = this.#rows.indexOf(listRow);
    const other = index + step;
    if (index < 0 || other < 0 || other >= this.#rows.length || this.#state !== "editable") return;
    const otherRow = this.#rows[other];
    if (otherRow === undefined) return;
    this.#list = this.#list.with(index, this.#list[other]).with(other, this.#list[index]);
    this.#rows[index] = otherRow;
    this.#rows[other] = listRow;
    if (step < 0) listRow.row.after(otherRow.row);
    else listRow.row.before(otherRow.row);
    this.#handEachRowItsElement();
    const pressed = step < 0 ? listRow.move_up : listRow.move_down;
    if (pressed.disabled) (step < 0 ? listRow.move_down : listRow.move_up).focus();
    fireInputControlEvent(this, "change", this.#list);
  }

  /** Shows the add button where an element can be added, disabled while the List may not be edited, and the words for an empty List. */
  #showTheButtons(): void {
    const elementType = this.#pin?.declaration.pin_type.element_type ?? null;
    this.#add.hidden = elementType === null || aNewElementOf(elementType, this.#pin?.declaration.annotations ?? {}) === undefined;
    this.#add.disabled = this.#state !== "editable";
    this.#empty.hidden = this.#list.length > 0;
  }
}
