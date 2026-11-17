import { cn } from "cn";
import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { areTheSameControlledInput, type ControlledInput } from "../pin_model/controlled_inputs";
import { inputAddressKey, type InputAddress } from "../pin_model/node_inputs";
import type { NodeUiSurface } from "../node_ui/input_control_element";
import { createInputControlBinder, type InputControlBinder, type InputControlBinding, type InputControlShown, type OwnFieldBinding } from "../pin_services/input_control_binding";
import { createInputValues, type InputValues, type ShownValue } from "../pin_services/input_values";
import type { JsonValue } from "../studio_readings";
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
export function InputControlMount({ input, surface, readOnly, fallback, className, hostAttributes }: InputControlMountProps) {
  const binder = useContext(InputControlBinderContext);
  const [shown, setShown] = useState<InputControlShown>("pending");
  const drawsTheFallback = binder === null || shown === "pending" || shown === "no_control";
  return (
    <>
      {drawsTheFallback && fallback}
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

// A surface's own field for one input, where the control table has none, is the one place an input's value reaches
// React: it reads the store's shown value through the frame's binder and writes each edit as one gesture through the
// input's one sender, so it sends `set_node_input_value` as a control would.

/** What a surface's own field reads and writes for its input. */
export interface OwnFieldOfTheInput {
  /** The value the store shows for the input, and where it comes from. */
  readonly shown: ShownValue;
  /** Sends `value` as one whole gesture, released as the field was bound to release. */
  readonly releaseTheValue: (value: JsonValue) => void;
  /** Takes the input's own value off, as the field was bound to release. */
  readonly clearTheValue: () => void;
}

const SHOWS_NOTHING: ShownValue = Object.freeze({ value: null, comes_from: null });
const watchesNothing = () => () => undefined;

/** The binding of the own field of the input at `address`, and what it was bound under. */
interface OwnFieldBound {
  readonly binder: InputControlBinder | null;
  readonly address_key: string;
  readonly release: "commit" | "live";
  readonly binding: OwnFieldBinding | null;
}

function ownFieldBoundAt(binder: InputControlBinder | null, address: InputAddress, addressKey: string, release: "commit" | "live"): OwnFieldBound {
  return { binder, address_key: addressKey, release, binding: binder?.bindOwnField(address, release) ?? null };
}

/** The own field of the input at `address`, bound through the frame's binder; `null` where the frame gives no binder, so the field is only shown. */
export function useOwnFieldOfTheInput(address: InputAddress, release: "commit" | "live"): OwnFieldOfTheInput | null {
  const binder = useContext(InputControlBinderContext);
  const addressKey = inputAddressKey(address);
  const [bound, setBound] = useState(() => ownFieldBoundAt(binder, address, addressKey, release));
  // An equal address in a new reading keeps the binding; another input, binder or release binds again, while rendering.
  if (bound.binder !== binder || bound.address_key !== addressKey || bound.release !== release) setBound(ownFieldBoundAt(binder, address, addressKey, release));
  const { binding } = bound;
  const watchTheValue = useCallback((onChanged: () => void) => binding?.watchValue(onChanged) ?? watchesNothing(), [binding]);
  const readTheValue = useCallback(() => binding?.shownValue() ?? SHOWS_NOTHING, [binding]);
  const shown = useSyncExternalStore(watchTheValue, readTheValue);
  return useMemo(() => (binding === null ? null : { shown, releaseTheValue: (value) => binding.beginGesture().release(value), clearTheValue: () => binding.clear() }), [binding, shown]);
}
