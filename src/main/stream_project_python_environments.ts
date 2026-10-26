// A stream project's `.venv`, made by the app with its own uv from Tatolab's built-in Python or the
// interpreter the person chose in Settings, so that a project runs without the person setting up
// Python. The runtime compiles and runs a project only in its `.venv/bin/python`, and refuses one
// with none. A `.venv` whose interpreter runs is never touched.

import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { PythonForNewEnvironments, PythonForNewEnvironmentsChoice } from "../shared/tatolab_backend_contract.js";
import { isAFileOnThisMachine, isAMissingFileFailure } from "./file_system_entries_on_this_machine.js";
import { replaceFileWhole } from "./file_replaced_whole.js";
import { isAJsonObject, parseJsonOnTheWire } from "./json_on_the_wire.js";
import {
  pythonInterpreterInsideThePythonFolder,
  pythonVersionOfTheBuiltInPythonFolder,
  type BundledPythonToolchain,
  type BundledPythonToolchainInTheApp,
} from "./platform/bundled_python_toolchain.js";
import { programsOwnWordsOrHowItEnded, programSucceeded, type ProgramRunner } from "./platform/run_program_to_completion.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The file the chosen interpreter is remembered in, inside the app's config directory. */
export const PYTHON_INTERPRETER_CHOICE_FILE_NAME = "python-interpreter.json";

/** The choice file's one key: the chosen interpreter's path, or `null` for Tatolab's built-in Python. */
const PYTHON_INTERPRETER_CHOICE_KEY = "python_interpreter";

/** A project's environment folder, the one the runtime takes. */
const PROJECT_PYTHON_ENVIRONMENT_FOLDER_NAME = ".venv";

/** The interpreter the runtime compiles and runs a project in. */
const PROJECT_PYTHON_ENVIRONMENT_INTERPRETER = path.join(PROJECT_PYTHON_ENVIRONMENT_FOLDER_NAME, "bin", "python");

/**
 * What uv sync is started without, of the app's own environment: `UV_PROJECT_ENVIRONMENT` would put the environment
 * somewhere other than the `.venv` the runtime takes, `VIRTUAL_ENV` names one uv ignores with a warning, and
 * `PYTHONHOME` and `PYTHONPATH` would point the interpreter at another Python's library.
 */
const ENVIRONMENT_VARIABLES_UV_SYNC_IS_STARTED_WITHOUT = ["UV_PROJECT_ENVIRONMENT", "VIRTUAL_ENV", "PYTHONHOME", "PYTHONPATH"] as const;

/** Runs an interpreter isolated from the person's Python variables and user site, doing nothing: it ran when it exits 0. */
const PYTHON_INTERPRETER_RUNS_ARGUMENTS = ["-I", "-c", ""] as const;

/** What a `--version` of a Python interpreter starts with. */
const PYTHON_VERSION_OUTPUT_PREFIX = "Python ";

/** The marker between a built-in Python's folder name and a copy of it still being made. */
const PARTIAL_BUILT_IN_PYTHON_COPY_MARKER = ".partial-";

/**
 * The folder, inside the app's config directory, holding one file for each project whose `.venv` a sync is making. A sync
 * the app quit during leaves its `.venv` with an interpreter that runs and only some of its packages; the file left
 * behind has the next run sync it again.
 */
const PYTHON_ENVIRONMENTS_BEING_MADE_FOLDER_NAME = "python-environments-being-made";

/** Asks the person for a Python interpreter in the desktop's file dialog; `null` when they cancel. */
export type PythonInterpreterFileDialog = () => Promise<Result<string | null, string>>;

/** What making environments reaches: the app's uv and built-in Python, the app's config directory, the file dialog, how programs run, and the log. */
export interface StreamProjectPythonEnvironmentsSources {
  bundledPythonToolchain: BundledPythonToolchain;
  appConfigDirectory: string;
  pythonInterpreterFileDialog: PythonInterpreterFileDialog;
  runProgramToCompletion: ProgramRunner;
  tatolabAppLog: TatolabAppLog;
}

/** The Python new environments are made from, remembered between launches, and making a project's `.venv` with the app's uv. */
export class StreamProjectPythonEnvironments {
  private readonly environmentsBeingMade = new Map<string, Promise<Result<void, string>>>();
  private builtInPythonCopyUnderWay: Promise<Result<string, string>> | null = null;

  private constructor(
    private readonly sources: StreamProjectPythonEnvironmentsSources,
    private chosenPythonInterpreter: string | null,
  ) {}

  /** Making environments over `sources`, with the interpreter remembered in the app's config directory; Tatolab's built-in Python when none was, or the file cannot be read. */
  static async load(sources: StreamProjectPythonEnvironmentsSources): Promise<StreamProjectPythonEnvironments> {
    return new StreamProjectPythonEnvironments(sources, await loadTheRememberedPythonInterpreter(sources.appConfigDirectory, sources.tatolabAppLog));
  }

  /** The Python new environments are made from, as Settings shows it. */
  pythonForNewEnvironmentsNow(): PythonForNewEnvironments {
    if (this.chosenPythonInterpreter !== null) return { kind: "chosen", interpreter: this.chosenPythonInterpreter };
    const toolchain = this.sources.bundledPythonToolchain;
    if (toolchain.kind === "not_offered") return { kind: "built_in_not_offered", reason: toolchain.reason };
    return { kind: "built_in", python_version: pythonVersionOfTheBuiltInPythonFolder(toolchain.builtInPythonFolderName) ?? toolchain.builtInPythonFolderName };
  }

  /** Make new environments from Tatolab's built-in Python, or from an interpreter the person picks in the file dialog and that answers `--version`; a cancel leaves the choice as it was. Refused naming why, the choice unchanged. */
  async choosePythonForNewEnvironments(choice: PythonForNewEnvironmentsChoice): Promise<Result<void, string>> {
    switch (choice) {
      case "built_in":
        return this.rememberThePythonInterpreter(null);
      case "chosen_in_a_file_dialog": {
        const pickedInterpreter = await this.sources.pythonInterpreterFileDialog();
        if (!pickedInterpreter.ok) return pickedInterpreter;
        if (pickedInterpreter.value === null) return succeeded(undefined);
        const checked = await this.checkThePickedInterpreter(pickedInterpreter.value);
        return checked.ok ? this.rememberThePythonInterpreter(pickedInterpreter.value) : checked;
      }
    }
  }

  /**
   * Leave `projectFolder`'s `.venv` as it is when its interpreter runs; otherwise run the app's uv sync in the folder with
   * the Python for new environments. A sync that fails takes the `.venv` it half-made with it, so the next run syncs
   * again rather than finding an interpreter with nothing installed. Refused in uv's own words; two runs of one folder
   * share one sync.
   */
  makePythonEnvironmentUnlessOneWorks(projectFolder: string): Promise<Result<void, string>> {
    const underWay = this.environmentsBeingMade.get(projectFolder);
    if (underWay !== undefined) return underWay;
    const making = this.makeThePythonEnvironmentUnlessOneWorks(projectFolder).finally(() => this.environmentsBeingMade.delete(projectFolder));
    this.environmentsBeingMade.set(projectFolder, making);
    return making;
  }

  private async makeThePythonEnvironmentUnlessOneWorks(projectFolder: string): Promise<Result<void, string>> {
    const projectInterpreter = path.join(projectFolder, PROJECT_PYTHON_ENVIRONMENT_INTERPRETER);
    const unfinishedSyncFile = this.unfinishedSyncFileOf(projectFolder);
    const wasASyncLeftUnfinished = await isAFileOnThisMachine(unfinishedSyncFile);
    if (!wasASyncLeftUnfinished && (await this.pythonInterpreterRuns(projectInterpreter))) return succeeded(undefined);
    const toolchain = this.sources.bundledPythonToolchain;
    if (toolchain.kind === "not_offered") return failedWith(toolchain.reason);
    const interpreter = this.chosenPythonInterpreter === null ? await this.builtInPythonInterpreter(toolchain) : succeeded(this.chosenPythonInterpreter);
    if (!interpreter.ok) return interpreter;
    const markedUnfinished = await replaceFileWhole(unfinishedSyncFile, projectFolder);
    if (!markedUnfinished.ok) return failedWith(`Tatolab could not note that it is making ${projectFolder}'s .venv: ${markedUnfinished.failure}`);
    this.sources.tatolabAppLog.info("making a stream project's .venv with uv sync", {
      project_folder: projectFolder,
      python_interpreter: interpreter.value,
      after_an_unfinished_sync: wasASyncLeftUnfinished,
    });
    const sync = await this.sources.runProgramToCompletion(
      toolchain.uvPath,
      ["sync", "--directory", projectFolder, "--python", interpreter.value, "--no-python-downloads"],
      { environmentVariablesLeftOut: ENVIRONMENT_VARIABLES_UV_SYNC_IS_STARTED_WITHOUT },
    );
    const syncRefusal = !sync.ok ? sync.failure : programSucceeded(sync.value) ? null : programsOwnWordsOrHowItEnded("uv sync", sync.value);
    if (syncRefusal !== null) {
      await this.removeAFolderLeftHalfMade(path.join(projectFolder, PROJECT_PYTHON_ENVIRONMENT_FOLDER_NAME), "a .venv uv sync left half-made");
      await this.removeAFolderLeftHalfMade(unfinishedSyncFile, "the note of an unfinished uv sync");
      this.sources.tatolabAppLog.warn("uv sync could not make a stream project's .venv", { project_folder: projectFolder, failure: syncRefusal });
      return failedWith(syncRefusal);
    }
    await this.removeAFolderLeftHalfMade(unfinishedSyncFile, "the note of a finished uv sync");
    if (!(await this.pythonInterpreterRuns(projectInterpreter))) {
      return failedWith(`uv sync finished, but ${projectInterpreter} does not run.`);
    }
    return succeeded(undefined);
  }

  /** The file noting a sync of `projectFolder` under way, named for the folder's path. */
  private unfinishedSyncFileOf(projectFolder: string): string {
    const projectFolderDigest = createHash("sha256").update(projectFolder).digest("hex");
    return path.join(this.sources.appConfigDirectory, PYTHON_ENVIRONMENTS_BEING_MADE_FOLDER_NAME, projectFolderDigest);
  }

  private async pythonInterpreterRuns(interpreter: string): Promise<boolean> {
    const ran = await this.sources.runProgramToCompletion(interpreter, PYTHON_INTERPRETER_RUNS_ARGUMENTS);
    return ran.ok && programSucceeded(ran.value);
  }

  /** Remove `leftHalfMade`, `whatItIs` in the log when it cannot be. */
  private async removeAFolderLeftHalfMade(leftHalfMade: string, whatItIs: string): Promise<void> {
    await rm(leftHalfMade, { recursive: true, force: true }).catch((removalFailure: unknown) => {
      this.sources.tatolabAppLog.warn(`${whatItIs} could not be removed`, { path: leftHalfMade, failure: describeCaughtFailure(removalFailure) });
    });
  }

  /** The built-in Python's interpreter in its copy outside the app, copied first when there is none; callers at once share one copy, and each later one checks the copy is still there. */
  private builtInPythonInterpreter(toolchain: BundledPythonToolchainInTheApp): Promise<Result<string, string>> {
    if (this.builtInPythonCopyUnderWay === null) {
      this.builtInPythonCopyUnderWay = this.copyTheBuiltInPythonOutOfTheAppUnlessCopied(toolchain).finally(() => {
        this.builtInPythonCopyUnderWay = null;
      });
    }
    return this.builtInPythonCopyUnderWay;
  }

  /**
   * Copy the built-in Python into `<copies>/<its folder name>` unless it is there, following the links the app's
   * layout uses. It is copied beside that folder, checked to run, then renamed into place, so the folder never holds half
   * a Python; earlier versions' copies stay, since the environments made from them name them.
   */
  private async copyTheBuiltInPythonOutOfTheAppUnlessCopied(toolchain: BundledPythonToolchainInTheApp): Promise<Result<string, string>> {
    const { builtInPythonInTheApp, builtInPythonFolderName, builtInPythonCopiesFolder } = toolchain;
    const copiedPythonFolder = path.join(builtInPythonCopiesFolder, builtInPythonFolderName);
    const copiedInterpreter = pythonInterpreterInsideThePythonFolder(copiedPythonFolder);
    if (await isAFileOnThisMachine(copiedInterpreter)) return succeeded(copiedInterpreter);
    const partialCopyPrefix = `${builtInPythonFolderName}${PARTIAL_BUILT_IN_PYTHON_COPY_MARKER}`;
    const partialCopy = path.join(builtInPythonCopiesFolder, `${partialCopyPrefix}${randomUUID()}`);
    try {
      await mkdir(builtInPythonCopiesFolder, { recursive: true });
      for (const leftover of await readdir(builtInPythonCopiesFolder)) {
        if (leftover.startsWith(partialCopyPrefix)) await rm(path.join(builtInPythonCopiesFolder, leftover), { recursive: true, force: true });
      }
      await cp(builtInPythonInTheApp, partialCopy, { recursive: true, dereference: true });
    } catch (copyFailure) {
      await this.removeAFolderLeftHalfMade(partialCopy, "a half-made copy of Tatolab's Python");
      return failedWith(`Tatolab could not copy its Python into ${builtInPythonCopiesFolder}: ${describeCaughtFailure(copyFailure)}`);
    }
    const partialInterpreter = pythonInterpreterInsideThePythonFolder(partialCopy);
    const ran = await this.sources.runProgramToCompletion(partialInterpreter, PYTHON_INTERPRETER_RUNS_ARGUMENTS);
    if (!ran.ok || !programSucceeded(ran.value)) {
      await this.removeAFolderLeftHalfMade(partialCopy, "a copy of Tatolab's Python that does not run");
      return failedWith(
        `Tatolab's Python, copied into ${builtInPythonCopiesFolder}, does not run: ${ran.ok ? programsOwnWordsOrHowItEnded(partialInterpreter, ran.value) : ran.failure}`,
      );
    }
    try {
      await rename(partialCopy, copiedPythonFolder);
    } catch (renameFailure) {
      await this.removeAFolderLeftHalfMade(partialCopy, "a copy of Tatolab's Python another copy beat into place");
      if (!(await isAFileOnThisMachine(copiedInterpreter))) {
        return failedWith(`Tatolab could not put its Python in ${copiedPythonFolder}: ${describeCaughtFailure(renameFailure)}`);
      }
    }
    this.sources.tatolabAppLog.info("copied Tatolab's built-in Python out of the app", { copied_python_folder: copiedPythonFolder });
    return succeeded(copiedInterpreter);
  }

  /** Refused, naming why, unless `pickedInterpreter --version` prints a Python version. */
  private async checkThePickedInterpreter(pickedInterpreter: string): Promise<Result<void, string>> {
    const versionAnswer = await this.sources.runProgramToCompletion(pickedInterpreter, ["--version"]);
    if (!versionAnswer.ok) return versionAnswer;
    const printedVersion = versionAnswer.value.standardOutput.trim();
    if (programSucceeded(versionAnswer.value) && printedVersion.startsWith(PYTHON_VERSION_OUTPUT_PREFIX)) return succeeded(undefined);
    return failedWith(
      `${pickedInterpreter} is not a Python interpreter: ${printedVersion === "" ? programsOwnWordsOrHowItEnded(pickedInterpreter, versionAnswer.value) : printedVersion}`,
    );
  }

  private async rememberThePythonInterpreter(pythonInterpreter: string | null): Promise<Result<void, string>> {
    const remembered = await replaceFileWhole(
      path.join(this.sources.appConfigDirectory, PYTHON_INTERPRETER_CHOICE_FILE_NAME),
      JSON.stringify({ [PYTHON_INTERPRETER_CHOICE_KEY]: pythonInterpreter }, null, 2),
    );
    if (!remembered.ok) return failedWith(`Tatolab could not remember the Python to use: ${remembered.failure}`);
    this.chosenPythonInterpreter = pythonInterpreter;
    return succeeded(undefined);
  }
}

/** The interpreter remembered in `appConfigDirectory`; `null`, Tatolab's built-in Python, when none was or the file cannot be read. */
async function loadTheRememberedPythonInterpreter(appConfigDirectory: string, tatolabAppLog: TatolabAppLog): Promise<string | null> {
  const choiceFile = path.join(appConfigDirectory, PYTHON_INTERPRETER_CHOICE_FILE_NAME);
  let contents: string;
  try {
    contents = await readFile(choiceFile, "utf8");
  } catch (readFailure) {
    if (!isAMissingFileFailure(readFailure)) {
      tatolabAppLog.warn("the chosen Python could not be read; using Tatolab's built-in Python", { path: choiceFile, failure: describeCaughtFailure(readFailure) });
    }
    return null;
  }
  const parsed = parseJsonOnTheWire(contents);
  const rememberedInterpreter = parsed.ok && isAJsonObject(parsed.value) ? parsed.value[PYTHON_INTERPRETER_CHOICE_KEY] : undefined;
  if (rememberedInterpreter === null || typeof rememberedInterpreter === "string") return rememberedInterpreter;
  tatolabAppLog.warn("the chosen Python is malformed; using Tatolab's built-in Python", { path: choiceFile });
  return null;
}
