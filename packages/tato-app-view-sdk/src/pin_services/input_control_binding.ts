// The one seam between a surface, the control table and the store of input values. A frame creates
// one binder from its connection; each control slot binds through it. The binder asks the table
// which element draws the input, loads it, hands it its pin, state and value, and follows the
// store. An element's `input` moves a gesture and its `change` releases it, a lone `change` being a
// whole gesture; Escape, or a press the pointer gives up, cancels it. While a gesture is open the
// binder never sets the element's value, and every value that arrives is set in one animation-frame
// flush, so a surface's React tree never sees one. DOM only, no React.

import { inputAddressKey } from "../pin_model/node_inputs.js";
import type { ControlledInput } from "../pin_model/controlled_inputs.js";
import { jsonOfTheStoredPinValue, storedPinValueOfTheJson } from "../pin_model/stored_pin_values.js";
import type { BuiltInPinTypeName } from "../pin_types.js";
import type { ControlledPin, InputControlElement, InputControlState, NodeUiSurface } from "../node_ui/input_control_element.js";
import { valueTheInputControlEventCarries } from "../node_ui/input_control_event_reading.js";
import { loadNodeUiElement, type NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import { NodeUiControlTable, type NodeUiControlChoice } from "../node_ui/node_ui_control_table.js";
import type { NodeUiElementHost } from "../node_ui/node_ui_element_host.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "../node_ui/node_ui_elements_listing.js";
import { ReadOnlyValueLineElement } from "../node_ui/read_only_value_line_element.js";
import type { StopWatching } from "../tato_app_view_connection.js";
import type { InputValueGesture, InputValues, ShownValue } from "./input_values.js";

/** Where a control is drawn, and whether the graph there can be edited. */
export interface InputControlPlace {
  readonly surface: NodeUiSurface;
  readonly read_only: boolean;
}

/**
 * What a slot shows: nothing yet, while the listing or the element loads; the element; the read-only line, for an element
 * that is blocked or does not load; or no control, because the table has none for the input, where the surface draws its own field.
 */
export type InputControlShown = "pending" | "element" | "read_only_line" | "no_control";

/** One bound slot: told of a changed input or place, and unbound when the slot goes. */
export interface InputControlBinding {
  update(input: ControlledInput, place: InputControlPlace): void;
  unbind(): void;
}

/** A frame's one binder. */
export interface InputControlBinder {
  /** Draws the control for `input` inside `host`, telling `whenShown` what the slot shows each time it changes. */
  bindInputControl(host: HTMLElement, input: ControlledInput, place: InputControlPlace, whenShown?: (shown: InputControlShown) => void): InputControlBinding;
}

/** What a binder reads and writes through: the frame's element listing and its store, and, for tests, how an element loads and when a flush runs. */
export interface InputControlBinderSources {
  readonly watchNodeUiElements: (listener: (reading: NodeUiElementsReading) => void) => StopWatching;
  readonly inputValues: InputValues;
  readonly loadElement?: (listed: ListedNodeUiElement) => Promise<NodeUiElementLoading>;
  readonly requestAFlush?: (flush: () => void) => void;
}

/** The tag the read-only line is defined under in a frame. */
const READ_ONLY_VALUE_LINE_TAG = "tato-studio-read-only-value-line";

/** A control element of any built-in pin type, as the binder drives it. */
type AnyInputControl = InputControlElement<BuiltInPinTypeName>;

/** A new read-only line, defined in the page the first time one is drawn. */
function newReadOnlyValueLine(because: string): ReadOnlyValueLineElement {
  if (customElements.get(READ_ONLY_VALUE_LINE_TAG) === undefined) customElements.define(READ_ONLY_VALUE_LINE_TAG, class extends ReadOnlyValueLineElement {});
  const line = document.createElement(READ_ONLY_VALUE_LINE_TAG);
  if (!(line instanceof ReadOnlyValueLineElement)) throw new Error(`${READ_ONLY_VALUE_LINE_TAG} is defined by another copy of the SDK`);
  line.because = because;
  return line;
}

/** Whether `element` takes what the host hands a control: its `pin`, `value` and `state`. */
function isAnInputControl(element: HTMLElement): element is AnyInputControl {
  return "pin" in element && "value" in element && "state" in element;
}

/** A new element of `tag`, which loading has defined, or the read-only line when its class takes no `pin`, `value` and `state`. */
function newInputControl(tag: string): AnyInputControl {
  const element = document.createElement(tag);
  return isAnInputControl(element) ? element : newReadOnlyValueLine(`${tag} is not a control: its class takes no pin, value and state.`);
}

/** The words a read-only line gives for an element that did not load. */
function whyTheElementDidNotLoad(loading: Exclude<NodeUiElementLoading, { kind: "defined" }>): string {
  return loading.kind === "blocked" ? `Its control does not pass its checks: ${loading.findings.join("; ")}` : loading.because;
}

/** The key a mounted element stays under: the element the table chose, the input's declaration and the surface; another key means a new element. */
function keyOfTheElement(choice: Extract<NodeUiControlChoice, { kind: "element" }>, input: ControlledInput, place: InputControlPlace): string {
  return JSON.stringify([choice.listed.module, choice.listed.script, choice.listed.folder_version, input.declaration, place.surface]);
}

/** The state a control is in at `place`. */
function stateAt(place: InputControlPlace): InputControlState {
  return place.read_only ? "read_only" : "editable";
}

/** A frame's binder, reading its listing and store from `sources`. */
export function createInputControlBinder(sources: InputControlBinderSources): InputControlBinder {
  const loadElement = sources.loadElement ?? ((listed: ListedNodeUiElement) => loadNodeUiElement(listed));
  const requestAFlush = sources.requestAFlush ?? ((flush: () => void) => void requestAnimationFrame(flush));
  const { inputValues } = sources;
  const bindings = new Set<SlotBinding>();
  const bindingsToFlush = new Set<SlotBinding>();
  let table: NodeUiControlTable | null = null;
  let stopWatchingTheListing: StopWatching | null = null;
  let isAFlushRequested = false;

  const flushTheValues = (): void => {
    isAFlushRequested = false;
    const flushed = [...bindingsToFlush];
    bindingsToFlush.clear();
    for (const binding of flushed) binding.setTheShownValue();
  };
  const flushTheValueOf = (binding: SlotBinding): void => {
    bindingsToFlush.add(binding);
    if (isAFlushRequested) return;
    isAFlushRequested = true;
    requestAFlush(flushTheValues);
  };

  /** The control the table picks for `pin`, defined and handed its pin, for a control that holds another. */
  const studio: NodeUiElementHost = {
    inputControlFor: async (pin) => {
      const choice = table?.controlChoiceForTheInput(pin.declaration) ?? { kind: "read_only_line", because: "The Studio has not listed its controls yet." };
      if (choice.kind === "read_only_line") return Promise.reject(new Error(choice.because));
      const loading = await loadElement(choice.listed);
      if (loading.kind !== "defined") return Promise.reject(new Error(whyTheElementDidNotLoad(loading)));
      const control = newInputControl(loading.tag);
      control.pin = pin;
      return control;
    },
  };

  /** One slot: the element it holds, the gesture open on it, and its watch of the store. */
  class SlotBinding implements InputControlBinding {
    readonly #host: HTMLElement;
    readonly #whenShown: (shown: InputControlShown) => void;
    #input: ControlledInput;
    #place: InputControlPlace;
    #element: AnyInputControl | null = null;
    #elementKey: string | null = null;
    #shown: InputControlShown | null = null;
    #gesture: InputValueGesture | null = null;
    #isIgnoringTheElement = false;
    #isIgnoringTheElementUntilAPress = false;
    #isUnbound = false;
    #shownValue: ShownValue;
    #stopWatchingTheValue: StopWatching;

    constructor(host: HTMLElement, input: ControlledInput, place: InputControlPlace, whenShown: (shown: InputControlShown) => void) {
      this.#host = host;
      this.#whenShown = whenShown;
      this.#input = input;
      this.#place = place;
      this.#shownValue = inputValues.shownValue(input.address);
      this.#stopWatchingTheValue = this.#watchTheValue();
      host.addEventListener("pointercancel", this.#pressGivenUp);
      host.addEventListener("pointerdown", this.#pressBegun, { capture: true });
      host.addEventListener("keydown", this.#keyBegun, { capture: true });
    }

    update(input: ControlledInput, place: InputControlPlace): void {
      if (this.#isUnbound) return;
      const isAnotherAddress = inputAddressKey(input.address) !== inputAddressKey(this.#input.address);
      if (isAnotherAddress) this.#cancelTheGesture();
      this.#input = input;
      this.#place = place;
      if (isAnotherAddress) {
        this.#stopWatchingTheValue();
        this.#shownValue = inputValues.shownValue(input.address);
        this.#stopWatchingTheValue = this.#watchTheValue();
      }
      this.refresh();
    }

    unbind(): void {
      if (this.#isUnbound) return;
      this.#isUnbound = true;
      this.#stopWatchingTheValue();
      this.#host.removeEventListener("pointercancel", this.#pressGivenUp);
      this.#host.removeEventListener("pointerdown", this.#pressBegun, { capture: true });
      this.#host.removeEventListener("keydown", this.#keyBegun, { capture: true });
      this.#takeTheElementOff();
      bindingsToFlush.delete(this);
      bindings.delete(this);
      if (bindings.size === 0) {
        stopWatchingTheListing?.();
        stopWatchingTheListing = null;
        table = null;
      }
    }

    /** Draws what the table picks now: the element it holds when the key is the same, otherwise a new one once loaded. */
    refresh(): void {
      if (this.#isUnbound) return;
      if (table === null) {
        if (this.#element === null) this.#tell("pending");
        return;
      }
      const choice = table.controlChoiceForTheInput(this.#input.declaration);
      if (choice.kind === "read_only_line") {
        this.#takeTheElementOff();
        this.#elementKey = null;
        this.#tell("no_control");
        return;
      }
      const key = keyOfTheElement(choice, this.#input, this.#place);
      if (key === this.#elementKey) {
        this.#setTheState();
        return;
      }
      this.#takeTheElementOff();
      this.#elementKey = key;
      this.#tell("pending");
      void loadElement(choice.listed).then((loading) => {
        if (this.#isUnbound || this.#elementKey !== key) return;
        this.#mount(loading.kind === "defined" ? newInputControl(loading.tag) : newReadOnlyValueLine(whyTheElementDidNotLoad(loading)));
      });
    }

    /** Sets the element's value to the one the store shows, unless a gesture is open on it. */
    setTheShownValue(): void {
      const element = this.#element;
      if (element === null || this.#gesture !== null) return;
      const stored = storedPinValueOfTheJson(this.#input.declaration.pin_type, this.#shownValue.value);
      if (stored !== undefined) element.value = stored;
    }

    #watchTheValue(): StopWatching {
      return inputValues.watchValue(this.#input.address, (shown) => {
        this.#shownValue = shown;
        flushTheValueOf(this);
      });
    }

    #tell(shown: InputControlShown): void {
      if (shown === this.#shown) return;
      this.#shown = shown;
      this.#whenShown(shown);
    }

    /** Hands `element` its pin, state and value, then puts it in the slot and listens to it. */
    #mount(element: AnyInputControl): void {
      const pin: ControlledPin<BuiltInPinTypeName> = { declaration: this.#input.declaration, surface: this.#place.surface, studio };
      element.pin = pin;
      element.setAttribute("data-surface", this.#place.surface);
      element.setAttribute("data-state", stateAt(this.#place));
      element.state = stateAt(this.#place);
      this.#element = element;
      this.setTheShownValue();
      element.addEventListener("input", this.#elementMoved);
      element.addEventListener("change", this.#elementReleased);
      this.#host.append(element);
      this.#tell(element instanceof ReadOnlyValueLineElement ? "read_only_line" : "element");
    }

    #takeTheElementOff(): void {
      const element = this.#element;
      if (element === null) return;
      element.removeEventListener("input", this.#elementMoved);
      element.removeEventListener("change", this.#elementReleased);
      this.#cancelTheGesture();
      this.#element = null;
      element.remove();
    }

    /** Hands the element the state of its place; a gesture open on a control that is no longer editable is cancelled. */
    #setTheState(): void {
      const element = this.#element;
      if (element === null) return;
      const state = stateAt(this.#place);
      if (element.getAttribute("data-state") === state) return;
      element.setAttribute("data-state", state);
      this.#whileIgnoringTheElement(() => {
        element.state = state;
      });
      if (state !== "editable") this.#cancelTheGesture();
    }

    /** Runs `change`, during which an event the element fires is the binder's own doing and is not acted on. */
    #whileIgnoringTheElement(change: () => void): void {
      this.#isIgnoringTheElement = true;
      try {
        change();
      } finally {
        this.#isIgnoringTheElement = false;
      }
    }

    /** The JSON `event` carries for the input, or `undefined` for an event the binder does not act on. */
    #valueOfTheEvent(event: Event): ReturnType<typeof jsonOfTheStoredPinValue> {
      if (this.#isIgnoringTheElement || this.#isIgnoringTheElementUntilAPress || this.#isUnbound || this.#place.read_only) return undefined;
      const carried = valueTheInputControlEventCarries(event);
      return carried === null ? undefined : jsonOfTheStoredPinValue(this.#input.declaration.pin_type, carried.value);
    }

    #openGesture(): InputValueGesture {
      if (this.#gesture !== null) return this.#gesture;
      const gesture = inputValues.beginGesture(this.#input.address, "commit");
      this.#gesture = gesture;
      this.#host.ownerDocument.addEventListener("keydown", this.#keyPressedInTheGesture, { capture: true });
      return gesture;
    }

    #closeTheGesture(): void {
      this.#gesture = null;
      this.#host.ownerDocument.removeEventListener("keydown", this.#keyPressedInTheGesture, { capture: true });
      flushTheValueOf(this);
    }

    #cancelTheGesture(): void {
      const gesture = this.#gesture;
      if (gesture === null) return;
      gesture.cancel();
      this.#closeTheGesture();
    }

    readonly #elementMoved = (event: Event): void => {
      const value = this.#valueOfTheEvent(event);
      if (value !== undefined) this.#openGesture().move(value);
    };

    readonly #elementReleased = (event: Event): void => {
      const value = this.#valueOfTheEvent(event);
      if (value === undefined) return;
      this.#openGesture().release(value);
      this.#closeTheGesture();
    };

    /**
     * Escape during a gesture cancels it, and ends the element's own press by making it read only for a moment, which puts
     * its value back. Until the next press or key in the slot, nothing the element fires is acted on, so a control that
     * still fires a `change` as its press ends commits nothing.
     */
    readonly #keyPressedInTheGesture = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== "Escape" || this.#gesture === null) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      const element = this.#element;
      if (element !== null) {
        this.#whileIgnoringTheElement(() => {
          element.state = "read_only";
          element.state = stateAt(this.#place);
        });
      }
      this.#cancelTheGesture();
      this.#isIgnoringTheElementUntilAPress = true;
    };

    /** A press in the slot begins what the element fires next, which is acted on again after an Escape. */
    readonly #pressBegun = (): void => {
      this.#isIgnoringTheElementUntilAPress = false;
    };

    /** A key in the slot, other than the Escape that cancelled, begins what the element fires next. */
    readonly #keyBegun = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key !== "Escape") this.#isIgnoringTheElementUntilAPress = false;
    };

    /** A press the pointer gave up ends no gesture with a `change`, so the gesture it opened is cancelled. */
    readonly #pressGivenUp = (): void => {
      this.#cancelTheGesture();
    };
  }

  const startWatchingTheListing = (): void => {
    if (stopWatchingTheListing !== null) return;
    stopWatchingTheListing = sources.watchNodeUiElements((reading) => {
      table = new NodeUiControlTable(reading);
      for (const binding of [...bindings]) binding.refresh();
    });
  };

  return {
    bindInputControl: (host, input, place, whenShown = () => undefined) => {
      const binding = new SlotBinding(host, input, place, whenShown);
      bindings.add(binding);
      startWatchingTheListing();
      binding.refresh();
      return binding;
    },
  };
}
