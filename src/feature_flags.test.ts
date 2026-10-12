import { afterEach, describe, expect, it, vi } from "vitest";
import { readTatolabFrontendFeatureFlags } from "./feature_flags";

const WATCH_QUERY = new URLSearchParams("feature=watch-exposed-output");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readTatolabFrontendFeatureFlags", () => {
  it("keeps Watch off by default", () => {
    expect(readTatolabFrontendFeatureFlags(true, new URLSearchParams()).watchExposedOutput).toBe(false);
    expect(readTatolabFrontendFeatureFlags(false, new URLSearchParams()).watchExposedOutput).toBe(false);
  });

  it("turns Watch on in the browser mock when the page asks, among other features", () => {
    expect(readTatolabFrontendFeatureFlags(false, WATCH_QUERY).watchExposedOutput).toBe(true);
    expect(
      readTatolabFrontendFeatureFlags(false, new URLSearchParams("feature=other&feature=watch-exposed-output")).watchExposedOutput,
    ).toBe(true);
  });

  it("ignores the page's query inside Tauri, so a shipped app cannot be flipped at runtime", () => {
    expect(readTatolabFrontendFeatureFlags(true, WATCH_QUERY).watchExposedOutput).toBe(false);
  });

  it("turns Watch on for a build made with its environment variable", () => {
    vi.stubEnv("VITE_TATOLAB_FEATURE_WATCH_EXPOSED_OUTPUT", "1");
    expect(readTatolabFrontendFeatureFlags(true, new URLSearchParams()).watchExposedOutput).toBe(true);
  });
});
