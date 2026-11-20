// A node body's slot on a card: the binder asks the table for the body its node type registers, loads
// it, checks that its class's `inputTypes` fit the node, hands it its `node` once and its `inputs` on
// each change, and follows the store. Each input the body draws takes its gestures as a control's
// does: `input` moves one, `change` releases it, a lone `change` being a whole gesture, and Escape or a
// press the pointer gives up cancels every one open. While a gesture is open on an input, the body is
// told the value it last fired for it, never the store's. A body whose element does not pass its
// checks is not drawn, so the card shows its rows alone; one that does not load or fit the node is the
// read-only line with why. DOM only, no React.

import type { InputOfANodeBody, NodeOfABody } from "../pin_model/controlled_inputs.js";
import { areTheSameNodeOfABody } from "../pin_model/controlled_inputs.js";
import type { InputAddress } from "../pin_model/node_inputs.js";
import { jsonOfTheStoredPinValue, storedPinValueOfTheJson } from "../pin_model/stored_pin_values.js";
import type { BuiltInPinTypeName } from "../pin_types.js";
import type { InputControlState, InputPinDeclaration } from "../node_ui/input_control_element.js";
import type { NodeUiElementLoading } from "../node_ui/load_node_ui_element.js";
import { inputAndValueTheNodeBodyEventCarries, inputTypesTheBodyClassStates, whyTheBodyDoesNotFitTheNode, type DrawnNode, type NodeBodyInput, type NodeBodyInputTypes } from "../node_ui/node_body_element.js";
import type { NodeUiControlTable } from "../node_ui/node_ui_control_table.js";
import type { NodeUiElementHost } from "../node_ui/node_ui_element_host.js";
import type { ListedNodeUiElement } from "../node_ui/node_ui_elements_listing.js";
import type { StopWatching } from "../tato_app_view_connection.js";
import { markTheNewerVersionBlocked, newReadOnlyValueLine, releaseOfAGestureOn, whyTheElementDidNotLoad, type ProjectAControlReaches } from "./element_slot_support.js";
import type { InputValueGesture, InputValues } from "./input_values.js";
import { readWhatTheWiringCarries } from "./wire_reading.js";

/** What a body's slot shows: nothing yet, while the listing or the body loads; the body; the read-only line, for a body that does not load or fit its node; or no body, where its node type registers none or its body does not pass its checks. */
export type NodeBodyShown = "pending" | "body" | "read_only_line" | "no_body";

/** One bound body slot: told of a changed node or of whether its graph can be edited, and unbound when the card goes. */
export interface NodeBodyBinding {
  update(node: NodeOfABody, readOnly: boolean): void;
  unbind(): void;
}

/** What a body's slot reads and writes through, as the frame's binder gives it. */
export interface NodeBodySlotSources {
  readonly table: () => NodeUiControlTable | null;
  readonly loadElement: (listed: ListedNodeUiElement) => Promise<NodeUiElementLoading>;
  readonly inputValues: InputValues;
  readonly project: ProjectAControlReaches;
  readonly studioOfTheProject: (projectFolder: string, watchWhatIsWiredInto: NodeUiElementHost["watchWhatIsWiredInto"]) => NodeUiElementHost;
  readonly flushTheValuesOf: (slot: NodeBodySlot) => void;
  readonly whenUnbound: (slot: NodeBodySlot) => void;
}

/** A body as the host drives it: told its node once and its inputs on each change, each by its input's name. */
interface NodeBodyAsTheHostDrivesIt extends HTMLElement {
  node: Omit<DrawnNode<NodeBodyInputTypes>, "declarations"> & { readonly declarations: Readonly<Record<string, InputPinDeclaration<BuiltInPinTypeName>>> };
  inputs: Readonly<Record<string, NodeBodyInput<BuiltInPinTypeName>>>;
}

/** Whether `element` takes what the host hands a body: its `node` and `inputs`. */
function isANodeBody(element: HTMLElement): element is NodeBodyAsTheHostDrivesIt {
  return "node" in element && "inputs" in element;
}

/** A gesture open on one input of the body, and the value the body last fired for it. */
interface OpenGesture {
  readonly gesture: InputValueGesture;
  value: unknown;
}

/** The input of `node` named `inputName`, or `undefined` when it has no typed input of that name. */
function inputNamed(node: NodeOfABody, inputName: string): InputOfANodeBody | undefined {
  return node.inputs.find((input) => input.declaration.input_name === inputName);
}

/** What the slot draws once `listed` has loaded as `loading` for `node`: the body, ready to be handed its node, or the read-only line with why. */
function elementOfTheLoading(loading: NodeUiElementLoading, node: NodeOfABody): { readonly kind: "body"; readonly element: NodeBodyAsTheHostDrivesIt; readonly input_types: NodeBodyInputTypes } | { readonly kind: "read_only_line"; readonly because: string } {
  if (loading.kind !== "defined") return { kind: "read_only_line", because: whyTheElementDidNotLoad(loading) };
  const stated = inputTypesTheBodyClassStates(customElements.get(loading.tag));
  if (stated.kind === "not_stated") return { kind: "read_only_line", because: `${loading.tag} is not a node body: ${stated.because}` };
  const misfit = whyTheBodyDoesNotFitTheNode(stated.input_types, node.node_type, new Map(node.inputs.map((input) => [input.declaration.input_name, input.declaration])));
  if (misfit !== null) return { kind: "read_only_line", because: misfit };
  const element = document.createElement(loading.tag);
  return isANodeBody(element) ? { kind: "body", element, input_types: stated.input_types } : { kind: "read_only_line", because: `${loading.tag} is not a node body: its class takes no node and inputs.` };
}

/** One body slot: the element it holds, its gestures, and its watches of the store. */
export class NodeBodySlot implements NodeBodyBinding {
  readonly #host: HTMLElement;
  readonly #sources: NodeBodySlotSources;
  readonly #whenShown: (shown: NodeBodyShown) => void;
  #node: NodeOfABody;
  #readOnly: boolean;
  #element: NodeBodyAsTheHostDrivesIt | null = null;
  #inputTypes: NodeBodyInputTypes = {};
  #elementKey: string | null = null;
  #shown: NodeBodyShown | null = null;
  readonly #gestures = new Map<string, OpenGesture>();
  #isIgnoringTheBodyUntilAPress = false;
  #isUnbound = false;
  #stopWatchingTheValues: StopWatching = () => undefined;
  readonly #wireReadings = new Set<StopWatching>();

  constructor(host: HTMLElement, node: NodeOfABody, readOnly: boolean, sources: NodeBodySlotSources, whenShown: (shown: NodeBodyShown) => void) {
    this.#host = host;
    this.#sources = sources;
    this.#whenShown = whenShown;
    this.#node = node;
    this.#readOnly = readOnly;
    host.addEventListener("pointercancel", this.#pressGivenUp);
    host.addEventListener("pointerdown", this.#pressBegun, { capture: true });
  }

  update(node: NodeOfABody, readOnly: boolean): void {
    if (this.#isUnbound || (areTheSameNodeOfABody(node, this.#node) && readOnly === this.#readOnly)) return;
    this.#node = node;
    this.#readOnly = readOnly;
    if (readOnly) this.#cancelEveryGesture();
    this.refresh();
  }

  unbind(): void {
    if (this.#isUnbound) return;
    this.#isUnbound = true;
    this.#host.removeEventListener("pointercancel", this.#pressGivenUp);
    this.#host.removeEventListener("pointerdown", this.#pressBegun, { capture: true });
    this.#takeTheBodyOff();
    this.#sources.whenUnbound(this);
  }

  /** Draws the body the table holds for the node type now: the one it holds when the key is the same, kept and marked while its newer version is blocked, otherwise a new one once loaded. */
  refresh(): void {
    if (this.#isUnbound) return;
    const table = this.#sources.table();
    if (table === null) {
      if (this.#element === null) this.#tell("pending");
      return;
    }
    const listed = table.nodeBodyForTheNodeType(this.#node.node_type);
    const key = listed === null ? null : JSON.stringify([listed.module, listed.script, listed.folder_version, this.#node.node_type, this.#node.inputs.map((input) => input.declaration)]);
    if (listed !== null && key === this.#elementKey && this.#element !== null) {
      markTheNewerVersionBlocked(this.#host, listed.script_serving.kind === "blocked" ? listed.script_serving.findings : null);
      this.#watchTheValues();
      this.setTheShownValues();
      return;
    }
    if (listed === null || key === null || listed.script_serving.kind === "blocked") {
      this.#takeTheBodyOff();
      this.#elementKey = null;
      this.#tell("no_body");
      return;
    }
    if (key === this.#elementKey) {
      this.#watchTheValues();
      this.setTheShownValues();
      return;
    }
    this.#takeTheBodyOff();
    this.#elementKey = key;
    this.#tell("pending");
    void this.#sources.loadElement(listed).then((loading) => {
      if (this.#isUnbound || this.#elementKey !== key) return;
      const drawn = elementOfTheLoading(loading, this.#node);
      if (drawn.kind === "read_only_line") {
        this.#host.append(newReadOnlyValueLine(drawn.because));
        this.#tell("read_only_line");
        return;
      }
      this.#mount(drawn.element, drawn.input_types);
    });
  }

  /** Tells the body each input it draws as the store shows it, but for one a gesture is open on, which keeps the value the body last fired. */
  setTheShownValues(): void {
    const element = this.#element;
    if (element === null) return;
    element.inputs = Object.fromEntries(Object.keys(this.#inputTypes).flatMap((inputName) => {
      const input = inputNamed(this.#node, inputName);
      return input === undefined ? [] : [[inputName, this.#bodyInputOf(input)]];
    }));
  }

  /** What the body is told of `input`. */
  #bodyInputOf(input: InputOfANodeBody): NodeBodyInput<BuiltInPinTypeName> {
    const state = this.#stateOf(input);
    if (state === "driven_by_wire" || input.value_address === null) return { state: "driven_by_wire", value: null };
    const open = this.#gestures.get(input.declaration.input_name);
    const value = open === undefined ? this.#sources.inputValues.shownValue(input.value_address).value : jsonOfTheStoredPinValue(input.declaration.pin_type, open.value);
    return { state, value: value === undefined ? null : (storedPinValueOfTheJson(input.declaration.pin_type, value) ?? null) };
  }

  /** Whether a person may change `input` here: not while a wire feeds it or it holds no value of its own, nor where the graph cannot be edited. */
  #stateOf(input: InputOfANodeBody): InputControlState {
    if (input.wiring?.kind === "wired" || input.value_address === null) return "driven_by_wire";
    return this.#readOnly ? "read_only" : "editable";
  }

  #tell(shown: NodeBodyShown): void {
    if (shown === this.#shown) return;
    this.#shown = shown;
    this.#whenShown(shown);
  }

  /** Watches the store's value of each input the body draws, flushing them to it as one when any changes. */
  #watchTheValues(): void {
    this.#stopWatchingTheValues();
    const stops = Object.keys(this.#inputTypes).flatMap((inputName) => {
      const address = inputNamed(this.#node, inputName)?.value_address ?? null;
      return address === null ? [] : [this.#sources.inputValues.watchValue(address, () => this.#sources.flushTheValuesOf(this))];
    });
    this.#stopWatchingTheValues = () => {
      for (const stop of stops) stop();
    };
  }

  /** Hands `element` its node and inputs, then puts it in the slot and listens to it. */
  #mount(element: NodeBodyAsTheHostDrivesIt, inputTypes: NodeBodyInputTypes): void {
    const studio = this.#sources.studioOfTheProject(this.#node.project_folder, this.#watchWhatIsWiredInto);
    const declarations = Object.fromEntries(Object.keys(inputTypes).flatMap((inputName) => {
      const declaration = inputNamed(this.#node, inputName)?.declaration;
      return declaration === undefined ? [] : [[inputName, declaration]];
    }));
    this.#inputTypes = inputTypes;
    element.node = { node_type: this.#node.node_type, declarations, surface: "node", studio };
    element.setAttribute("data-surface", "node");
    this.#element = element;
    this.setTheShownValues();
    this.#watchTheValues();
    element.addEventListener("input", this.#bodyMoved);
    element.addEventListener("change", this.#bodyReleased);
    this.#host.ownerDocument.addEventListener("keydown", this.#keyPressed, { capture: true });
    this.#host.append(element);
    this.#tell("body");
  }

  #takeTheBodyOff(): void {
    markTheNewerVersionBlocked(this.#host, null);
    this.#cancelEveryGesture();
    this.#stopWatchingTheValues();
    this.#stopWatchingTheValues = () => undefined;
    for (const stopReading of this.#wireReadings) stopReading();
    this.#wireReadings.clear();
    this.#host.ownerDocument.removeEventListener("keydown", this.#keyPressed, { capture: true });
    const element = this.#element;
    this.#element = null;
    this.#inputTypes = {};
    if (element !== null) {
      element.removeEventListener("input", this.#bodyMoved);
      element.removeEventListener("change", this.#bodyReleased);
    }
    this.#host.replaceChildren();
  }

  /** The body's watch of what is wired into one of its node's inputs, which reads it until stopped, the body goes, or the slot is unbound. */
  readonly #watchWhatIsWiredInto: NodeUiElementHost["watchWhatIsWiredInto"] = (inputName, onEvent) => {
    if (this.#isUnbound) return () => undefined;
    const input = inputNamed(this.#node, inputName);
    if (input === undefined || input.wiring === null) {
      onEvent({ kind: "unwired", because: input === undefined ? `${this.#node.node_type} has no typed input named ${inputName}.` : `${inputName} reads no wire.` });
      return () => undefined;
    }
    const stopReading = readWhatTheWiringCarries(this.#sources.project, input.wiring, onEvent);
    this.#wireReadings.add(stopReading);
    return () => {
      if (!this.#wireReadings.delete(stopReading)) return;
      stopReading();
    };
  };

  /** The input an event the body fired names, where it is set, and the value it carries for it, or `null` for one the slot does not act on. */
  #inputAndValueOfTheEvent(event: Event): { readonly input: InputOfANodeBody; readonly address: InputAddress; readonly value: unknown } | null {
    if (this.#isUnbound || this.#isIgnoringTheBodyUntilAPress) return null;
    const carried = inputAndValueTheNodeBodyEventCarries(event);
    if (carried === null || !(carried.input in this.#inputTypes)) return null;
    const input = inputNamed(this.#node, carried.input);
    if (input === undefined || input.value_address === null || this.#stateOf(input) !== "editable") return null;
    return { input, address: input.value_address, value: carried.value };
  }

  /** The gesture open on `input`, set at `address`, opened now when none is. */
  #openGesture(input: InputOfANodeBody, address: InputAddress): OpenGesture {
    const inputName = input.declaration.input_name;
    const open = this.#gestures.get(inputName);
    if (open !== undefined) return open;
    const opened: OpenGesture = { gesture: this.#sources.inputValues.beginGesture(address, releaseOfAGestureOn("node", input)), value: null };
    this.#gestures.set(inputName, opened);
    return opened;
  }

  #cancelEveryGesture(): void {
    if (this.#gestures.size === 0) return;
    for (const open of this.#gestures.values()) open.gesture.cancel();
    this.#gestures.clear();
    this.#sources.flushTheValuesOf(this);
  }

  readonly #bodyMoved = (event: Event): void => {
    const carried = this.#inputAndValueOfTheEvent(event);
    if (carried === null || carried.input.declaration.pin_type.type === "trigger") return;
    const { input, address, value } = carried;
    const json = jsonOfTheStoredPinValue(input.declaration.pin_type, value);
    if (json === undefined) return;
    const open = this.#openGesture(input, address);
    open.value = value;
    open.gesture.move(json);
  };

  readonly #bodyReleased = (event: Event): void => {
    const carried = this.#inputAndValueOfTheEvent(event);
    if (carried === null) return;
    const { input, address, value } = carried;
    if (input.declaration.pin_type.type === "trigger") {
      this.#sources.inputValues.fire(address);
      return;
    }
    const json = jsonOfTheStoredPinValue(input.declaration.pin_type, value);
    if (json === undefined) return;
    this.#openGesture(input, address).gesture.release(json);
    this.#gestures.delete(input.declaration.input_name);
    this.#sources.flushTheValuesOf(this);
  };

  /** Escape during a gesture cancels every one open; until the next press in the slot, nothing the body fires is acted on, so a `change` its press still fires commits nothing. */
  readonly #keyPressed = (keyEvent: KeyboardEvent): void => {
    if (keyEvent.key !== "Escape" || this.#gestures.size === 0) return;
    keyEvent.preventDefault();
    keyEvent.stopPropagation();
    this.#cancelEveryGesture();
    this.#isIgnoringTheBodyUntilAPress = true;
  };

  readonly #pressBegun = (): void => {
    this.#isIgnoringTheBodyUntilAPress = false;
  };

  readonly #pressGivenUp = (): void => {
    this.#cancelEveryGesture();
  };
}
