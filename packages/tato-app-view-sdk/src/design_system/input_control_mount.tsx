import { cn } from "cn";
import { createContext, memo, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { areTheSameControlledInput, type ControlledInput } from "../pin_model/controlled_inputs";
import type { NodeUiSurface } from "../node_ui/input_control_element";
import type { InputControlBinder, InputControlBinding, InputControlShown } from "../pin_services/input_control_binding";

/** The frame's one binder, which every control slot binds through; `null` draws each slot's own field. */
export const InputControlBinderContext = createContext<InputControlBinder | null>(null);

interface InputControlMountProps {
  input: ControlledInput;
  surface: NodeUiSurface;
  readOnly: boolean;
  /** What the slot draws while the table has no control for the input, or no binder is given: the surface's own field for it. It is drawn from `input`, so it changes only with it. */
  fallback: ReactNode;
  className?: string;
}

/** Stops a key at the slot, so a focused control owns the keyboard and no shortcut of the panel around it acts on the key. */
function keptByTheControl(keyEvent: KeyboardEvent): void {
  keyEvent.stopPropagation();
}

/**
 * The slot one input's control is drawn in. It binds through the frame's binder in a layout effect and never sees a value:
 * the binder sets each one on the element. Its host carries `nodrag nopan`, so a drag inside the control moves neither a
 * card nor the canvas, lets the wheel through, so the wheel still zooms the canvas, and stops `keydown` at itself.
 */
export const InputControlMount = memo(function InputControlMount({ input, surface, readOnly, fallback, className }: InputControlMountProps) {
  const binder = useContext(InputControlBinderContext);
  const hostElement = useRef<HTMLDivElement>(null);
  const binding = useRef<InputControlBinding | null>(null);
  const latest = useRef({ input, surface, readOnly });
  latest.current = { input, surface, readOnly };
  const [shown, setShown] = useState<InputControlShown>("pending");
  useLayoutEffect(() => {
    const host = hostElement.current;
    if (binder === null || host === null) return;
    host.addEventListener("keydown", keptByTheControl);
    const { input: boundInput, surface: boundSurface, readOnly: isBoundReadOnly } = latest.current;
    const bound = binder.bindInputControl(host, boundInput, { surface: boundSurface, read_only: isBoundReadOnly }, setShown);
    binding.current = bound;
    return () => {
      binding.current = null;
      bound.unbind();
      host.removeEventListener("keydown", keptByTheControl);
    };
  }, [binder]);
  useLayoutEffect(() => {
    binding.current?.update(input, { surface, read_only: readOnly });
  }, [input, surface, readOnly]);
  const drawsTheFallback = binder === null || shown === "no_control";
  return (
    <>
      {drawsTheFallback && fallback}
      <div ref={hostElement} className={cn("nodrag nopan min-w-0", drawsTheFallback && "hidden", className)} data-input-control={input.address.input} data-input-control-shows={shown} />
    </>
  );
}, haveTheSameInputAndPlace);

/** Whether a slot is told the same input at the same place, so a new reading's equal input draws it again for nothing. */
function haveTheSameInputAndPlace(before: InputControlMountProps, after: InputControlMountProps): boolean {
  return areTheSameControlledInput(before.input, after.input) && before.surface === after.surface && before.readOnly === after.readOnly && before.className === after.className;
}
