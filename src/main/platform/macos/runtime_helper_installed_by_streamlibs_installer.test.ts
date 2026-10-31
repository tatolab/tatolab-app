import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith, succeeded, type Result } from "../../result.js";
import type { ProgramCompletion, ProgramRunner } from "../run_program_to_completion.js";
import type { ProgramRunnerStreamingItsLines } from "../run_program_streaming_its_lines.js";
import { RuntimeHelperInstalledByStreamlibsInstaller, theInstallersOwnRefusal } from "./runtime_helper_installed_by_streamlibs_installer.js";

const STREAMLIB_COMMIT = "1111111111111111111111111111111111111111";

function programEnded(exitStatus: number, standardOutput = "", standardError = ""): ProgramCompletion {
  return { exitStatus, endingSignal: null, standardOutput, standardError };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** An app bundle carrying a helper whose commit file names `streamlibCommit`, and an install folder whose `current` names `installedBuild`. */
async function appAndInstallFolder(streamlibCommit: string | null, installedBuild: string | null) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tl-carried-runtime-"));
  temporaryDirectories.push(root);
  const appBundle = path.join(root, "Tatolab.app");
  const helperResources = path.join(appBundle, "Contents", "Helpers", "Tatolab Runtime.app", "Contents", "Resources");
  await mkdir(helperResources, { recursive: true });
  if (streamlibCommit !== null) await writeFile(path.join(helperResources, "streamlib-commit"), `${streamlibCommit}\n`);
  const runtimeInstallDirectory = path.join(root, "com.tatolab.runtime");
  await mkdir(runtimeInstallDirectory);
  if (installedBuild !== null) await symlink(installedBuild, path.join(runtimeInstallDirectory, "current"));
  return { appBundle, runtimeInstallDirectory };
}

function carriedRuntimeAnsweringItsVersion(versionAnswer: Result<ProgramCompletion, string>) {
  const programRuns: string[] = [];
  const programRunner: ProgramRunner = async (programPath, programArguments) => {
    programRuns.push([programPath, ...programArguments].join(" "));
    return versionAnswer;
  };
  return { programRunner, programRuns };
}

const NO_INSTALLER_RUN: ProgramRunnerStreamingItsLines = async () => failedWith("the installer was not to be run");

test("the_carried_build_is_its_tatolabds_version_and_its_commit_and_the_installed_build_is_what_current_names", async () => {
  const { appBundle, runtimeInstallDirectory } = await appAndInstallFolder(STREAMLIB_COMMIT, `0.67.0-${"2".repeat(40)}`);
  const { programRunner, programRuns } = carriedRuntimeAnsweringItsVersion(succeeded(programEnded(0, "tatolabd 0.68.0\n")));
  const install = new RuntimeHelperInstalledByStreamlibsInstaller(appBundle, runtimeInstallDirectory, {}, programRunner, NO_INSTALLER_RUN);

  expect(await install.carriedAndInstalledRuntimeBuilds()).toEqual(
    succeeded({
      carriedRuntimeBuild: `0.68.0-${STREAMLIB_COMMIT}`,
      installedRuntimeBuild: `0.67.0-${"2".repeat(40)}`,
    }),
  );
  expect(programRuns).toEqual([`${appBundle}/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd --version`]);
});

test("nothing_is_installed_before_the_installer_made_current", async () => {
  const { appBundle, runtimeInstallDirectory } = await appAndInstallFolder(STREAMLIB_COMMIT, null);
  const install = new RuntimeHelperInstalledByStreamlibsInstaller(
    appBundle,
    runtimeInstallDirectory,
    {},
    carriedRuntimeAnsweringItsVersion(succeeded(programEnded(0, "tatolabd 0.68.0\n"))).programRunner,
    NO_INSTALLER_RUN,
  );

  expect(await install.carriedAndInstalledRuntimeBuilds()).toEqual(
    succeeded({
      carriedRuntimeBuild: `0.68.0-${STREAMLIB_COMMIT}`,
      installedRuntimeBuild: null,
    }),
  );
});

test("a_carried_runtime_that_cannot_name_its_build_is_refused_in_words", async () => {
  const withoutCommit = await appAndInstallFolder(null, null);
  const answering = carriedRuntimeAnsweringItsVersion(succeeded(programEnded(0, "tatolabd 0.68.0\n"))).programRunner;
  const noCommit = await new RuntimeHelperInstalledByStreamlibsInstaller(
    withoutCommit.appBundle,
    withoutCommit.runtimeInstallDirectory,
    {},
    answering,
    NO_INSTALLER_RUN,
  ).carriedAndInstalledRuntimeBuilds();
  expect(noCommit.ok ? "" : noCommit.failure).toMatch(/streamlib-commit could not be read: .*ENOENT/);

  const { appBundle, runtimeInstallDirectory } = await appAndInstallFolder(STREAMLIB_COMMIT, null);
  const crashing = carriedRuntimeAnsweringItsVersion(
    succeeded({
      exitStatus: null,
      endingSignal: "SIGKILL",
      standardOutput: "",
      standardError: "",
    }),
  ).programRunner;
  const killed = await new RuntimeHelperInstalledByStreamlibsInstaller(
    appBundle,
    runtimeInstallDirectory,
    {},
    crashing,
    NO_INSTALLER_RUN,
  ).carriedAndInstalledRuntimeBuilds();
  expect(killed.ok ? "" : killed.failure).toMatch(
    /^the runtime the app carries did not name its version: .*tatolabd ended with signal: 9 \(SIGKILL\)$/,
  );

  const unnamed = carriedRuntimeAnsweringItsVersion(succeeded(programEnded(0, "something else\n"))).programRunner;
  expect(
    await new RuntimeHelperInstalledByStreamlibsInstaller(
      appBundle,
      runtimeInstallDirectory,
      {},
      unnamed,
      NO_INSTALLER_RUN,
    ).carriedAndInstalledRuntimeBuilds(),
  ).toEqual(failedWith("the runtime the app carries named no version: something else"));
});

test("installing_runs_the_carried_installer_on_the_carried_unit_with_the_builds_environment_streaming_its_lines", async () => {
  const { appBundle, runtimeInstallDirectory } = await appAndInstallFolder(STREAMLIB_COMMIT, null);
  const installerRuns: {
    programPath: string;
    programArguments: readonly string[];
    environmentVariablesAdded: Readonly<Record<string, string>> | undefined;
  }[] = [];
  const installerRunner: ProgramRunnerStreamingItsLines = async (programPath, programArguments, onProgramLine, environmentVariablesAdded) => {
    installerRuns.push({
      programPath,
      programArguments,
      environmentVariablesAdded,
    });
    onProgramLine("Stopping the runtime");
    onProgramLine("Starting Tatolab 0.68.0");
    return succeeded(programEnded(0));
  };
  const install = new RuntimeHelperInstalledByStreamlibsInstaller(
    appBundle,
    runtimeInstallDirectory,
    { TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof" },
    carriedRuntimeAnsweringItsVersion(failedWith("not asked")).programRunner,
    installerRunner,
  );
  const installerLines: string[] = [];

  expect(await install.installTheCarriedRuntime((installerLine) => installerLines.push(installerLine))).toEqual(succeeded(undefined));

  expect(installerRuns).toEqual([
    {
      programPath: "/bin/sh",
      programArguments: [`${appBundle}/Contents/Resources/install.sh`, "--from-unit", `${appBundle}/Contents/Helpers`],
      environmentVariablesAdded: {
        TATOLAB_TEST_MACHINE_ROOT: "/tmp/tatolab-proof",
      },
    },
  ]);
  expect(installerLines).toEqual(["Stopping the runtime", "Starting Tatolab 0.68.0"]);
});

test("an_installer_that_fails_is_answered_in_its_own_words_and_one_that_cannot_start_in_why", async () => {
  const { appBundle, runtimeInstallDirectory } = await appAndInstallFolder(STREAMLIB_COMMIT, null);
  const failing: ProgramRunnerStreamingItsLines = async () =>
    succeeded(
      programEnded(
        1,
        "Starting Tatolab\n",
        "tatolab install: warning: something minor\nBootstrap failed: 5: Input/output error\ntatolab install: Tatolab 0.68.0 did not start; Tatolab 0.67.0 is running again\n",
      ),
    );
  const unused = carriedRuntimeAnsweringItsVersion(failedWith("not asked")).programRunner;
  expect(
    await new RuntimeHelperInstalledByStreamlibsInstaller(appBundle, runtimeInstallDirectory, {}, unused, failing).installTheCarriedRuntime(() => {}),
  ).toEqual(failedWith("tatolab install: Tatolab 0.68.0 did not start; Tatolab 0.67.0 is running again"));

  const notStarting: ProgramRunnerStreamingItsLines = async () => failedWith("/bin/sh could not be run: spawn EACCES");
  expect(
    await new RuntimeHelperInstalledByStreamlibsInstaller(appBundle, runtimeInstallDirectory, {}, unused, notStarting).installTheCarriedRuntime(
      () => {},
    ),
  ).toEqual(failedWith("/bin/sh could not be run: spawn EACCES"));
});

test("an_installer_that_says_nothing_of_its_own_is_answered_by_how_it_ended", () => {
  expect(theInstallersOwnRefusal(programEnded(2, "", ""))).toBe("install.sh ended with exit status: 2");
  expect(theInstallersOwnRefusal(programEnded(1, "", "sh: install.sh: Permission denied\n"))).toBe("sh: install.sh: Permission denied");
});
