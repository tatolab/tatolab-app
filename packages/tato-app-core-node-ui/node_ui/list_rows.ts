// The default control of a List input: a row for each element, drawn by the control the Studio's
// table picks for the element's type, asked for through `pin.studio.inputControlFor`, each with a
// button that removes it, and a button under the rows that adds an element. The control's value is
// the whole List: an element's `input` is the List's `input`, its `change` the List's `change`, so
// each row edited is one undo step, and so is each add and each remove; an element's `cancel` is the
// List's. Every row's control is handed the same pin: the List's, typed as its element, with the
// List's annotations, so an annotation that names a control names the element's.
// An element is added at its type's zero, held to the List's range; a type with no zero, as an Asset,
// is not added here.

import {
  fireInputControlCancel,
  fireInputControlEvent,
  isTheCancelOfAnInputControl,
  valueTheInputControlEventCarries,
  type ControlledPin,
  type InputControlElement,
  type InputControlState,
} from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { BuiltInPinTypeName, PinAnnotations, PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import { isAJsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A row's element control, of the List's element type. */
type ElementControl = InputControlElement<BuiltInPinTypeName>;

/** Whether `element`, an element of the List the host set, is a value a control of its type is handed: the host reads each element in its type's form, so it is one unless it is no JSON at all. */
function isAnElementValue(element: unknown): element is ElementControl["value"] {
  return isAJsonValue(element) || typeof element === "bigint";
}

/** One row: what it holds, and its element's control once the Studio has made it. */
interface ListRow {
  readonly row: HTMLDivElement;
  readonly control_slot: HTMLDivElement;
  readonly remove: HTMLButtonElement;
  control: ElementControl | null;
}

/** The 4 by 4 identity, row by row. */
const IDENTITY_TRANSFORM = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** `number` held inside the range `annotations` state. */
function heldToTheRange(number: number, annotations: PinAnnotations): number {
  const minimum = annotations.range?.minimum ?? Number.NEGATIVE_INFINITY;
  const maximum = annotations.range?.maximum ?? Number.POSITIVE_INFINITY;
  return Math.min(maximum, Math.max(minimum, number));
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
    default:
      return undefined;
  }
}

/** Rows of a List input's elements. */
export default class ListRows extends HTMLElement implements InputControlElement<"list_of"> {
  readonly #rowsElement = document.createElement("div");
  readonly #empty = document.createElement("span");
  readonly #add = document.createElement("button");
  readonly #rows: ListRow[] = [];
  #pin: ControlledPin<"list_of"> | null = null;
  #elementPin: ControlledPin<BuiltInPinTypeName> | null = null;
  #list: unknown[] = [];
  #state: InputControlState = "read_only";

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const list = document.createElement("div");
    list.className = "list-rows";
    this.#rowsElement.className = "list-rows";
    this.#empty.className = "list-empty";
    this.#empty.textContent = "Empty";
    this.#add.type = "button";
    this.#add.className = "list-add";
    this.#add.textContent = "+ Add";
    list.append(this.#rowsElement, this.#empty, this.#add);
    shadow.append(list);
    this.#add.addEventListener("click", () => this.#addAnElement());
    this.#showTheButtons();
  }

  set pin(pin: ControlledPin<"list_of">) {
    this.#pin = pin;
    const { declaration } = pin;
    this.#elementPin = { ...pin, declaration: { ...declaration, label: `${declaration.label} element`, pin_type: declaration.pin_type.element_type } };
    this.#add.setAttribute("aria-label", `Add an element to ${declaration.label}`);
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

  /** Makes a row for each element and drops each row past the List's end, then hands each row's control its element. */
  #drawTheRows(): void {
    while (this.#rows.length < this.#list.length) this.#rows.push(this.#newRow());
    for (const listRow of this.#rows.splice(this.#list.length)) {
      listRow.control?.remove();
      listRow.row.remove();
    }
    this.#rows.forEach((listRow, index) => this.#handTheElement(listRow, index));
    this.#showTheButtons();
  }

  #newRow(): ListRow {
    const row = document.createElement("div");
    row.className = "list-row";
    row.setAttribute("role", "group");
    const controlSlot = document.createElement("div");
    controlSlot.className = "list-row-control";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "list-row-remove";
    remove.textContent = "×";
    row.append(controlSlot, remove);
    this.#rowsElement.append(row);
    const listRow: ListRow = { row, control_slot: controlSlot, remove, control: null };
    remove.addEventListener("click", () => this.#removeTheElement(listRow));
    this.#askForTheElementControl(listRow);
    return listRow;
  }

  /** Asks the Studio for the row's control and puts it in the row once made, or the Studio's words on why it is not. */
  #askForTheElementControl(listRow: ListRow): void {
    const elementPin = this.#elementPin;
    if (elementPin === null) return;
    elementPin.studio.inputControlFor(elementPin).then(
      (control) => {
        if (!this.#rows.includes(listRow)) return;
        listRow.control = control;
        control.setAttribute("data-surface", elementPin.surface);
        this.#handTheState(listRow);
        this.#handTheElement(listRow, this.#rows.indexOf(listRow));
        control.addEventListener("input", (event) => this.#elementEdited(listRow, event));
        control.addEventListener("change", (event) => this.#elementEdited(listRow, event));
        control.addEventListener("cancel", (event) => {
          if (isTheCancelOfAnInputControl(event)) fireInputControlCancel(this);
        });
        listRow.control_slot.append(control);
      },
      (refusal: unknown) => {
        if (!this.#rows.includes(listRow)) return;
        const words = document.createElement("span");
        words.className = "list-row-words";
        words.textContent = refusal instanceof Error ? refusal.message : String(refusal);
        listRow.control_slot.append(words);
      },
    );
  }

  #handTheState(listRow: ListRow): void {
    listRow.remove.disabled = this.#state !== "editable";
    if (listRow.control === null) return;
    listRow.control.setAttribute("data-state", this.#state);
    listRow.control.state = this.#state;
  }

  #handTheElement(listRow: ListRow, index: number): void {
    const label = this.#pin?.declaration.label ?? "";
    listRow.row.setAttribute("aria-label", `${label} ${index + 1}`);
    listRow.remove.setAttribute("aria-label", `Remove ${label} ${index + 1}`);
    const element = this.#list[index];
    if (listRow.control !== null && isAnElementValue(element)) listRow.control.value = element;
  }

  /** An element's `input` or `change`, as the List's own, carrying the List with that element in its place. */
  #elementEdited(listRow: ListRow, event: Event): void {
    const carried = valueTheInputControlEventCarries(event);
    const index = this.#rows.indexOf(listRow);
    if (carried === null || index < 0 || this.#state !== "editable") return;
    const list = this.#list.with(index, carried.value);
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
    listRow.control?.remove();
    listRow.row.remove();
    this.#rows.forEach((remaining, remainingIndex) => this.#handTheElement(remaining, remainingIndex));
    this.#showTheButtons();
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
