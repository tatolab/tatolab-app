// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { describe, expect, it } from "vitest";
import type { StreamProjectFolderReport, StreamRunAnswer } from "../backend/tatolab_backend_contract";
import {
  advanceAddStreamFlow,
  compileAndRunUnavailableBecause,
  compilingForWords,
  initialAddStreamFlowState,
  newProjectCommand,
  pythonEnvironmentSyncCommand,
  runRequestOf,
  streamRunningSummary,
  terminalCommandForTheRun,
  type AddStreamFlowEvent,
  type AddStreamFlowState,
} from "./add_stream_flow";

function folderReport(folder: string, changes: Partial<StreamProjectFolderReport> = {}): StreamProjectFolderReport {
  return {
    folder,
    folder_exists: true,
    stream_file_present: true,
    stream_functions: ["heat_map"],
    python_environment: { kind: "present", python_version: "3.12.10", tatolab_stream_version: "0.55.0" },
    ...changes,
  };
}

const HEAT_MAP_ANSWER: StreamRunAnswer = {
  stream: "heat_map",
  stream_instance: "9",
  kept: true,
  project_directory: "/Users/someone/code/heat-map",
  node_count: 4,
  replaced_the_kept_record: false,
  compile_warnings: [],
};

function afterEvents(state: AddStreamFlowState, events: AddStreamFlowEvent[]): AddStreamFlowState {
  return events.reduce(advanceAddStreamFlow, state);
}

describe("running a project folder", () => {
  it("prefills the name from the folder's stream function and runs it kept, then shows the runtime's answer", () => {
    const chosen = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "work_started", work: "choosing_a_folder" },
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map") },
    ]);
    expect(chosen.form.streamName).toBe("heat_map");
    expect(compileAndRunUnavailableBecause(chosen.form, true)).toBeNull();
    const request = runRequestOf(chosen.form);
    expect(request).toEqual({ folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" });

    const compiling = advanceAddStreamFlow(chosen, { kind: "run_started", request: request ?? { folder: "", streamFunction: null, streamName: null }, nowMs: 100 });
    expect(compiling).toMatchObject({ step: "compiling", startedAtMs: 100 });
    expect(compilingForWords(100, 12_350)).toBe("12s");
    expect(advanceAddStreamFlow(compiling, { kind: "run_answered", outcome: { kind: "running", answer: HEAT_MAP_ANSWER } })).toMatchObject({
      step: "running",
      answer: HEAT_MAP_ANSWER,
    });
  });

  it("asks for the chosen function as tatolab run takes it when stream.py has several, and names the stream after it", () => {
    const chosen = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/doorways", { stream_functions: ["front_door", "back_door"] }) },
      { kind: "stream_function_chosen", streamFunction: "back_door" },
    ]);
    expect(runRequestOf(chosen.form)).toEqual({ folder: "/Users/someone/code/doorways", streamFunction: "stream.py:back_door", streamName: "back_door" });
  });

  it("keeps the person's name and function across Check again of the same folder, and starts afresh for another folder", () => {
    const renamed = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map", { python_environment: { kind: "missing" } }) },
      { kind: "stream_name_edited", streamName: "lobby-heat" },
      { kind: "work_started", work: "checking_the_folder" },
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map") },
    ]);
    expect(renamed.form).toMatchObject({ streamName: "lobby-heat", workUnderWay: null, projectFolder: { python_environment: { kind: "present" } } });

    const another = advanceAddStreamFlow(renamed, { kind: "project_folder_answered", report: folderReport("/Users/someone/code/doorways", { stream_functions: ["front_door"] }) });
    expect(another.form.streamName).toBe("front_door");
  });

  it("returns a taken name to the form with the runtime's words and the free name, which a second run uses", () => {
    const chosen = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/front-door-v2", { stream_functions: ["front_door"] }) },
      { kind: "run_started", request: { folder: "/Users/someone/code/front-door-v2", streamFunction: null, streamName: "front_door" }, nowMs: 0 },
      { kind: "run_answered", outcome: { kind: "name_taken", refusal: "the stream name `front_door` is held by a kept stream from /x", free_name: "front_door-2" } },
    ]);
    expect(chosen).toMatchObject({ step: "form", form: { nameTaken: { refusal: "the stream name `front_door` is held by a kept stream from /x", freeName: "front_door-2" } } });
    expect(compileAndRunUnavailableBecause(chosen.form, true)).toBe("Choose another name, or use the one offered.");

    const retried = advanceAddStreamFlow(chosen, {
      kind: "run_started",
      request: { folder: "/Users/someone/code/front-door-v2", streamFunction: null, streamName: "front_door-2" },
      nowMs: 5,
    });
    expect(retried).toMatchObject({ step: "compiling", form: { streamName: "front_door-2", nameTaken: null } });
  });

  it("returns any other refusal to the form in the runtime's own words", () => {
    const refused = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map") },
      { kind: "run_started", request: { folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" }, nowMs: 0 },
      { kind: "run_refused", words: "Invalid configuration: the stream function in /Users/someone/code/heat-map failed to compile" },
    ]);
    expect(refused).toMatchObject({
      step: "form",
      form: { refusal: { lead: "Compile and run was refused:", words: "Invalid configuration: the stream function in /Users/someone/code/heat-map failed to compile" } },
    });
  });

  it("can't compile and run before a folder is chosen, or while the runtime is down", () => {
    const empty = initialAddStreamFlowState("project_folder").form;
    expect(compileAndRunUnavailableBecause(empty, true)).toBe("Choose a project folder first.");
    expect(compileAndRunUnavailableBecause(empty, false)).toBe("The runtime isn't running, so it can't compile a stream.");
  });
});

describe("creating a new project", () => {
  it("names the stream after the directory, runs only once tatolab new wrote it, and keeps the name across the venv's Check again", () => {
    const proposed = afterEvents(initialAddStreamFlowState("new_project"), [
      { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/hello", { folder_exists: false, stream_file_present: false, stream_functions: [], python_environment: { kind: "missing" } }) },
    ]);
    expect(proposed.form.streamName).toBe("hello");
    expect(compileAndRunUnavailableBecause(proposed.form, true)).toBe("Create the project first.");
    expect(runRequestOf(proposed.form)).toBeNull();

    const created = afterEvents(proposed, [
      { kind: "work_started", work: "creating_the_project" },
      { kind: "new_project_created", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"], python_environment: { kind: "missing" } }) },
      { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"] }) },
    ]);
    expect(created.form).toMatchObject({ hasCreatedTheNewProject: true, streamName: "hello" });
    expect(runRequestOf(created.form)).toEqual({ folder: "/Users/someone/streams/hello", streamFunction: null, streamName: "hello" });
  });

  it("choosing another directory before creating renames the stream after it", () => {
    const rechosen = afterEvents(initialAddStreamFlowState("new_project"), [
      { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/hello", { folder_exists: false }) },
      { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/lobby-wall", { folder_exists: false }) },
    ]);
    expect(rechosen.form.streamName).toBe("lobby-wall");
  });

  it("shows tatolab's refusal in its own words and stays on the form", () => {
    const refused = advanceAddStreamFlow(initialAddStreamFlowState("new_project"), {
      kind: "work_refused",
      lead: "Create was refused:",
      words: "This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead.",
    });
    expect(refused.form.refusal).toEqual({ lead: "Create was refused:", words: "This build of Tatolab has no tatolab command to run. Run tatolab new in a terminal instead." });
  });
});

describe("the commands and words the page shows", () => {
  it("spells the terminal commands as a shell reads them, quoting a folder with a space", () => {
    expect(terminalCommandForTheRun({ folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" }, "heat_map")).toBe(
      "cd /Users/someone/code/heat-map && tatolab run -d",
    );
    expect(terminalCommandForTheRun({ folder: "/Users/someone/My Streams/doors", streamFunction: "stream.py:back_door", streamName: "back-door" }, "back_door")).toBe(
      "cd '/Users/someone/My Streams/doors' && tatolab run -d stream.py:back_door --name back-door",
    );
    expect(pythonEnvironmentSyncCommand("/Users/someone/it's here")).toBe(`cd '/Users/someone/it'"'"'s here' && uv sync`);
    expect(newProjectCommand("/Users/someone/streams/hello")).toBe("tatolab new /Users/someone/streams/hello");
  });

  it("says whether the stream compiled cleanly, with warnings, or replaced the project's kept stream", () => {
    expect(streamRunningSummary(HEAT_MAP_ANSWER)).toBe("It compiled cleanly.");
    expect(streamRunningSummary({ ...HEAT_MAP_ANSWER, compile_warnings: ["a"] })).toBe("It compiled with a warning. Read it before you rely on this stream.");
    expect(streamRunningSummary({ ...HEAT_MAP_ANSWER, compile_warnings: ["a", "b"], replaced_the_kept_record: true })).toBe(
      "It replaced the stream this project kept before. It compiled with 2 warnings. Read them before you rely on this stream.",
    );
  });
});
