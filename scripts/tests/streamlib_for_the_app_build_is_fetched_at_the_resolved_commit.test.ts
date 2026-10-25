// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// scripts/fetch-streamlib-for-the-app-build.sh resolves streamlib's main, or an explicit ref, to a
// commit and checks exactly that commit out where the build tells it, whatever was there before,
// keeping only cargo's target/. These tests fetch from a planted repository standing in for
// github.com/tatolab/streamlib.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FETCH_SCRIPT = path.join(REPOSITORY_ROOT, "scripts", "fetch-streamlib-for-the-app-build.sh");
const GIT_IDENTITY_ENVIRONMENT = {
  GIT_AUTHOR_NAME: "streamlib stand-in",
  GIT_AUTHOR_EMAIL: "stand-in@example.invalid",
  GIT_COMMITTER_NAME: "streamlib stand-in",
  GIT_COMMITTER_EMAIL: "stand-in@example.invalid",
};

interface ProgramOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runProgram(program: string, programArguments: string[], workingDirectory: string): Promise<ProgramOutcome> {
  return new Promise((resolveOutcome) => {
    execFile(program, programArguments, { cwd: workingDirectory, env: { ...process.env, ...GIT_IDENTITY_ENVIRONMENT } }, (programFailure, stdout, stderr) => {
      const exitCode = programFailure === null ? 0 : typeof programFailure.code === "number" ? programFailure.code : -1;
      resolveOutcome({ exitCode, stdout, stderr });
    });
  });
}

async function runGitIn(workingDirectory: string, gitArguments: string[]): Promise<string> {
  const gitOutcome = await runProgram("git", gitArguments, workingDirectory);
  expect(gitOutcome, `git ${gitArguments.join(" ")}`).toMatchObject({ exitCode: 0 });
  return gitOutcome.stdout.trim();
}

let scratchDirectory = "";
let streamlibStandInAuthoring = "";
let streamlibStandInUrl = "";
let fetchDestination = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-fetch-streamlib-"));
  streamlibStandInAuthoring = path.join(scratchDirectory, "streamlib-authoring");
  const streamlibStandInBare = path.join(scratchDirectory, "streamlib.git");
  streamlibStandInUrl = `file://${streamlibStandInBare}`;
  fetchDestination = path.join(scratchDirectory, "build", "streamlib");
  await mkdir(streamlibStandInAuthoring, { recursive: true });
  await runGitIn(streamlibStandInAuthoring, ["init", "-q", "-b", "main"]);
  await runGitIn(scratchDirectory, ["init", "-q", "--bare", "-b", "main", streamlibStandInBare]);
  await runGitIn(streamlibStandInAuthoring, ["remote", "add", "origin", streamlibStandInUrl]);
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

async function commitOnStreamlibMain(version: string): Promise<string> {
  await writeFile(path.join(streamlibStandInAuthoring, "VERSION"), `${version}\n`);
  await runGitIn(streamlibStandInAuthoring, ["add", "VERSION"]);
  await runGitIn(streamlibStandInAuthoring, ["commit", "-q", "-m", `release ${version}`]);
  await runGitIn(streamlibStandInAuthoring, ["push", "-q", "origin", "main"]);
  return runGitIn(streamlibStandInAuthoring, ["rev-parse", "HEAD"]);
}

async function tagOnStreamlib(tagName: string): Promise<void> {
  await runGitIn(streamlibStandInAuthoring, ["tag", tagName]);
  await runGitIn(streamlibStandInAuthoring, ["push", "-q", "origin", tagName]);
}

function fetchStreamlib(fetchFlags: string[] = []): Promise<ProgramOutcome> {
  return runProgram("bash", [FETCH_SCRIPT, fetchDestination, "--from-repository", streamlibStandInUrl, ...fetchFlags], REPOSITORY_ROOT);
}

function lastLineOf(output: string): string {
  return output.trim().split("\n").at(-1) ?? "";
}

test("with no ref it checks out the head of main and prints that commit", async () => {
  await commitOnStreamlibMain("0.55.3");
  const headOfMain = await commitOnStreamlibMain("0.55.4");
  const fetchOutcome = await fetchStreamlib();
  expect(fetchOutcome.exitCode).toBe(0);
  expect(lastLineOf(fetchOutcome.stdout)).toBe(headOfMain);
  expect(await runGitIn(fetchDestination, ["rev-parse", "HEAD"])).toBe(headOfMain);
  expect(await readFile(path.join(fetchDestination, "VERSION"), "utf8")).toBe("0.55.4\n");
});

test("an explicit tag checks out the commit it names", async () => {
  const taggedCommit = await commitOnStreamlibMain("0.55.3");
  await tagOnStreamlib("v0.55.3");
  await commitOnStreamlibMain("0.55.4");
  const fetchOutcome = await fetchStreamlib(["--streamlib-ref", "v0.55.3"]);
  expect(fetchOutcome.exitCode).toBe(0);
  expect(lastLineOf(fetchOutcome.stdout)).toBe(taggedCommit);
  expect(await readFile(path.join(fetchDestination, "VERSION"), "utf8")).toBe("0.55.3\n");
});

test("an explicit commit checks out that commit", async () => {
  const olderCommit = await commitOnStreamlibMain("0.55.3");
  await commitOnStreamlibMain("0.55.4");
  const fetchOutcome = await fetchStreamlib(["--streamlib-ref", olderCommit]);
  expect(fetchOutcome.exitCode).toBe(0);
  expect(lastLineOf(fetchOutcome.stdout)).toBe(olderCommit);
  expect(await runGitIn(fetchDestination, ["rev-parse", "HEAD"])).toBe(olderCommit);
});

test("a ref streamlib does not have is refused by name", async () => {
  await commitOnStreamlibMain("0.55.4");
  const fetchOutcome = await fetchStreamlib(["--streamlib-ref", "v9.9.9"]);
  expect(fetchOutcome.exitCode).toBe(1);
  expect(fetchOutcome.stderr).toContain("v9.9.9");
});

test("fetching again after main moves checks out the new head, keeps cargo's target/ and drops everything else", async () => {
  await commitOnStreamlibMain("0.55.3");
  expect(await fetchStreamlib()).toMatchObject({ exitCode: 0 });
  await mkdir(path.join(fetchDestination, "target"), { recursive: true });
  await writeFile(path.join(fetchDestination, "target", "cargo-cache-entry"), "kept\n");
  await writeFile(path.join(fetchDestination, "stray-untracked-file"), "dropped\n");
  await writeFile(path.join(fetchDestination, "VERSION"), "edited by hand\n");
  const newHeadOfMain = await commitOnStreamlibMain("0.55.4");
  const fetchOutcome = await fetchStreamlib();
  expect(fetchOutcome.exitCode).toBe(0);
  expect(lastLineOf(fetchOutcome.stdout)).toBe(newHeadOfMain);
  expect(await readFile(path.join(fetchDestination, "VERSION"), "utf8")).toBe("0.55.4\n");
  expect(await readFile(path.join(fetchDestination, "target", "cargo-cache-entry"), "utf8")).toBe("kept\n");
  await expect(readFile(path.join(fetchDestination, "stray-untracked-file"), "utf8")).rejects.toThrow();
});

test("a destination holding something other than a fetched streamlib is refused and left alone", async () => {
  await commitOnStreamlibMain("0.55.4");
  await mkdir(fetchDestination, { recursive: true });
  await writeFile(path.join(fetchDestination, "someone-elses-file"), "mine\n");
  const fetchOutcome = await fetchStreamlib();
  expect(fetchOutcome.exitCode).toBe(1);
  expect(await readFile(path.join(fetchDestination, "someone-elses-file"), "utf8")).toBe("mine\n");
});

test("--resolve-only prints the head of main and fetches nothing", async () => {
  const headOfMain = await commitOnStreamlibMain("0.55.4");
  const fetchOutcome = await fetchStreamlib(["--resolve-only"]);
  expect(fetchOutcome).toMatchObject({ exitCode: 0, stdout: `${headOfMain}\n` });
  await expect(readFile(path.join(fetchDestination, "VERSION"), "utf8")).rejects.toThrow();
});

test("a destination holding only cargo's target/, as a restored build cache leaves it, is fetched into and keeps target/", async () => {
  const headOfMain = await commitOnStreamlibMain("0.55.4");
  await mkdir(path.join(fetchDestination, "target"), { recursive: true });
  await writeFile(path.join(fetchDestination, "target", "cargo-cache-entry"), "kept\n");
  const fetchOutcome = await fetchStreamlib();
  expect(fetchOutcome.exitCode).toBe(0);
  expect(lastLineOf(fetchOutcome.stdout)).toBe(headOfMain);
  expect(await readFile(path.join(fetchDestination, "target", "cargo-cache-entry"), "utf8")).toBe("kept\n");
});

test("a destination that is some other git checkout is refused and left alone", async () => {
  await commitOnStreamlibMain("0.55.4");
  await mkdir(fetchDestination, { recursive: true });
  await runGitIn(fetchDestination, ["init", "-q"]);
  await writeFile(path.join(fetchDestination, "uncommitted-work"), "mine\n");
  const fetchOutcome = await fetchStreamlib();
  expect(fetchOutcome.exitCode).toBe(1);
  expect(await readFile(path.join(fetchDestination, "uncommitted-work"), "utf8")).toBe("mine\n");
});
