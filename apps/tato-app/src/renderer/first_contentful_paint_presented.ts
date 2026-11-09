/**
 * Calls `afterThePaint` once the page's first paint with content has been presented, which the GPU process reaches only
 * after drawing that frame: a frame the page has committed can still be undrawn while macOS compiles its shaders.
 */
export function afterTheFirstContentfulPaintIsPresented(afterThePaint: () => void): void {
  const firstContentfulPaintObserver = new PerformanceObserver((paintEntries) => {
    if (paintEntries.getEntriesByName("first-contentful-paint").length === 0) return;
    firstContentfulPaintObserver.disconnect();
    afterThePaint();
  });
  firstContentfulPaintObserver.observe({ type: "paint", buffered: true });
}
