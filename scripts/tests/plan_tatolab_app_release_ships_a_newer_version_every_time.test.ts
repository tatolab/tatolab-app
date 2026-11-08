import { expect, test } from "vitest";
import { compareSemver, planTatolabAppRelease, versionOfTheUpdateManifest } from "../plan_tatolab_app_release.mjs";

test("a merge to main ships the bundled runtime's version when it is newer than every app shipped", () => {
  expect(planTatolabAppRelease({ trigger: "push", streamlibVersion: "0.68.34", publishedRelease: { appVersion: "0.55.4", streamlibVersion: null } })).toMatchObject({
    shouldRelease: true,
    appVersion: "0.68.34",
  });
});

test("a merge to main with no new streamlib release ships the next patch of the last app version", () => {
  expect(planTatolabAppRelease({ trigger: "push", streamlibVersion: "0.68.34", publishedRelease: { appVersion: "0.68.34", streamlibVersion: "0.68.34" } })).toMatchObject({
    shouldRelease: true,
    appVersion: "0.68.35",
  });
  expect(planTatolabAppRelease({ trigger: "push", streamlibVersion: "0.68.35", publishedRelease: { appVersion: "0.68.35", streamlibVersion: "0.68.34" } })).toMatchObject({
    appVersion: "0.68.36",
  });
});

test("the scheduled run ships only when streamlib has released since the app last shipped", () => {
  expect(planTatolabAppRelease({ trigger: "schedule", streamlibVersion: "0.68.34", publishedRelease: { appVersion: "0.68.35", streamlibVersion: "0.68.34" } })).toMatchObject({
    shouldRelease: false,
  });
  expect(planTatolabAppRelease({ trigger: "schedule", streamlibVersion: "0.69.0", publishedRelease: { appVersion: "0.68.35", streamlibVersion: "0.68.34" } })).toMatchObject({
    shouldRelease: true,
    appVersion: "0.69.0",
  });
});

test("a feed that has shipped nothing ships the bundled runtime's version", () => {
  expect(planTatolabAppRelease({ trigger: "schedule", streamlibVersion: "0.68.34", publishedRelease: null })).toMatchObject({ shouldRelease: true, appVersion: "0.68.34" });
});

test("versions compare by number, and a manifest's version line is read", () => {
  expect(compareSemver("0.68.10", "0.68.9")).toBeGreaterThan(0);
  expect(compareSemver("0.9.0", "0.10.0")).toBeLessThan(0);
  expect(versionOfTheUpdateManifest("version: 0.55.4\nfiles:\n  - url: ../releases/0.55.4/x.zip\n")).toBe("0.55.4");
});
