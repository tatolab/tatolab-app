// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useViewReadingSoFar } from "./view_readings";

afterEach(cleanup);

/** A watch whose readings the test sends, as Studio's bridge would. */
function watchTheTestSends<Reading>() {
  const listeners = new Set<(reading: Reading) => void>();
  return {
    watch: (listener: (reading: Reading) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    send: (reading: Reading) => act(() => listeners.forEach((listener) => listener(reading))),
  };
}

describe("a watched reading so far", () => {
  it("tells a reading not yet given from a reading of null", () => {
    const activeTab = watchTheTestSends<{ stream: string } | null>();
    const { result } = renderHook(() => useViewReadingSoFar(activeTab.watch));
    expect(result.current).toEqual({ kind: "not_read_yet" });

    activeTab.send(null);
    expect(result.current).toEqual({ kind: "read", reading: null });

    activeTab.send({ stream: "camera" });
    expect(result.current).toEqual({ kind: "read", reading: { stream: "camera" } });
  });

  it("forgets the reading of a watch it no longer holds", () => {
    const firstProject = watchTheTestSends<string>();
    const secondProject = watchTheTestSends<string>();
    const { result, rerender } = renderHook(({ watch }) => useViewReadingSoFar(watch), { initialProps: { watch: firstProject.watch } });
    firstProject.send("first");

    rerender({ watch: secondProject.watch });
    expect(result.current).toEqual({ kind: "not_read_yet" });
    firstProject.send("first again");
    expect(result.current).toEqual({ kind: "not_read_yet" });
  });
});
