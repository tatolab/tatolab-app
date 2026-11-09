import { expect, test } from "vitest";
import { TATOLAB_APP_BUILD_FEATURES, tatolabAppBuildForTheWindow } from "./tatolab_app_build_features.js";

test("the committed build features, which electron-vite dev runs with, carry no build id", () => {
  expect(TATOLAB_APP_BUILD_FEATURES.tatolabAppBuildId).toBeNull();
  expect(tatolabAppBuildForTheWindow(TATOLAB_APP_BUILD_FEATURES.tatolabAppBuildId)).toBeNull();
});

test("a build id reaches the window as the status's app_build", () => {
  expect(
    tatolabAppBuildForTheWindow({ tatolabAppCommit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", buildKind: "release", builtWithUncommittedChanges: true }),
  ).toEqual({ tatolab_app_commit: "22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1", build_kind: "release", built_with_uncommitted_changes: true });
});
