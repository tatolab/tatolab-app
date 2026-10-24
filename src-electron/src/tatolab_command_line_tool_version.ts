// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The `tatolab` CLI's version, read once per launch from the first line `tatolab --version`
// prints (`tatolab <version>`). Its second line describes the runtime, which the app reads from
// the local API instead, so it is ignored.

import type { TatolabCommandLineToolVersion } from "../../src/backend/tatolab_backend_contract.js";
import type { TatolabCommandLineTool } from "./platform/mod.js";
import { describeHowTheProgramEnded, programSucceeded, type ProgramRunner } from "./platform/run_program_to_completion.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** The version on the first line of `tatolab --version`'s output, or why there is none. */
export function commandLineToolVersionFromItsVersionOutput(standardOutput: string): Result<string, string> {
  const firstLine = (standardOutput.split("\n")[0] ?? "").trim();
  const versionOnTheFirstLine = /^tatolab (\S+)$/.exec(firstLine)?.[1];
  return versionOnTheFirstLine === undefined ? failedWith(`its first line, ${JSON.stringify(firstLine)}, names no version`) : succeeded(versionOnTheFirstLine);
}

/** The CLI's version, read once in the background from the moment it is built. */
export class TatolabCommandLineToolVersionReadOncePerLaunch {
  private versionReadThisLaunch: TatolabCommandLineToolVersion;

  /** Start reading `tatolabCommandLineTool`'s version through `runProgram`; nothing runs where the build carries no CLI. */
  constructor(tatolabCommandLineTool: TatolabCommandLineTool, runProgram: ProgramRunner, tatolabAppLog: TatolabAppLog) {
    if (tatolabCommandLineTool.kind === "not_offered") {
      this.versionReadThisLaunch = { kind: "not_offered", reason: tatolabCommandLineTool.reason };
      return;
    }
    this.versionReadThisLaunch = { kind: "reading" };
    const commandLineToolPath = tatolabCommandLineTool.path;
    readTheVersionOf(commandLineToolPath, runProgram)
      .catch((unexpectedFailure: unknown) => failedWith(describeCaughtFailure(unexpectedFailure)))
      .then((version) => {
        if (version.ok) {
          this.versionReadThisLaunch = { kind: "read", version: version.value };
          return;
        }
        tatolabAppLog.warn("the tatolab command's version could not be read", { command_line_tool: commandLineToolPath, failure: version.failure });
        this.versionReadThisLaunch = { kind: "unreadable", reason: version.failure };
      });
  }

  /** The version as read so far this launch. */
  versionNow(): TatolabCommandLineToolVersion {
    return this.versionReadThisLaunch;
  }
}

async function readTheVersionOf(commandLineToolPath: string, runProgram: ProgramRunner): Promise<Result<string, string>> {
  const versionRun = await runProgram(commandLineToolPath, ["--version"]);
  if (!versionRun.ok) return versionRun;
  if (!programSucceeded(versionRun.value)) {
    return failedWith(`${commandLineToolPath} --version failed (${describeHowTheProgramEnded(versionRun.value)}): ${versionRun.value.standardError.trim()}`);
  }
  const version = commandLineToolVersionFromItsVersionOutput(versionRun.value.standardOutput);
  return version.ok ? version : failedWith(`${commandLineToolPath} --version printed no version: ${version.failure}`);
}
