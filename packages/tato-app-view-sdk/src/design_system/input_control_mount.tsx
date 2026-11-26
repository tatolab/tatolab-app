import { cn } from "cn";
import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { areTheSameControlledInput, type ControlledInput } from "../pin_model/controlled_inputs";
import { inputAddressKey, type InputAddress } from "../pin_model/node_inputs";
import type { NodeUiSurface } from "../node_ui/input_control_element";
import { valueWords } from "../pin_model/value_words";
import type { PinType } from "../pin_types";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { createInputControlBinder, type InputControlBinder, type InputControlBinding, type InputControlShown, type InputValueBinding, type InputValueRelease } from "../pin_services/input_control_binding";
import { createInputValues, type InputValues, type ShownValue } from "../pin_services/input_values";
import { jsonTextOf, type InputValueComesFrom, type StreamInputValue, type StreamInputValuesReading } from "../studio_readings";
import { newGestureIdempotencyKey, type TatoAppViewConnection } from "../tato_app_view_connection";

/** The frame's one binder, which every control slot binds through; `null` draws each slot's `noControl`. */
export const InputControlBinderContext = createContext<InputControlBinder | null>(null);

/** A frame's store of input values, sending through `connection`, and the one binder its control slots bind through. */
export function useInputControlsOfTheFrame(connection: TatoAppViewConnection): { inputValues: InputValues; inputControls: InputControlBinder } {
  const inputValues = useMemo(
    () => createInputValues({ transactInTheProject: (projectFolder, operations, sending) => connection.transactInTheProject(projectFolder, operations, sending), newGestureIdempotencyKey }),
    [connection],
  );
  const inputControls = useMemo(() => createInputControlBinder({ watchNodeUiElements: (listener) => connection.watchNodeUiElements(listener), inputValues, project: connection }), [connection, inputValues]);
  return { inputValues, inputControls };
}

const NO_SETTING_VALUES: readonly StreamInputValue[] = [];

/**
 * Feeds `inputValues` the values of `stream`, a stream of the project in `projectFolder`, while drawn and the project is known:
 * each value the host serves, with `settingValues`, what each setting of a node type not yet typed reads, which the host
 * serves none of, since the graph lists no such setting among its node's ports. A new `settingValues` is taken with the host's
 * latest values; give one that changes only as the graph or its node types' descriptions do.
 */
export function useInputValuesOfTheStream(connection: TatoAppViewConnection, inputValues: InputValues, stream: string, projectFolder: string | null, settingValues: readonly StreamInputValue[] = NO_SETTING_VALUES): void {
  const hostValues = useRef<{ readonly projectFolder: string; readonly stream: string; readonly reading: Extract<StreamInputValuesReading, { kind: "values" }> } | null>(null);
  const settingValuesTaken = useRef(settingValues);
  settingValuesTaken.current = settingValues;
  useLayoutEffect(() => {
    hostValues.current = null;
    if (projectFolder === null) return undefined;
    return connection.watchStreamInputValues(stream, (reading) => {
      if (reading.kind === "changed") {
        inputValues.takeTheInputValues(projectFolder, reading);
        return;
      }
      hostValues.current = { projectFolder, stream, reading };
      inputValues.takeTheInputValues(projectFolder, { ...reading, values: [...reading.values, ...settingValuesTaken.current] });
    });
  }, [connection, inputValues, stream, projectFolder]);
  useLayoutEffect(() => {
    const latest = hostValues.current;
    if (latest === null || latest.projectFolder !== projectFolder || latest.stream !== stream || settingValues.length === 0) return;
    inputValues.takeTheInputValues(latest.projectFolder, { ...latest.reading, values: [...latest.reading.values, ...settingValues] });
  }, [inputValues, stream, projectFolder, settingValues]);
}

interface InputControlMountProps {
  input: ControlledInput;
  surface: NodeUiSurface;
  readOnly: boolean;
  /** What the slot draws while it has no control to show: while the listing or the element loads, where the table has no control for the input, or where no binder is given. It is drawn again each time it changes. */
  fallback: ReactNode;
  /** What the slot draws in `fallback`'s place where the table has no control for the input, or where no binder is given; `fallback` when absent. */
  noControl?: ReactNode;
  className?: string;
  /** Attributes the control's host carries, as a canvas's mark for a card's inline controls; give a constant, since another object binds nothing again but draws the slot again. */
  hostAttributes?: Readonly<Record<`data-${string}`, string>>;
}

/** The dashed amber outline round a slot that draws its control while a registration bearing on it is blocked; the binder sets the attribute, and the slot's `title` gives why. */
export const BLOCKED_REGISTRATION_MARK = "data-[blocked-registration]:rounded-sm data-[blocked-registration]:outline data-[blocked-registration]:outline-1 data-[blocked-registration]:outline-offset-1 data-[blocked-registration]:outline-warn data-[blocked-registration]:outline-dashed";

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
  return <div ref={hostElement} {...hostAttributes} className={cn("nodrag nopan min-w-0", BLOCKED_REGISTRATION_MARK, isHidden && "hidden", className)} data-input-control={input.address.input} data-input-control-shows={shown} />;
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

// Beside an input's control, a surface shows its value in words, its refusal, and where that value comes from, with a
// clear of it. Each reads the store through the frame's binder, as the one place a value reaches React, and a clear sends
// through the input's one sender, as a control's release does: a commit, or in Perform a live value.

/** The binding of a surface's reading of one input, and what it was bound under. */
interface InputValueBound {
  readonly binder: InputControlBinder | null;
  readonly address_key: string | null;
  readonly release: InputValueRelease;
  readonly binding: InputValueBinding | null;
}

function inputValueBoundAt(binder: InputControlBinder | null, address: InputAddress | null, release: InputValueRelease): InputValueBound {
  return { binder, address_key: address === null ? null : inputAddressKey(address), release, binding: address === null ? null : (binder?.bindInputValue(address, release) ?? null) };
}

/** The frame's binding of the input at `address`, its clear as `release` says, kept while a new reading gives an equal address; `null` for no address or no binder. */
function useInputValueBinding(address: InputAddress | null, release: InputValueRelease): InputValueBinding | null {
  const binder = useContext(InputControlBinderContext);
  const [bound, setBound] = useState(() => inputValueBoundAt(binder, address, release));
  const addressKey = address === null ? null : inputAddressKey(address);
  if (bound.binder !== binder || bound.address_key !== addressKey || bound.release !== release) setBound(inputValueBoundAt(binder, address, release));
  return bound.binding;
}

/** What a surface reads of one input's value without setting it: the value the store shows and the refusal of its latest write. */
type InputValueReading = Pick<InputValueBinding, "shownValue" | "watchValue" | "watchRefusal">;

/**
 * The frame's reading of the input at `address`; `null` for no address or no binder. A reading clears nothing, so the release the binding is made with plays no part in it.
 */
function useInputValueReading(address: InputAddress | null): InputValueReading | null {
  return useInputValueBinding(address, "commit");
}

const SHOWS_NOTHING: ShownValue = Object.freeze({ value: null, comes_from: null });
const watchesNothing = () => () => undefined;

/** The value the store shows for the input at `address`, at once and on each change; nothing for no address or no binder. */
export function useShownValueOfTheInput(address: InputAddress | null): ShownValue {
  return useShownValueThrough(useInputValueReading(address));
}

/**
 * The value the store shows for the input at `address` in words, as a card writes a value of `pinType`, else as JSON, while
 * its control loads; nothing while it shows no value.
 */
export function InputValueWords({ id, address, pinType, className, ...controlDataAttributes }: { id?: string; address: InputAddress; pinType: PinType | null; className?: string } & ControlDataAttributes) {
  const { value } = useShownValueOfTheInput(address);
  return (
    <span id={id} className={cn("truncate text-fg-3 tabular-nums", className)} {...controlDataAttributes}>
      {value === null ? "" : (valueWords(pinType, value) ?? jsonTextOf(value))}
    </span>
  );
}

function useShownValueThrough(binding: InputValueReading | null): ShownValue {
  const watchTheValue = useCallback((onChanged: () => void) => binding?.watchValue(onChanged) ?? watchesNothing(), [binding]);
  const readTheValue = useCallback(() => binding?.shownValue() ?? SHOWS_NOTHING, [binding]);
  return useSyncExternalStore(watchTheValue, readTheValue);
}

/** Why the store's latest write of the input at `address` was refused, in the words of what refused it; `null` once a write applies, and for no address or no binder. */
export function useRefusalOfTheInput(address: InputAddress | null): string | null {
  const binding = useInputValueReading(address);
  const [refusal, setRefusal] = useState<{ readonly binding: InputValueReading | null; readonly words: string | null }>({ binding, words: null });
  useLayoutEffect(() => binding?.watchRefusal((words) => setRefusal({ binding, words })), [binding]);
  return refusal.binding === binding ? refusal.words : null;
}

/** Where the value an input shows comes from, and the clear of the value its surface keeps. */
export interface WhereTheInputsValueComesFrom {
  readonly comes_from: InputValueComesFrom | null;
  /** Takes off the value the surface keeps: the saved value as one commit, back to the default, or in Perform the live value, back to the saved one. */
  readonly clearTheValue: () => void;
}

/** Where the value the store shows for the input at `address` comes from, drawn again only when that changes, its clear as `release` says; `null` for no address or no binder. */
export function useWhereTheInputsValueComesFrom(address: InputAddress | null, release: InputValueRelease): WhereTheInputsValueComesFrom | null {
  const binding = useInputValueBinding(address, release);
  const watchTheValue = useCallback((onChanged: () => void) => binding?.watchValue(onChanged) ?? watchesNothing(), [binding]);
  const readWhereItComesFrom = useCallback(() => binding?.shownValue().comes_from ?? null, [binding]);
  const comesFrom = useSyncExternalStore(watchTheValue, readWhereItComesFrom);
  return useMemo(() => (binding === null ? null : { comes_from: comesFrom, clearTheValue: () => binding.clear() }), [binding, comesFrom]);
}
