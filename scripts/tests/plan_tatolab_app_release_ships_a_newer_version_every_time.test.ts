import { expect, test } from "vitest";
import { compareSemver, planTatolabAppRelease, versionOfTheUpdateManifest } from "../plan_tatolab_app_release.mjs";

test("a release ships the bundled runtime's version when it is newer than every app shipped", () => {
  expect(planTatolabAppRelease({ streamlibVersion: "0.68.34", publishedAppVersion: "0.55.4" })).toEqual({ appVersion: "0.68.34" });
  expect(planTatolabAppRelease({ streamlibVersion: "0.69.0", publishedAppVersion: "0.68.35" })).toEqual({ appVersion: "0.69.0" });
});

test("a release over a runtime the app already shipped takes the last app version's next patch", () => {
  expect(planTatolabAppRelease({ streamlibVersion: "0.68.34", publishedAppVersion: "0.68.34" })).toEqual({ appVersion: "0.68.35" });
  expect(planTatolabAppRelease({ streamlibVersion: "0.68.35", publishedAppVersion: "0.68.35" })).toEqual({ appVersion: "0.68.36" });
});

test("a feed that has shipped nothing ships the bundled runtime's version", () => {
  expect(planTatolabAppRelease({ streamlibVersion: "0.68.34", publishedAppVersion: null })).toEqual({ appVersion: "0.68.34" });
});

test("versions compare by number, and a manifest's version line is read", () => {
  expect(compareSemver("0.68.10", "0.68.9")).toBeGreaterThan(0);
  expect(compareSemver("0.9.0", "0.10.0")).toBeLessThan(0);
  expect(versionOfTheUpdateManifest("version: 0.55.4\nfiles:\n  - url: releases/0.55.4/x.zip\n")).toBe("0.55.4");
});
