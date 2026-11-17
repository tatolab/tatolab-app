import { cn } from "cn";
import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { areTheSameControlledInput, type ControlledInput } from "../pin_model/controlled_inputs";
import { inputAddressKey, type InputAddress } from "../pin_model/node_inputs";
import type { NodeUiSurface } from "../node_ui/input_control_element";
import { createInputControlBinder, type InputControlBinder, type InputControlBinding, type InputControlShown, type OwnFieldBinding } from "../pin_services/input_control_binding";
import { createInputValues, type InputValues, type ShownValue } from "../pin_services/input_values";
import type { InputValueComesFrom, JsonValue } from "../studio_readings";
import { newGestureIdempotencyKey, type TatoAppViewConnection } from "../tato_app_view_connection";

/** The frame's one binder, which every control slot binds through; `null` draws each slot's own field. */
export const InputControlBinderContext = createContext<InputControlBinder | null>(null);

/** A frame's store of input values, sending through `connection`, and the one binder its control slots bind through. */
export function useInputControlsOfTheFrame(connection: TatoAppViewConnection): { inputValues: InputValues; inputControls: InputControlBinder } {
  const inputValues = useMemo(
    () => createInputValues({ transactInTheProject: (projectFolder, operations, sending) => connection.transactInTheProject(projectFolder, operations, sending), newGestureIdempotencyKey }),
    [connection],
  );
  const inputControls = useMemo(() => createInputControlBinder({ watchNodeUiElements: (listener) => connection.watchNodeUiElements(listener), inputValues }), [connection, inputValues]);
  return { inputValues, inputControls };
}

interface InputControlMountProps {
  input: ControlledInput;
  surface: NodeUiSurface;
  readOnly: boolean;
  /** What the slot draws while it has no control to show: while the listing or the element loads, where the table has no control for the input, or where no binder is given. It is drawn again each time it changes. */
  fallback: ReactNode;
  /** What the slot draws in `fallback`'s place where the table has no control for the input, or where no binder is given, as a surface's own field; `fallback` when absent. */
  noControl?: ReactNode;
  className?: string;
  /** Attributes the control's host carries, as a canvas's mark for a card's inline controls; give a constant, since another object binds nothing again but draws the slot again. */
  hostAttributes?: Readonly<Record<`data-${string}`, string>>;
}

/** Stops a key at the slot, so a focused control owns the keyboard and no shortcut of the panel around it acts on the key. */
function keptByTheControl(keyEvent: KeyboardEvent): void {
  keyEvent.stopPropagation();
}

/**
 * The slot one input's control is drawn in. Its fallback is drawn outside the memoised host, so a fallback that changes is
 * drawn again while the bound control is not; the host binds through the frame's binder in a layout effect and never sees a
 * value: the binder sets each one on the element.
 */
export function InputControlMount({ input, surface, readOnly, fallback, noControl = fallback, className, hostAttributes }: InputControlMountProps) {
  const binder = useContext(InputControlBinderContext);
  const [shown, setShown] = useState<InputControlShown>("pending");
  const hasNoControl = binder === null || shown === "no_control";
  const drawsTheFallback = hasNoControl || shown === "pending";
  return (
    <>
      {hasNoControl ? noControl : shown === "pending" && fallback}
      <InputControlHost binder={binder} input={input} surface={surface} readOnly={readOnly} isHidden={drawsTheFallback} shown={shown} whenShown={setShown} className={className} hostAttributes={hostAttributes} />
    </>
  );
}

interface InputControlHostProps {
  binder: InputControlBinder | null;
  input: ControlledInput;
  surface: NodeUiSurface;
  readOnly: boolean;
  isHidden: boolean;
  shown: InputControlShown;
  whenShown: (shown: InputControlShown) => void;
  className: string | undefined;
  hostAttributes: Readonly<Record<`data-${string}`, string>> | undefined;
}

/**
 * The element a control is bound in. It carries `nodrag nopan`, so a drag inside the control moves neither a card nor the
 * canvas, lets the wheel through, so the wheel still zooms the canvas, and stops `keydown` at itself.
 */
const InputControlHost = memo(function InputControlHost({ binder, input, surface, readOnly, isHidden, shown, whenShown, className, hostAttributes }: InputControlHostProps) {
  const hostElement = useRef<HTMLDivElement>(null);
  const binding = useRef<InputControlBinding | null>(null);
  const latest = useRef({ input, surface, readOnly });
  useLayoutEffect(() => {
    latest.current = { input, surface, readOnly };
  });
  useLayoutEffect(() => {
    const host = hostElement.current;
    if (binder === null || host === null) return;
    host.addEventListener("keydown", keptByTheControl);
    const { input: boundInput, surface: boundSurface, readOnly: isBoundReadOnly } = latest.current;
    const bound = binder.bindInputControl(host, boundInput, { surface: boundSurface, read_only: isBoundReadOnly }, whenShown);
    binding.current = bound;
    return () => {
      binding.current = null;
      bound.unbind();
      host.removeEventListener("keydown", keptByTheControl);
    };
  }, [binder, whenShown]);
  useLayoutEffect(() => {
    binding.current?.update(input, { surface, read_only: readOnly });
  }, [input, surface, readOnly]);
  return <div ref={hostElement} {...hostAttributes} className={cn("nodrag nopan min-w-0", isHidden && "hidden", className)} data-input-control={input.address.input} data-input-control-shows={shown} />;
}, haveTheSameInputAndPlace);

/** Whether a host is told the same input at the same place, so a new reading's equal input draws it again for nothing. */
function haveTheSameInputAndPlace(before: InputControlHostProps, after: InputControlHostProps): boolean {
  return (
    before.binder === after.binder &&
    areTheSameControlledInput(before.input, after.input) &&
    before.surface === after.surface &&
    before.readOnly === after.readOnly &&
    before.isHidden === after.isHidden &&
    before.shown === after.shown &&
    before.whenShown === after.whenShown &&
    before.className === after.className &&
    before.hostAttributes === after.hostAttributes
  );
}

// Where the control table has no control for an input, a surface's own field shows its value, and a row says where that
// value comes from. Both read the store through the frame's binder, as the one place a value reaches React, and send
// through the input's one sender, so an edit is one `set_node_input_value` commit as a control's release is.

/** The binding of a surface's own field to one input, and what it was bound under. */
interface OwnFieldBound {
  readonly binder: InputControlBinder | null;
  readonly address_key: string | null;
  readonly binding: OwnFieldBinding | null;
}

function ownFieldBoundAt(binder: InputControlBinder | null, address: InputAddress | null): OwnFieldBound {
  return { binder, address_key: address === null ? null : inputAddressKey(address), binding: address === null ? null : (binder?.bindOwnField(address) ?? null) };
}

/** The frame's binding of the input at `address`, kept while a new reading gives an equal address; `null` for no address or no binder. */
function useOwnFieldBinding(address: InputAddress | null): OwnFieldBinding | null {
  const binder = useContext(InputControlBinderContext);
  const [bound, setBound] = useState(() => ownFieldBoundAt(binder, address));
  const addressKey = address === null ? null : inputAddressKey(address);
  if (bound.binder !== binder || bound.address_key !== addressKey) setBound(ownFieldBoundAt(binder, address));
  return bound.binding;
}

const SHOWS_NOTHING: ShownValue = Object.freeze({ value: null, comes_from: null });
const watchesNothing = () => () => undefined;

/** The value the store shows for the input at `address`, at once and on each change; nothing for no address or no binder. */
export function useShownValueOfTheInput(address: InputAddress | null): ShownValue {
  return useShownValueThrough(useOwnFieldBinding(address));
}

function useShownValueThrough(binding: OwnFieldBinding | null): ShownValue {
  const watchTheValue = useCallback((onChanged: () => void) => binding?.watchValue(onChanged) ?? watchesNothing(), [binding]);
  const readTheValue = useCallback(() => binding?.shownValue() ?? SHOWS_NOTHING, [binding]);
  return useSyncExternalStore(watchTheValue, readTheValue);
}

/** Where the value the store shows for an input comes from, and its reset to the default. */
export interface WhereTheInputsValueComesFrom {
  readonly comes_from: InputValueComesFrom | null;
  /** Takes the input's saved value off as one commit. */
  readonly resetToTheDefault: () => void;
}

/** Where the value the store shows for the input at `address` comes from, drawn again only when that changes; `null` for no address or no binder. */
export function useWhereTheInputsValueComesFrom(address: InputAddress | null): WhereTheInputsValueComesFrom | null {
  const binding = useOwnFieldBinding(address);
  const watchTheValue = useCallback((onChanged: () => void) => binding?.watchValue(onChanged) ?? watchesNothing(), [binding]);
  const readWhereItComesFrom = useCallback(() => binding?.shownValue().comes_from ?? null, [binding]);
  const comesFrom = useSyncExternalStore(watchTheValue, readWhereItComesFrom);
  return useMemo(() => (binding === null ? null : { comes_from: comesFrom, resetToTheDefault: () => binding.clear() }), [binding, comesFrom]);
}

/** What a surface's own field reads and writes for its input. */
export interface OwnFieldOfTheInput {
  /** The value the store shows for the input, and where it comes from. */
  readonly shown: ShownValue;
  /** Sends `value` as one whole gesture, one commit. */
  readonly releaseTheValue: (value: JsonValue) => void;
  /** Takes the input's saved value off as one commit. */
  readonly clearTheValue: () => void;
}

/** The own field of the input at `address`, bound through the frame's binder; `null` where the frame gives no binder, so the field is only shown. */
export function useOwnFieldOfTheInput(address: InputAddress): OwnFieldOfTheInput | null {
  const binding = useOwnFieldBinding(address);
  const shown = useShownValueThrough(binding);
  return useMemo(() => (binding === null ? null : { shown, releaseTheValue: (value) => binding.beginGesture().release(value), clearTheValue: () => binding.clear() }), [binding, shown]);
}
