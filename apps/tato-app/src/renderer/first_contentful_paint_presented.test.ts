// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { afterTheFirstContentfulPaintIsPresented } from "./first_contentful_paint_presented";

/** A `PerformanceObserver` whose paint entries the test reports, by name, as Chromium reports each presented paint. */
function stubPaintTimingObserver() {
  const observers: { reportPaints: (paintNames: string[]) => void; observedOptions: PerformanceObserverInit | undefined; disconnected: boolean }[] = [];
  class PaintTimingObserverAsTheTestReportsIt {
    private readonly observerRecord: (typeof observers)[number];
    constructor(paintCallback: (paintEntries: { getEntriesByName(paintName: string): unknown[] }) => void) {
      this.observerRecord = {
        reportPaints: (paintNames) => {
          if (!this.observerRecord.disconnected) {
            paintCallback({ getEntriesByName: (paintName) => paintNames.filter((reportedName) => reportedName === paintName) });
          }
        },
        observedOptions: undefined,
        disconnected: false,
      };
      observers.push(this.observerRecord);
    }
    observe(observedOptions: PerformanceObserverInit) {
      this.observerRecord.observedOptions = observedOptions;
    }
    disconnect() {
      this.observerRecord.disconnected = true;
    }
  }
  vi.stubGlobal("PerformanceObserver", PaintTimingObserverAsTheTestReportsIt);
  return observers;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("waits past a paint with no content, then calls once the first contentful paint is presented, and stops observing", () => {
  const observers = stubPaintTimingObserver();
  let timesCalled = 0;

  afterTheFirstContentfulPaintIsPresented(() => {
    timesCalled += 1;
  });
  const [paintObserver] = observers;
  paintObserver?.reportPaints(["first-paint"]);
  expect(timesCalled).toBe(0);
  paintObserver?.reportPaints(["first-contentful-paint"]);
  paintObserver?.reportPaints(["first-contentful-paint"]);

  expect(timesCalled).toBe(1);
  expect(paintObserver?.observedOptions).toEqual({ type: "paint", buffered: true });
  expect(paintObserver?.disconnected).toBe(true);
});
