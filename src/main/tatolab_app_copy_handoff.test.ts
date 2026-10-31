import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { TatolabAppBuild } from "../shared/tatolab_backend_contract.js";
import {
  isAnotherBuildOfTatolab,
  streamlibCommitTheAppCarries,
  tatolabAppCopyHandedOverOnTheSingleInstanceLock,
  tatolabAppCopyOnTheSingleInstanceLock,
  type TatolabAppCopy,
} from "./tatolab_app_copy_handoff.js";

const RUNNING_APP_BUILD: TatolabAppBuild = { tatolab_app_commit: "1111111111111111111111111111111111111111", build_kind: "release", built_with_uncommitted_changes: false };
const RUNNING_COPY: TatolabAppCopy = {
  executableThatOpensTheCopy: "/Applications/Tatolab.app/Contents/MacOS/Tatolab",
  appVersion: "0.66.0",
  appBuild: RUNNING_APP_BUILD,
  carriedStreamlibCommit: "2222222222222222222222222222222222222222",
};

describe("the copy handed over on the single-instance lock", () => {
  test("reads back as the copy that handed it over, after Electron's structured clone", () => {
    expect(tatolabAppCopyHandedOverOnTheSingleInstanceLock(structuredClone(tatolabAppCopyOnTheSingleInstanceLock(RUNNING_COPY)))).toEqual(RUNNING_COPY);
  });

  test("reads back a copy without a build id or a carried runtime", () => {
    const copyWithoutABuild: TatolabAppCopy = { ...RUNNING_COPY, appBuild: null, carriedStreamlibCommit: null };
    expect(tatolabAppCopyHandedOverOnTheSingleInstanceLock(tatolabAppCopyOnTheSingleInstanceLock(copyWithoutABuild))).toEqual(copyWithoutABuild);
  });

  test.each([
    ["nothing", undefined],
    ["an empty object, as a copy older than the handoff hands over", {}],
    ["a copy without an executable", { tatolab_app_copy: { executable_that_opens_the_copy: "", app_version: "0.66.0", app_build: null, carried_streamlib_commit: null } }],
    ["a copy whose version is not text", { tatolab_app_copy: { executable_that_opens_the_copy: "/x", app_version: 66, app_build: null, carried_streamlib_commit: null } }],
    ["a copy whose build kind is unknown", { tatolab_app_copy: { executable_that_opens_the_copy: "/x", app_version: "0.66.0", app_build: { tatolab_app_commit: "1", build_kind: "nightly", built_with_uncommitted_changes: false }, carried_streamlib_commit: null } }],
  ])("is no copy when it holds %s", (_whatItHolds, additionalDataOnTheLock) => {
    expect(tatolabAppCopyHandedOverOnTheSingleInstanceLock(additionalDataOnTheLock)).toBeNull();
  });
});

describe("whether the opened copy is another build", () => {
  test("the same build at another path is the same build", () => {
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, { ...RUNNING_COPY, executableThatOpensTheCopy: "/Users/someone/Downloads/Tatolab.app/Contents/MacOS/Tatolab" })).toBe(false);
  });

  test("another version is another build, newer or older", () => {
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, { ...RUNNING_COPY, appVersion: "0.67.0" })).toBe(true);
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, { ...RUNNING_COPY, appVersion: "0.65.0" })).toBe(true);
  });

  test("the same version at another streamlib commit or tatolab-app commit is another build", () => {
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, { ...RUNNING_COPY, carriedStreamlibCommit: "3333333333333333333333333333333333333333" })).toBe(true);
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, { ...RUNNING_COPY, carriedStreamlibCommit: null })).toBe(true);
    const otherAppCommit: TatolabAppCopy = { ...RUNNING_COPY, appBuild: { ...RUNNING_APP_BUILD, tatolab_app_commit: "4444444444444444444444444444444444444444" } };
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, otherAppCommit)).toBe(true);
  });

  test("a build with uncommitted changes is always another build", () => {
    const builtWithUncommittedChanges: TatolabAppCopy = { ...RUNNING_COPY, appBuild: { ...RUNNING_APP_BUILD, build_kind: "dev", built_with_uncommitted_changes: true } };
    expect(isAnotherBuildOfTatolab(builtWithUncommittedChanges, builtWithUncommittedChanges)).toBe(true);
  });

  test("a copy without a build id, as electron-vite dev runs, counts as the same", () => {
    expect(isAnotherBuildOfTatolab({ ...RUNNING_COPY, appBuild: null }, { ...RUNNING_COPY, appVersion: "0.67.0" })).toBe(false);
    expect(isAnotherBuildOfTatolab(RUNNING_COPY, { ...RUNNING_COPY, appBuild: null })).toBe(false);
  });
});

describe("the streamlib commit the app carries", () => {
  const resourcesDirectories: string[] = [];
  afterEach(async () => {
    for (const resourcesDirectory of resourcesDirectories.splice(0)) await rm(resourcesDirectory, { recursive: true, force: true });
  });

  async function streamlibCommitFileHolding(streamlibCommitFileContents: string | null): Promise<string> {
    const resourcesDirectory = await mkdtemp(path.join(os.tmpdir(), "tl-app-resources-"));
    resourcesDirectories.push(resourcesDirectory);
    const streamlibCommitFile = path.join(resourcesDirectory, "streamlib-commit");
    if (streamlibCommitFileContents !== null) await writeFile(streamlibCommitFile, streamlibCommitFileContents);
    return streamlibCommitFile;
  }

  test("is the commit the file names, without its line ending", async () => {
    expect(await streamlibCommitTheAppCarries(await streamlibCommitFileHolding("2222222222222222222222222222222222222222\n"))).toBe("2222222222222222222222222222222222222222");
  });

  test("is none when the app carries no file or an empty one", async () => {
    expect(await streamlibCommitTheAppCarries(await streamlibCommitFileHolding(null))).toBeNull();
    expect(await streamlibCommitTheAppCarries(await streamlibCommitFileHolding(""))).toBeNull();
    expect(await streamlibCommitTheAppCarries(null), "a build that carries no runtime").toBeNull();
  });
});
