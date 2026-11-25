// The one seam between a surface, the control table and the store of input values. A frame creates
// one binder from its connection; each control slot binds through it. The binder asks the table
// which element draws the input, loads it, hands it its pin, state and value, and follows the
// store. An element's `input` moves a gesture and its `change` releases it, a lone `change` being a
// whole gesture, ended in a commit, or live in Perform; the element's own `cancel`, Escape, or a press
// the pointer gives up, cancels it. A Trigger holds no value: each `change` of its control fires it
// once, on every surface. While a gesture is open the
// binder never sets the element's value, and every value that arrives is set in one animation-frame
// flush, so a surface's React tree never sees one. A control on an input of a type only a wire
// carries is driven by its wire: it holds no value, nothing it fires is acted on, and it reads what
// the wire carries from the port viewer of the output wired in. A control already drawn whose newer
// version is blocked stays drawn, marked, and the table never falls through to another control. A
// card's node body binds through the same binder, reading the same table and store. DOM only, no React.

import { inputAddressKey, type InputAddress } from "../pin_model/node_inputs.js";
import type { ControlledInput, NodeOfABody } from "../pin_model/controlled_inputs.js";
import { jsonOfTheStoredPinValue, storedPinValueOfTheJson } from "../pin_model/stored_pin_values.js";
import type { BuiltInPinTypeName } from "../pin_types.js";
import type { ControlledPin, InputControlElement, InputControlState, NodeUiSurface } from "../node_ui/input_control_element.js";
import { isTheCancelOfAnInputControl, valueTheInputControlEventCarries } from "../node_ui/input_control_event_reading.js";
import { loadNodeUiElement, type NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import { NodeUiControlTable, type NodeUiControlChoice } from "../node_ui/node_ui_control_table.js";
import type { NodeUiElementHost } from "../node_ui/node_ui_element_host.js";
import type { ListedNodeUiElement, NodeUiElementsReading } from "../node_ui/node_ui_elements_listing.js";
import { ReadOnlyValueLineElement } from "../node_ui/read_only_value_line_element.js";
import type { StopWatching } from "../tato_app_view_connection.js";
import type { ViewInputEvent } from "../view_wire_messages.js";
import type { InputValueGesture, InputValues, ShownValue } from "./input_values.js";
import { markTheNewerVersionBlocked, newReadOnlyValueLine, releaseOfAGestureOn, whyTheElementDidNotLoad, type InputValueRelease, type ProjectAControlReaches } from "./element_slot_support.js";
import { NodeBodySlot, type NodeBodyBinding, type NodeBodyShown } from "./node_body_binding.js";
import { readWhatTheWiringCarries } from "./wire_reading.js";
import { watchTheAudioCaptureDevices } from "./audio_capture_devices_watched.js";

export { NEWER_VERSION_BLOCKED_ATTRIBUTE, releaseOfAGestureOn, type InputValueRelease, type ProjectAControlReaches } from "./element_slot_support.js";

/** Where a control is drawn, and whether the graph there can be edited. */
export interface InputControlPlace {
  readonly surface: NodeUiSurface;
  readonly read_only: boolean;
}

/**
 * What a slot shows: nothing yet, while the listing or the element loads; the element; the read-only line, for an element
 * that is blocked or does not load; or no control, because the table has none for the input, where the surface draws what it has in its place.
 */
export type InputControlShown = "pending" | "element" | "read_only_line" | "no_control";

/** One bound slot: told of a changed input or place, and unbound when the slot goes. */
export interface InputControlBinding {
  update(input: ControlledInput, place: InputControlPlace): void;
  unbind(): void;
}

/**
 * What a surface reads of one input's value beside its control: the store's value for that input and its refusal, and a
 * clear of the value the binding's release keeps, through the input's one sender: the saved value as one commit, back to
 * the default, or the live value, back to the saved one.
 */
export interface InputValueBinding {
  shownValue(): ShownValue;
  watchValue(listener: (shown: ShownValue) => void): StopWatching;
  watchRefusal(listener: (refusal: string | null) => void): StopWatching;
  clear(): void;
}

/** A frame's one binder. */
export interface InputControlBinder {
  /** Draws the control for `input` inside `host`, telling `whenShown` what the slot shows each time it changes. */
  bindInputControl(host: HTMLElement, input: ControlledInput, place: InputControlPlace, whenShown?: (shown: InputControlShown) => void): InputControlBinding;
  /** Binds a surface's reading of the input at `address`, its clear taking off the value `release` keeps. */
  bindInputValue(address: InputAddress, release: InputValueRelease): InputValueBinding;
  /** Draws, inside `host`, the body `node`'s node type registers, telling `whenShown` what the slot shows each time it changes; `no_body` where it registers none. */
  bindNodeBody(host: HTMLElement, node: NodeOfABody, readOnly: boolean, whenShown?: (shown: NodeBodyShown) => void): NodeBodyBinding;
}

/** What a binder reads and writes through: the frame's element listing, its store and its reach into a project, and, for tests, how an element loads and when a flush runs. */
export interface InputControlBinderSources {
  readonly watchNodeUiElements: (listener: (reading: NodeUiElementsReading) => void) => StopWatching;
  readonly inputValues: InputValues;
  readonly project: ProjectAControlReaches;
  readonly loadElement?: (listed: ListedNodeUiElement) => Promise<NodeUiElementLoading>;
  readonly requestAFlush?: (flush: () => void) => void;
}

/** A control element of any built-in pin type, as the binder drives it. */
type AnyInputControl = InputControlElement<BuiltInPinTypeName>;

/** Whether `element` takes what the host hands a control: its `pin`, `value` and `state`. */
function isAnInputControl(element: HTMLElement): element is AnyInputControl {
  return "pin" in element && "value" in element && "state" in element;
}

/** A new element of `tag`, which loading has defined, or the read-only line when its class takes no `pin`, `value` and `state`. */
function newInputControl(tag: string): AnyInputControl {
  const element = document.createElement(tag);
  return isAnInputControl(element) ? element : newReadOnlyValueLine(`${tag} is not a control: its class takes no pin, value and state.`);
}

/** The key a mounted element stays under: the element the table chose, the input's declaration and the surface; another key means a new element. */
function keyOfTheElement(choice: Extract<NodeUiControlChoice, { kind: "element" }>, input: ControlledInput, place: InputControlPlace): string {
  return JSON.stringify([choice.listed.module, choice.listed.script, choice.listed.folder_version, input.declaration, place.surface]);
}

/** The state a control of `input` is in at `place`: driven by its wire wherever it has one. */
function stateOf(input: ControlledInput, place: InputControlPlace): InputControlState {
  if (input.driven_by !== null) return "driven_by_wire";
  return place.read_only ? "read_only" : "editable";
}

/** One watch an element holds of what is wired into an input: the input it names, what it is told, and how its reading stops, `null` while none runs. */
interface WireWatch {
  readonly input: string;
  readonly onEvent: (event: ViewInputEvent) => void;
  stopReading: StopWatching | null;
}

/** A frame's binder, reading its listing and store from `sources`. */
export function createInputControlBinder(sources: InputControlBinderSources): InputControlBinder {
  const loadElement = sources.loadElement ?? ((listed: ListedNodeUiElement) => loadNodeUiElement(listed));
  const requestAFlush = sources.requestAFlush ?? ((flush: () => void) => void requestAnimationFrame(flush));
  const { inputValues, project } = sources;
  const bindings = new Set<SlotBinding | NodeBodySlot>();
  const bindingsToFlush = new Set<SlotBinding | NodeBodySlot>();
  let table: NodeUiControlTable | null = null;
  let stopWatchingTheListing: StopWatching | null = null;
  let isAFlushRequested = false;

  const flushTheValues = (): void => {
    isAFlushRequested = false;
    const flushed = [...bindingsToFlush];
    bindingsToFlush.clear();
    for (const binding of flushed) {
      if (binding instanceof NodeBodySlot) binding.setTheShownValues();
      else binding.setTheShownValue();
    }
  };
  const flushTheValueOf = (binding: SlotBinding | NodeBodySlot): void => {
    bindingsToFlush.add(binding);
    if (isAFlushRequested) return;
    isAFlushRequested = true;
    requestAFlush(flushTheValues);
  };

  /** Forgets `binding`, and the listing with the last one. */
  const slotUnbound = (binding: SlotBinding | NodeBodySlot): void => {
    bindingsToFlush.delete(binding);
    bindings.delete(binding);
    if (bindings.size > 0) return;
    stopWatchingTheListing?.();
    stopWatchingTheListing = null;
    table = null;
  };

  /** The control the table picks for `pin`, defined and handed its pin, for a control that holds another. */
  const inputControlFor: NodeUiElementHost["inputControlFor"] = async (pin) => {
    const choice = table?.controlChoiceForTheInput(pin.declaration) ?? { kind: "read_only_line", because: "The Studio has not listed its controls yet." };
    if (choice.kind === "read_only_line") return Promise.reject(new Error(choice.because));
    const loading = await loadElement(choice.listed);
    if (loading.kind !== "defined") return Promise.reject(new Error(whyTheElementDidNotLoad(loading)));
    const control = newInputControl(loading.tag);
    control.pin = pin;
    return control;
  };

  /** The Studio as a control of an input of a stream in the project at `projectFolder` reaches it, reading the wire into its input through `watchWhatIsWiredInto`. */
  const studioOfTheProject = (projectFolder: string, watchWhatIsWiredInto: NodeUiElementHost["watchWhatIsWiredInto"]): NodeUiElementHost => ({
    pickAProjectAsset: (pick) => project.pickAProjectAsset(pick),
    readAssetPreview: (asset) => project.readAssetPreviewInTheProject(projectFolder, asset),
    watchProjectAssets: (listener) => project.watchProjectAssets(projectFolder, listener),
    watchAudioCaptureDevices: (listener) => watchTheAudioCaptureDevices(project, listener),
    watchWhatIsWiredInto,
    inputControlFor,
  });

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
    readonly #wireWatches = new Set<WireWatch>();
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
      const isWiredOtherwise = JSON.stringify(input.driven_by) !== JSON.stringify(this.#input.driven_by);
      this.#input = input;
      this.#place = place;
      if (isWiredOtherwise) for (const watch of this.#wireWatches) this.#readTheWire(watch);
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
      slotUnbound(this);
    }

    /** Draws what the table picks now: the element it holds when the key is the same, marked while its newer version is blocked, otherwise a new one once loaded. */
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
        this.#markWhetherTheNewerVersionIsBlocked(choice.listed);
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

    /** Sets the element's value to the one the store shows, unless a gesture is open on it; a control driven by its wire holds none. */
    setTheShownValue(): void {
      const element = this.#element;
      if (element === null || this.#gesture !== null) return;
      const stored = this.#input.driven_by === null ? storedPinValueOfTheJson(this.#input.declaration.pin_type, this.#shownValue.value) : null;
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
      const studio = studioOfTheProject(this.#input.address.graph.project_folder, this.#watchWhatIsWiredInto);
      const pin: ControlledPin<BuiltInPinTypeName> = { declaration: this.#input.declaration, surface: this.#place.surface, studio };
      const state = stateOf(this.#input, this.#place);
      element.pin = pin;
      element.setAttribute("data-surface", this.#place.surface);
      element.setAttribute("data-state", state);
      element.state = state;
      this.#element = element;
      this.setTheShownValue();
      element.addEventListener("input", this.#elementMoved);
      element.addEventListener("change", this.#elementReleased);
      element.addEventListener("cancel", this.#elementCancelled);
      this.#host.append(element);
      this.#tell(element instanceof ReadOnlyValueLineElement ? "read_only_line" : "element");
    }

    /** Marks the slot while the element it holds is a control and `listed`, the version it was loaded from, has a newer version blocked. */
    #markWhetherTheNewerVersionIsBlocked(listed: ListedNodeUiElement): void {
      const holdsAControl = this.#element !== null && !(this.#element instanceof ReadOnlyValueLineElement);
      markTheNewerVersionBlocked(this.#host, holdsAControl && listed.script_serving.kind === "blocked" ? listed.script_serving.findings : null);
    }

    #takeTheElementOff(): void {
      markTheNewerVersionBlocked(this.#host, null);
      const element = this.#element;
      if (element === null) return;
      element.removeEventListener("input", this.#elementMoved);
      element.removeEventListener("change", this.#elementReleased);
      element.removeEventListener("cancel", this.#elementCancelled);
      this.#cancelTheGesture();
      this.#stopEveryWireWatch();
      this.#element = null;
      element.remove();
    }

    /** The element's watch of what is wired into `input`, which reads it until stopped, the element goes, or the slot is unbound. */
    readonly #watchWhatIsWiredInto: NodeUiElementHost["watchWhatIsWiredInto"] = (input, onEvent) => {
      const watch: WireWatch = { input, onEvent, stopReading: null };
      if (this.#isUnbound) return () => undefined;
      this.#wireWatches.add(watch);
      this.#readTheWire(watch);
      return () => {
        if (!this.#wireWatches.delete(watch)) return;
        watch.stopReading?.();
        watch.stopReading = null;
      };
    };

    /** Starts `watch` reading what is wired into its input now, ending what it read before. */
    #readTheWire(watch: WireWatch): void {
      watch.stopReading?.();
      watch.stopReading = null;
      const ownInput = this.#input.declaration.input_name;
      const wiring = this.#input.driven_by;
      if (watch.input !== ownInput) {
        watch.onEvent({ kind: "unwired", because: `A control reads the wire into its own input, ${ownInput}, and not into ${watch.input}.` });
        return;
      }
      if (wiring === null) {
        watch.onEvent({ kind: "unwired", because: `${ownInput} holds a value of its own and reads no wire.` });
        return;
      }
      watch.stopReading = readWhatTheWiringCarries(project, wiring, watch.onEvent);
    }

    #stopEveryWireWatch(): void {
      for (const watch of this.#wireWatches) watch.stopReading?.();
      this.#wireWatches.clear();
    }

    /** Hands the element the state of its place; a gesture open on a control that is no longer editable is cancelled. */
    #setTheState(): void {
      const element = this.#element;
      if (element === null) return;
      const state = stateOf(this.#input, this.#place);
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

    /** Whether what the element fires now is the person's doing, on a slot that may be edited, and so is acted on. */
    #isActedOn(): boolean {
      return !(this.#isIgnoringTheElement || this.#isIgnoringTheElementUntilAPress || this.#isUnbound || this.#place.read_only || this.#input.driven_by !== null);
    }

    /** The JSON `event` carries for the input, or `undefined` for an event the binder does not act on. */
    #valueOfTheEvent(event: Event): ReturnType<typeof jsonOfTheStoredPinValue> {
      if (!this.#isActedOn()) return undefined;
      const carried = valueTheInputControlEventCarries(event);
      return carried === null ? undefined : jsonOfTheStoredPinValue(this.#input.declaration.pin_type, carried.value);
    }

    #openGesture(): InputValueGesture {
      if (this.#gesture !== null) return this.#gesture;
      const gesture = inputValues.beginGesture(this.#input.address, releaseOfAGestureOn(this.#place.surface, this.#input));
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

    /** Whether the input is a Trigger, which holds no value, so its control's `change` fires it and nothing else it fires is acted on. */
    #isATrigger(): boolean {
      return this.#input.declaration.pin_type.type === "trigger";
    }

    readonly #elementMoved = (event: Event): void => {
      if (this.#isATrigger()) return;
      const value = this.#valueOfTheEvent(event);
      if (value !== undefined) this.#openGesture().move(value);
    };

    readonly #elementReleased = (event: Event): void => {
      if (this.#isATrigger()) {
        if (this.#isActedOn() && valueTheInputControlEventCarries(event) !== null) inputValues.fire(this.#input.address);
        return;
      }
      const value = this.#valueOfTheEvent(event);
      if (value === undefined) return;
      this.#openGesture().release(value);
      this.#closeTheGesture();
    };

    /** The element's own `cancel` ends the gesture it opened with nothing used; a native `cancel`, or one with no gesture open, is not acted on. */
    readonly #elementCancelled = (event: Event): void => {
      if (this.#isIgnoringTheElement || this.#isUnbound || !isTheCancelOfAnInputControl(event)) return;
      this.#cancelTheGesture();
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
          element.state = stateOf(this.#input, this.#place);
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
    bindNodeBody: (host, node, readOnly, whenShown = () => undefined) => {
      const binding = new NodeBodySlot(host, node, readOnly, { table: () => table, loadElement, inputValues, project, studioOfTheProject, flushTheValuesOf: flushTheValueOf, whenUnbound: slotUnbound }, whenShown);
      bindings.add(binding);
      startWatchingTheListing();
      binding.refresh();
      return binding;
    },
    bindInputControl: (host, input, place, whenShown = () => undefined) => {
      const binding = new SlotBinding(host, input, place, whenShown);
      bindings.add(binding);
      startWatchingTheListing();
      binding.refresh();
      return binding;
    },
    bindInputValue: (address, release) => ({
      shownValue: () => inputValues.shownValue(address),
      watchValue: (listener) => inputValues.watchValue(address, listener),
      watchRefusal: (listener) => inputValues.watchRefusal(address, listener),
      clear: () => inputValues.clear(address, release === "live" ? "live" : "commit"),
    }),
  };
}
