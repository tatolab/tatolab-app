import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { BundledPythonToolchain } from "./platform/bundled_python_toolchain.js";
import type { ProgramCompletion, ProgramRunOptions } from "./platform/run_program_to_completion.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { PYTHON_INTERPRETER_CHOICE_FILE_NAME, StreamProjectPythonEnvironments } from "./stream_project_python_environments.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const BUILT_IN_PYTHON_FOLDER_NAME = "cpython-3.12.12+20251014";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function temporaryFolder(prefix: string): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryFolders.push(folder);
  return folder;
}

async function isAFile(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    (metadata) => metadata.isFile(),
    () => false,
  );
}

function exitedWith(exitStatus: number, standardError = "", standardOutput = ""): Result<ProgramCompletion, string> {
  return succeeded({ exitStatus, endingSignal: null, standardOutput, standardError });
}

interface ProgramRun {
  programPath: string;
  programArguments: readonly string[];
  programRunOptions: ProgramRunOptions | undefined;
}

/** The app's resources, with a uv and a built-in Python whose Mach-O stand-in is a link into a folder beside it, as the macOS bundle lays it out. */
async function bundledPythonToolchainInATemporaryApp(): Promise<Extract<BundledPythonToolchain, { kind: "in_the_app" }>> {
  const appResources = await temporaryFolder("tl-app-resources-");
  const builtInPythonInTheApp = path.join(appResources, "python", BUILT_IN_PYTHON_FOLDER_NAME);
  await mkdir(path.join(builtInPythonInTheApp, "bin"), { recursive: true });
  await mkdir(path.join(appResources, "frameworks"), { recursive: true });
  await writeFile(path.join(appResources, "frameworks", "python3.12"), "the interpreter", { mode: 0o755 });
  await symlink(path.join("..", "..", "..", "frameworks", "python3.12"), path.join(builtInPythonInTheApp, "bin", "python3"));
  await mkdir(path.join(builtInPythonInTheApp, "lib", "python3.12"), { recursive: true });
  await writeFile(path.join(builtInPythonInTheApp, "lib", "python3.12", "os.py"), "# the standard library");
  await writeFile(path.join(appResources, "uv"), "uv", { mode: 0o755 });
  return {
    kind: "in_the_app",
    uvPath: path.join(appResources, "uv"),
    builtInPythonInTheApp,
    builtInPythonFolderName: BUILT_IN_PYTHON_FOLDER_NAME,
    builtInPythonCopiesFolder: path.join(await temporaryFolder("tl-app-data-"), "python"),
  };
}

interface PythonEnvironmentsOverFakes {
  pythonEnvironments: StreamProjectPythonEnvironments;
  programsRun: ProgramRun[];
  appConfigDirectory: string;
}

/**
 * Making environments over a fake program runner: an interpreter runs when its file is there and `interpreterRuns` lets
 * it, `--version` prints `versionOutput`, and uv answers `uvAnswer`, writing a `.venv` first when `uvWritesAVenv`.
 */
async function pythonEnvironmentsOverFakes({
  bundledPythonToolchain,
  appConfigDirectory,
  dialogAnswer = succeeded(null),
  uvAnswer = exitedWith(0),
  uvWritesAVenv = true,
  interpreterRuns = () => true,
  versionOutput = "Python 3.11.9\n",
}: {
  bundledPythonToolchain: BundledPythonToolchain;
  appConfigDirectory?: string;
  dialogAnswer?: Result<string | null, string>;
  uvAnswer?: Result<ProgramCompletion, string>;
  uvWritesAVenv?: boolean;
  interpreterRuns?: (interpreter: string) => boolean;
  versionOutput?: string;
}): Promise<PythonEnvironmentsOverFakes> {
  const programsRun: ProgramRun[] = [];
  const configDirectory = appConfigDirectory ?? (await temporaryFolder("tl-app-config-"));
  const uvPath = bundledPythonToolchain.kind === "in_the_app" ? bundledPythonToolchain.uvPath : null;
  const pythonEnvironments = await StreamProjectPythonEnvironments.load({
    bundledPythonToolchain,
    appConfigDirectory: configDirectory,
    pythonInterpreterFileDialog: async () => dialogAnswer,
    runProgramToCompletion: async (programPath, programArguments, programRunOptions) => {
      programsRun.push({ programPath, programArguments, programRunOptions });
      if (programPath === uvPath) {
        const projectFolder = programArguments[programArguments.indexOf("--directory") + 1] ?? "";
        if (uvWritesAVenv) {
          await mkdir(path.join(projectFolder, ".venv", "bin"), { recursive: true });
          await writeFile(path.join(projectFolder, ".venv", "bin", "python"), "the venv's interpreter");
        }
        return uvAnswer;
      }
      if (programArguments[0] === "--version") return exitedWith(0, "", versionOutput);
      if (!(await isAFile(programPath))) return failedWith(`${programPath} could not be run: spawn ${programPath} ENOENT`);
      return interpreterRuns(programPath) ? exitedWith(0) : exitedWith(1, "Fatal Python error: init_fs_encoding");
    },
    tatolabAppLog: createTatolabAppLog("error", () => undefined),
  });
  return { pythonEnvironments, programsRun, appConfigDirectory: configDirectory };
}

function uvRunsIn(programsRun: readonly ProgramRun[], uvPath: string): ProgramRun[] {
  return programsRun.filter((programRun) => programRun.programPath === uvPath);
}

test("a project whose .venv interpreter runs is left as it is, with no uv sync and no copy of the built-in Python", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const { pythonEnvironments, programsRun } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain });
  const projectFolder = await temporaryFolder("tl-project-");
  await mkdir(path.join(projectFolder, ".venv", "bin"), { recursive: true });
  await writeFile(path.join(projectFolder, ".venv", "bin", "python"), "someone's own venv");

  expect(await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder)).toEqual(succeeded(undefined));

  expect(programsRun.map((programRun) => programRun.programPath)).toEqual([path.join(projectFolder, ".venv", "bin", "python")]);
  expect(programsRun[0]?.programArguments).toEqual(["-I", "-c", ""]);
  expect(await readdir(path.dirname(toolchain.builtInPythonCopiesFolder))).toEqual([]);
});

test("a project with no .venv gets the built-in Python copied out of the app, links followed, then the app's uv sync with it", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const { pythonEnvironments, programsRun } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain });
  const projectFolder = await temporaryFolder("tl-project-");

  expect(await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder)).toEqual(succeeded(undefined));

  const copiedPythonFolder = path.join(toolchain.builtInPythonCopiesFolder, BUILT_IN_PYTHON_FOLDER_NAME);
  const copiedInterpreter = path.join(copiedPythonFolder, "bin", "python3");
  expect(await readdir(toolchain.builtInPythonCopiesFolder)).toEqual([BUILT_IN_PYTHON_FOLDER_NAME]);
  expect(await readFile(copiedInterpreter, "utf8")).toBe("the interpreter");
  expect(await readFile(path.join(copiedPythonFolder, "lib", "python3.12", "os.py"), "utf8")).toBe("# the standard library");
  expect(uvRunsIn(programsRun, toolchain.uvPath)).toEqual([
    {
      programPath: toolchain.uvPath,
      programArguments: ["sync", "--directory", projectFolder, "--python", copiedInterpreter, "--no-python-downloads"],
      programRunOptions: { environmentVariablesLeftOut: ["UV_PROJECT_ENVIRONMENT", "VIRTUAL_ENV", "PYTHONHOME", "PYTHONPATH"] },
    },
  ]);
});

test("the built-in Python is copied once and every later environment is made from that copy", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const { pythonEnvironments, programsRun } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain });
  const firstProject = await temporaryFolder("tl-project-");
  const secondProject = await temporaryFolder("tl-project-");

  await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(firstProject);
  await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(secondProject);

  const copyChecks = programsRun.filter((programRun) => programRun.programPath.includes(".partial-"));
  expect(copyChecks).toHaveLength(1);
  const uvRuns = uvRunsIn(programsRun, toolchain.uvPath);
  expect(uvRuns.map((uvRun) => uvRun.programArguments[4])).toEqual([
    path.join(toolchain.builtInPythonCopiesFolder, BUILT_IN_PYTHON_FOLDER_NAME, "bin", "python3"),
    path.join(toolchain.builtInPythonCopiesFolder, BUILT_IN_PYTHON_FOLDER_NAME, "bin", "python3"),
  ]);
});

test("two runs of one folder at once share one uv sync", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const { pythonEnvironments, programsRun } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain });
  const projectFolder = await temporaryFolder("tl-project-");

  const [first, second] = await Promise.all([
    pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder),
    pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder),
  ]);

  expect([first, second]).toEqual([succeeded(undefined), succeeded(undefined)]);
  expect(uvRunsIn(programsRun, toolchain.uvPath)).toHaveLength(1);
});

test("a uv sync that fails is refused in uv's own words and takes the .venv it half-made with it", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const uvsOwnWords = "error: Failed to fetch: `https://pypi.org/simple/tatolab-stream/`\n  Caused by: dns error";
  const { pythonEnvironments } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain, uvAnswer: exitedWith(2, `${uvsOwnWords}\n`) });
  const projectFolder = await temporaryFolder("tl-project-");

  expect(await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder)).toEqual(failedWith(uvsOwnWords));
  expect(await readdir(projectFolder)).toEqual([]);
});

test("a uv sync that fails saying nothing is refused naming how it ended, and one that cannot start in the runner's words", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const silent = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain, uvAnswer: exitedWith(2), uvWritesAVenv: false });
  expect(await silent.pythonEnvironments.makePythonEnvironmentUnlessOneWorks(await temporaryFolder("tl-project-"))).toEqual(
    failedWith("uv sync ended with exit status: 2"),
  );

  const unstartable = await pythonEnvironmentsOverFakes({
    bundledPythonToolchain: toolchain,
    uvAnswer: failedWith(`${toolchain.uvPath} could not be run: spawn EACCES`),
    uvWritesAVenv: false,
  });
  expect(await unstartable.pythonEnvironments.makePythonEnvironmentUnlessOneWorks(await temporaryFolder("tl-project-"))).toEqual(
    failedWith(`${toolchain.uvPath} could not be run: spawn EACCES`),
  );
});

test("a broken .venv, whose interpreter does not run, is made again", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const projectFolder = await temporaryFolder("tl-project-");
  const projectInterpreter = path.join(projectFolder, ".venv", "bin", "python");
  await mkdir(path.dirname(projectInterpreter), { recursive: true });
  await writeFile(projectInterpreter, "a venv whose Python was removed");
  let fakes: PythonEnvironmentsOverFakes | null = null;
  const hasUvRun = () => fakes !== null && uvRunsIn(fakes.programsRun, toolchain.uvPath).length > 0;
  fakes = await pythonEnvironmentsOverFakes({
    bundledPythonToolchain: toolchain,
    interpreterRuns: (interpreter) => interpreter !== projectInterpreter || hasUvRun(),
  });

  expect(await fakes.pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder)).toEqual(succeeded(undefined));
  expect(uvRunsIn(fakes.programsRun, toolchain.uvPath)).toHaveLength(1);
});

test("a build with no toolchain refuses to make an environment, naming why, and runs no uv", async () => {
  const reason = "This build of Tatolab carries no uv or Python of its own.";
  const { pythonEnvironments, programsRun } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: { kind: "not_offered", reason } });
  const projectFolder = await temporaryFolder("tl-project-");

  expect(await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder)).toEqual(failedWith(reason));
  expect(programsRun.map((programRun) => programRun.programPath)).toEqual([path.join(projectFolder, ".venv", "bin", "python")]);
  expect(pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "built_in_not_offered", reason });
});

test("a copy of the built-in Python that does not run is refused and leaves no folder behind", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const { pythonEnvironments, programsRun } = await pythonEnvironmentsOverFakes({
    bundledPythonToolchain: toolchain,
    interpreterRuns: (interpreter) => !interpreter.includes(".partial-"),
  });

  const made = await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(await temporaryFolder("tl-project-"));

  expect(made.ok ? "" : made.failure).toMatch(/^Tatolab's Python, copied into .*, does not run: Fatal Python error: init_fs_encoding$/);
  expect(await readdir(toolchain.builtInPythonCopiesFolder)).toEqual([]);
  expect(uvRunsIn(programsRun, toolchain.uvPath)).toEqual([]);
});

test("a copy a crash left half-made is cleared before the built-in Python is copied again", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const leftover = path.join(toolchain.builtInPythonCopiesFolder, `${BUILT_IN_PYTHON_FOLDER_NAME}.partial-crashed`);
  await mkdir(path.join(leftover, "bin"), { recursive: true });
  const { pythonEnvironments } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain });

  await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(await temporaryFolder("tl-project-"));

  expect(await readdir(toolchain.builtInPythonCopiesFolder)).toEqual([BUILT_IN_PYTHON_FOLDER_NAME]);
});

test("Tatolab's built-in Python is what new environments use until another is chosen, named by its version", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const { pythonEnvironments } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain });

  expect(pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "built_in", python_version: "3.12.12" });
});

test("an interpreter picked in the file dialog that answers --version is remembered across launches and makes the next environment", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const pickedInterpreter = "/opt/homebrew/bin/python3.11";
  const { pythonEnvironments, programsRun, appConfigDirectory } = await pythonEnvironmentsOverFakes({
    bundledPythonToolchain: toolchain,
    dialogAnswer: succeeded(pickedInterpreter),
  });

  expect(await pythonEnvironments.choosePythonForNewEnvironments("chosen_in_a_file_dialog")).toEqual(succeeded(undefined));
  expect(pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "chosen", interpreter: pickedInterpreter });
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, PYTHON_INTERPRETER_CHOICE_FILE_NAME), "utf8"))).toEqual({ python_interpreter: pickedInterpreter });

  const projectFolder = await temporaryFolder("tl-project-");
  await pythonEnvironments.makePythonEnvironmentUnlessOneWorks(projectFolder);
  expect(uvRunsIn(programsRun, toolchain.uvPath)[0]?.programArguments).toEqual([
    "sync",
    "--directory",
    projectFolder,
    "--python",
    pickedInterpreter,
    "--no-python-downloads",
  ]);
  expect(await readdir(path.dirname(toolchain.builtInPythonCopiesFolder))).toEqual([]);

  const nextLaunch = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain, appConfigDirectory });
  expect(nextLaunch.pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "chosen", interpreter: pickedInterpreter });

  expect(await nextLaunch.pythonEnvironments.choosePythonForNewEnvironments("built_in")).toEqual(succeeded(undefined));
  expect(nextLaunch.pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "built_in", python_version: "3.12.12" });
  expect(JSON.parse(await readFile(path.join(appConfigDirectory, PYTHON_INTERPRETER_CHOICE_FILE_NAME), "utf8"))).toEqual({ python_interpreter: null });
});

test("a picked file that is not a Python is refused naming what it printed, a cancel changes nothing, and the choice stays", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const notAPython = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain, dialogAnswer: succeeded("/usr/bin/ruby"), versionOutput: "ruby 3.3.0\n" });
  expect(await notAPython.pythonEnvironments.choosePythonForNewEnvironments("chosen_in_a_file_dialog")).toEqual(
    failedWith("/usr/bin/ruby is not a Python interpreter: ruby 3.3.0"),
  );
  expect(notAPython.pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "built_in", python_version: "3.12.12" });

  const cancelled = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain, dialogAnswer: succeeded(null) });
  expect(await cancelled.pythonEnvironments.choosePythonForNewEnvironments("chosen_in_a_file_dialog")).toEqual(succeeded(undefined));
  expect(cancelled.pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "built_in", python_version: "3.12.12" });
  expect(cancelled.programsRun).toEqual([]);
});

test("a malformed choice file reads as Tatolab's built-in Python", async () => {
  const toolchain = await bundledPythonToolchainInATemporaryApp();
  const appConfigDirectory = await temporaryFolder("tl-app-config-");
  await writeFile(path.join(appConfigDirectory, PYTHON_INTERPRETER_CHOICE_FILE_NAME), "{ not json");

  const { pythonEnvironments } = await pythonEnvironmentsOverFakes({ bundledPythonToolchain: toolchain, appConfigDirectory });

  expect(pythonEnvironments.pythonForNewEnvironmentsNow()).toEqual({ kind: "built_in", python_version: "3.12.12" });
});
