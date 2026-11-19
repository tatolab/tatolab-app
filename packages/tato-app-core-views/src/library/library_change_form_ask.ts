// What every Library form that changes the project through the runtime shares: its ask while pending, the refusal
// it came back with, the keys it answers, and its first control selected as it opens and again on a refusal.

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { ViewAskDone } from "@tatolab/tato-app-view-sdk";

/** A Library change form's ask and its state, for the form to lay out. */
export interface LibraryChangeFormAsk {
  formElement: RefObject<HTMLElement | null>;
  isAsking: boolean;
  refusal: string | null;
  /** Forget the refusal, as the person types again. */
  clearTheRefusal: () => void;
  /** Send `ask`, closing the form once it is done and showing its refusal otherwise; nothing while one is pending. */
  askIt: (ask: () => Promise<ViewAskDone>) => void;
  closeUnlessAsking: () => void;
  /** Escape closes the form while nothing is asked; Enter in its field sends `submit`. */
  answerTheKeyInTheForm: (keyboardEvent: KeyboardEvent<HTMLElement>, submit: () => void) => void;
}

/** The ask of a Library change form that `onClosed` closes; the form's input is selected as it opens, else the control `fallbackFocusSelector` matches. An answer arriving after the form closed changes nothing. */
export function useLibraryChangeFormAsk(onClosed: () => void, fallbackFocusSelector: string): LibraryChangeFormAsk {
  const formElement = useRef<HTMLElement>(null);
  const isOpen = useRef(true);
  const [isAsking, setIsAsking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const focusTheFormsFirstControl = () => {
    const field = formElement.current?.querySelector("input") ?? null;
    if (field !== null) field.select();
    else formElement.current?.querySelector<HTMLElement>(fallbackFocusSelector)?.focus();
  };
  useEffect(() => {
    isOpen.current = true;
    // A form atop a scrolled list is brought into view before its field takes the keys.
    formElement.current?.scrollIntoView?.({ block: "nearest" });
    focusTheFormsFirstControl();
    return () => {
      isOpen.current = false;
    };
  }, []);
  const askIt = (ask: () => Promise<ViewAskDone>) => {
    if (isAsking) return;
    setIsAsking(true);
    setRefusal(null);
    void ask().then((done) => {
      if (!isOpen.current) return;
      setIsAsking(false);
      if (done.kind === "done") {
        onClosed();
        return;
      }
      setRefusal(done.because);
      focusTheFormsFirstControl();
    });
  };
  const closeUnlessAsking = () => {
    if (!isAsking) onClosed();
  };
  const answerTheKeyInTheForm = (keyboardEvent: KeyboardEvent<HTMLElement>, submit: () => void) => {
    if (keyboardEvent.nativeEvent.isComposing) return;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeUnlessAsking();
      return;
    }
    if (keyboardEvent.key !== "Enter" || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    submit();
  };
  return { formElement, isAsking, refusal, clearTheRefusal: () => setRefusal(null), askIt, closeUnlessAsking, answerTheKeyInTheForm };
}
