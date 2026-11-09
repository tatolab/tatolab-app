import { useLayoutEffect, useState } from "react";

/** The latest reading `watch` gives, re-rendering the caller on each; `null` until the first arrives. `watch` must keep its identity between renders. */
export function useViewReading<Reading>(watch: (listener: (reading: Reading) => void) => () => void): Reading | null {
  const [reading, setReading] = useState<{ latest: Reading } | null>(null);
  useLayoutEffect(() => watch((latest) => setReading({ latest })), [watch]);
  return reading === null ? null : reading.latest;
}
