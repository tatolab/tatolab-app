import { useLayoutEffect, useState } from "react";

/** A watched reading so far: none yet, or the latest `watch` gave, which may itself be `null`. */
export type ViewReadingSoFar<Reading> = { kind: "not_read_yet" } | { kind: "read"; reading: Reading };

const NOT_READ_YET = { kind: "not_read_yet" } as const;

/** The latest reading `watch` gives, or `not_read_yet` until the first arrives, re-rendering the caller on each. `watch` must keep its identity between renders. */
export function useViewReadingSoFar<Reading>(watch: (listener: (reading: Reading) => void) => () => void): ViewReadingSoFar<Reading> {
  const [readingSoFar, setReadingSoFar] = useState<ViewReadingSoFar<Reading>>(NOT_READ_YET);
  useLayoutEffect(() => {
    setReadingSoFar(NOT_READ_YET);
    return watch((reading) => setReadingSoFar({ kind: "read", reading }));
  }, [watch]);
  return readingSoFar;
}

/** The latest reading `watch` gives, re-rendering the caller on each; `null` until the first arrives, so a reading that can itself be `null` takes {@link useViewReadingSoFar}. `watch` must keep its identity between renders. */
export function useViewReading<Reading>(watch: (listener: (reading: Reading) => void) => () => void): Reading | null {
  const readingSoFar = useViewReadingSoFar(watch);
  return readingSoFar.kind === "read" ? readingSoFar.reading : null;
}
