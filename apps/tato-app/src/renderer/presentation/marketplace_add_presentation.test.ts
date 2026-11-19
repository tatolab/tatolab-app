import { expect, test } from "vitest";
import { marketplaceAddFollowedOnceTold, marketplaceAddShownOf, MARKETPLACE_RATE_SAID_AFTER_MS, type MarketplaceAddFollowed } from "./marketplace_add_presentation";

const SHA256 = "9f2c1a7e4b3d8f6a0c5e2b1d7a9f3c8e6b4d2a0f1e3c5b7d9a8f6e4c2b0a1d3e";

function followedAt(stage: MarketplaceAddFollowed["stage"], elapsedMs: number): MarketplaceAddFollowed {
  return { stage, downloading_since_ms: 5_000, told_at_ms: 5_000 + elapsedMs, cancel: { kind: "not_asked" } };
}

test("a download that has read nothing yet says it is starting, with no share filled, and offers Cancel", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "downloading", bytes_read: 0, bytes_total: null }, 0), "Camera", "hallways");
  expect(shown).toMatchObject({ label: "Downloading Camera…", detail: "Starting the download…", percent: null, cancel: { kind: "offered", words: "Cancel", disabledReason: undefined } });
  expect(shown.parts).toEqual([
    { name: "Download", detail: "0.0 MB" },
    { name: "Check its SHA-256", detail: "Waiting" },
    { name: "Add to hallways", detail: "Waiting" },
    { name: "Nodes ready", detail: "Waiting" },
  ]);
});

test("a download of a known size says its bytes, rate and time left once it has run long enough, its share filled", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "downloading", bytes_read: 12_300_000, bytes_total: 40_000_000 }, 6_000), "Camera", "hallways");
  expect(shown).toMatchObject({ detail: "12.3 MB of 40.0 MB · 2.0 MB/s · about 14 s left", percent: 30.75, cancel: { kind: "offered", words: "Cancel", disabledReason: undefined } });
  expect(shown.parts[0]).toEqual({ name: "Download", detail: "12.3 MB of 40.0 MB" });
});

test("a download says no rate before it has run long enough to read one", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "downloading", bytes_read: 1_000_000, bytes_total: 40_000_000 }, MARKETPLACE_RATE_SAID_AFTER_MS - 1), "Camera", "hallways");
  expect(shown.detail).toBe("1.0 MB of 40.0 MB");
});

test("a download of no known size says its bytes and rate with no time left and no share filled", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "downloading", bytes_read: 3_000_000, bytes_total: null }, 2_000), "Camera", "hallways");
  expect(shown).toMatchObject({ detail: "3.0 MB · 1.5 MB/s", percent: null });
});

test("a long download says its time left in minutes", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "downloading", bytes_read: 1_000_000, bytes_total: 400_000_000 }, 2_000), "Camera", "hallways");
  expect(shown.detail).toBe("1.0 MB of 400.0 MB · 0.5 MB/s · about 13 min left");
});

test("checking names the catalog's SHA-256, the download done, and offers no Cancel", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "verifying", sha256: SHA256 }, 9_000), "Camera", "hallways");
  expect(shown).toMatchObject({ label: "Checking Camera against its SHA-256…", detail: `The catalog's SHA-256: ${SHA256}`, percent: null, cancel: { kind: "not_offered" } });
  expect(shown.parts.map((part) => part.detail)).toEqual(["Done", "Checking", "Waiting", "Waiting"]);
});

test("adding names the project, the check matched, and offers no Cancel", () => {
  const shown = marketplaceAddShownOf(followedAt({ kind: "adding" }, 9_500), "Camera", "hallways");
  expect(shown).toMatchObject({ label: "Adding Camera to hallways…", cancel: { kind: "not_offered" } });
  expect(shown.parts.map((part) => part.detail)).toEqual(["Done", "Matches", "Adding", "Waiting"]);
});

test("each stage told keeps when the download began and the Cancel pressed, and starts a new add's clock at its first", () => {
  const first = marketplaceAddFollowedOnceTold(null, { kind: "downloading", bytes_read: 0, bytes_total: 10 }, 100);
  expect(first).toEqual({ stage: { kind: "downloading", bytes_read: 0, bytes_total: 10 }, downloading_since_ms: 100, told_at_ms: 100, cancel: { kind: "not_asked" } });
  const later = marketplaceAddFollowedOnceTold({ ...first, cancel: { kind: "asked" } }, { kind: "downloading", bytes_read: 5, bytes_total: 10 }, 900);
  expect(later).toEqual({ stage: { kind: "downloading", bytes_read: 5, bytes_total: 10 }, downloading_since_ms: 100, told_at_ms: 900, cancel: { kind: "asked" } });
});

test("a pressed Cancel greys while it is answered, and a refused one says why under the meter once the download is done", () => {
  const downloading = followedAt({ kind: "downloading", bytes_read: 1_000_000, bytes_total: 40_000_000 }, 2_000);
  expect(marketplaceAddShownOf({ ...downloading, cancel: { kind: "asked" } }, "Camera", "hallways")).toMatchObject({
    cancel: { kind: "offered", words: "Cancelling…", disabledReason: "Cancelling the download…" },
    cancelRefusedBecause: null,
  });
  const refused = { kind: "refused" as const, because: "tatolab-camera is downloaded already and being added; it can no longer be cancelled." };
  expect(marketplaceAddShownOf({ ...followedAt({ kind: "verifying", sha256: SHA256 }, 9_000), cancel: refused }, "Camera", "hallways")).toMatchObject({
    cancel: { kind: "not_offered" },
    cancelRefusedBecause: refused.because,
  });
});
