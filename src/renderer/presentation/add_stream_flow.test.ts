import { describe, expect, it } from "vitest";
import type { PythonForNewEnvironments, StreamProjectFolderReport, StreamRunAnswer } from "../../shared/tatolab_backend_contract";
import {
  addStreamActionOf,
  addStreamRunNoticeOf,
  presentAddStreamRunNotice,
  addStreamPageSection,
  addStreamStepAnnouncement,
  compilingStreamWords,
  streamRunAnswerLines,
  streamRunningFactsWords,
  terminalRunRequestOf,
  advanceAddStreamFlow,
  compileWarningsHeading,
  runRequestWords,
  presentStreamFunctionChecks,
  addStreamActionUnavailableBecause,
  compilingForWords,
  initialAddStreamFlowState,
  newProjectCommand,
  pythonEnvironmentSyncWords,
  compilingHeadingVerb,
  compileWaitingWords,
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

const TATOLABS_OWN_PYTHON: PythonForNewEnvironments = { kind: "built_in", python_version: "3.12.12" };

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
    expect(addStreamActionUnavailableBecause(chosen.form, true, TATOLABS_OWN_PYTHON)).toBeNull();
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

  it("keeps the person's name and function across a new answer for the same folder, and starts afresh for another folder", () => {
    const renamed = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map", { python_environment: { kind: "missing" } }) },
      { kind: "stream_name_edited", streamName: "lobby-heat" },
      { kind: "work_started", work: "choosing_a_folder" },
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map") },
    ]);
    expect(renamed.form).toMatchObject({ streamName: "lobby-heat", workUnderWay: null, projectFolder: { python_environment: { kind: "present" } } });
    expect(addStreamActionUnavailableBecause(renamed.form, true, TATOLABS_OWN_PYTHON)).toBeNull();

    const another = advanceAddStreamFlow(renamed, { kind: "project_folder_answered", report: folderReport("/Users/someone/code/doorways", { stream_functions: ["front_door"] }) });
    expect(another.form.streamName).toBe("front_door");
  });

  it("lets a folder with no .venv compile and run, which sets up its Python first, and returns uv's refusal to the form under its own lead", () => {
    const withNoVenv = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map", { python_environment: { kind: "missing" } }) },
    ]);
    expect(addStreamActionUnavailableBecause(withNoVenv.form, true, TATOLABS_OWN_PYTHON)).toBeNull();
    const compiling = advanceAddStreamFlow(withNoVenv, { kind: "run_started", request: { folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" }, nowMs: 0 });
    expect(compiling).toMatchObject({ step: "compiling", makesThePythonEnvironmentFirst: true });
    const refused = advanceAddStreamFlow(compiling, { kind: "run_answered", outcome: { kind: "python_environment_not_made", words: "error: No interpreter found" } });
    expect(refused).toMatchObject({ step: "form", form: { refusal: { lead: "Tatolab couldn't set up the project's Python:", words: "error: No interpreter found" } } });
    expect(addStreamRunNoticeOf(refused)).toEqual({
      kind: "refused",
      source: "project_folder",
      title: "Tatolab couldn't set up the project's Python",
      words: "error: No interpreter found",
    });
    expect(addStreamActionUnavailableBecause(withNoVenv.form, true, { kind: "built_in_not_offered", reason: "No uv here." })).toBe(
      "This build of Tatolab carries no Python, so it can't set up this project. Run uv sync in its folder.",
    );
    expect(addStreamActionUnavailableBecause(withNoVenv.form, true, { kind: "chosen", interpreter: "/opt/homebrew/bin/python3.12" })).toBeNull();

    const withAVenv = afterEvents(initialAddStreamFlowState("project_folder"), [{ kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map") }]);
    expect(advanceAddStreamFlow(withAVenv, { kind: "run_started", request: { folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" }, nowMs: 0 })).toMatchObject({
      makesThePythonEnvironmentFirst: false,
    });
  });

  it("returns a taken name to the form with the runtime's words and the free name, which a second run uses", () => {
    const chosen = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/front-door-v2", { stream_functions: ["front_door"] }) },
      { kind: "run_started", request: { folder: "/Users/someone/code/front-door-v2", streamFunction: null, streamName: "front_door" }, nowMs: 0 },
      { kind: "run_answered", outcome: { kind: "name_taken", refusal: "the stream name `front_door` is held by a kept stream from /x", free_name: "front_door-2" } },
    ]);
    expect(chosen).toMatchObject({ step: "form", form: { nameTaken: { refusal: "the stream name `front_door` is held by a kept stream from /x", freeName: "front_door-2" } } });
    expect(addStreamActionUnavailableBecause(chosen.form, true, TATOLABS_OWN_PYTHON)).toBe("Choose another name, or use the one offered.");

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
      form: { refusal: { lead: "Adding the stream was refused:", words: "Invalid configuration: the stream function in /Users/someone/code/heat-map failed to compile" } },
    });
  });

  it("can't compile and run before a folder is chosen, or while the runtime is down", () => {
    const empty = initialAddStreamFlowState("project_folder").form;
    expect(addStreamActionUnavailableBecause(empty, true, TATOLABS_OWN_PYTHON)).toBe("Choose a project folder first.");
    expect(addStreamActionUnavailableBecause(empty, false, TATOLABS_OWN_PYTHON)).toBe("The runtime isn't running, so it can't add a stream.");
  });
});

describe("creating a new project", () => {
  it("names the stream after the directory, offers Create until tatolab new wrote it and Add after, and keeps the name when the folder is answered again", () => {
    const proposed = afterEvents(initialAddStreamFlowState("new_project"), [
      { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/hello", { folder_exists: false, stream_file_present: false, stream_functions: [], python_environment: { kind: "missing" } }) },
    ]);
    expect(proposed.form.streamName).toBe("hello");
    expect(addStreamActionOf(proposed.form)).toBe("create");
    expect(addStreamActionUnavailableBecause(proposed.form, true, TATOLABS_OWN_PYTHON)).toBeNull();
    expect(addStreamActionUnavailableBecause(initialAddStreamFlowState("new_project").form, true, TATOLABS_OWN_PYTHON)).toBe("Choose a directory for the new project.");
    expect(addStreamActionUnavailableBecause(proposed.form, true, { kind: "built_in_not_offered", reason: "No uv here." })).toBe(
      "This build of Tatolab carries no Python, so it can't set up this project. Run uv sync in its folder.",
    );
    expect(runRequestOf(proposed.form)).toBeNull();

    const created = afterEvents(proposed, [
      { kind: "work_started", work: "creating_the_project" },
      { kind: "new_project_created", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"], python_environment: { kind: "missing" } }) },
      { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"] }) },
    ]);
    expect(created.form).toMatchObject({ hasCreatedTheNewProject: true, streamName: "hello" });
    expect(runRequestOf(created.form)).toEqual({ folder: "/Users/someone/streams/hello", streamFunction: null, streamName: "hello" });
    expect(addStreamActionOf(created.form)).toBe("add");
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

describe("events that arrive outside the form", () => {
  const running = afterEvents(initialAddStreamFlowState("project_folder"), [
    { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map") },
    { kind: "run_started", request: { folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" }, nowMs: 0 },
    { kind: "run_answered", outcome: { kind: "running", answer: HEAT_MAP_ANSWER } },
  ]);

  it("keeps the running view through a form event, and starts afresh when another source is chosen", () => {
    expect(advanceAddStreamFlow(running, { kind: "stream_name_edited", streamName: "x" })).toBe(running);
    expect(advanceAddStreamFlow(running, { kind: "work_refused", lead: "No terminal opened:", words: "gone" })).toBe(running);
    expect(advanceAddStreamFlow(running, { kind: "source_chosen", source: "new_project" })).toEqual(initialAddStreamFlowState("new_project"));
  });

  it("keeps a compile under way through a form event or a source chosen", () => {
    const compiling = advanceAddStreamFlow(initialAddStreamFlowState("project_folder"), {
      kind: "run_started",
      request: { folder: "/Users/someone/code/heat-map", streamFunction: null, streamName: "heat_map" },
      nowMs: 0,
    });
    expect(advanceAddStreamFlow(compiling, { kind: "source_chosen", source: "new_project" })).toBe(compiling);
    expect(advanceAddStreamFlow(compiling, { kind: "project_folder_answered", report: folderReport("/elsewhere") })).toBe(compiling);
  });

  it("announces the form's milestones a focus move does not say, and leaves refusals to their own alert", () => {
    expect(addStreamStepAnnouncement(running, true, TATOLABS_OWN_PYTHON)).toBe("");
    expect(addStreamStepAnnouncement(initialAddStreamFlowState("project_folder"), true, TATOLABS_OWN_PYTHON)).toBe("");
    const created = afterEvents(initialAddStreamFlowState("new_project"), [
      { kind: "new_project_created", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"], python_environment: { kind: "missing" } }) },
    ]);
    expect(addStreamStepAnnouncement(created, true, TATOLABS_OWN_PYTHON)).toBe("tatolab new wrote /Users/someone/streams/hello. Add is ready.");
    expect(addStreamStepAnnouncement(created, false, TATOLABS_OWN_PYTHON)).toBe("");
    const chosenWithNoVenv = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map", { python_environment: { kind: "missing" } }) },
    ]);
    expect(addStreamStepAnnouncement(chosenWithNoVenv, true, TATOLABS_OWN_PYTHON)).toBe("/Users/someone/code/heat-map is ready to add.");
    const synced = advanceAddStreamFlow(created, { kind: "new_project_folder_answered", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"] }) });
    expect(addStreamStepAnnouncement(synced, true, TATOLABS_OWN_PYTHON)).toBe("tatolab new wrote /Users/someone/streams/hello. Add is ready.");
    expect(addStreamStepAnnouncement(synced, false, TATOLABS_OWN_PYTHON)).toBe("");
    const refusedAsTaken = afterEvents(synced, [
      { kind: "run_started", request: { folder: "/Users/someone/streams/hello", streamFunction: null, streamName: "hello" }, nowMs: 0 },
      { kind: "run_answered", outcome: { kind: "name_taken", refusal: "held", free_name: "hello-2" } },
    ]);
    expect(addStreamStepAnnouncement(refusedAsTaken, true, TATOLABS_OWN_PYTHON)).toBe("");
    expect(addStreamStepAnnouncement(advanceAddStreamFlow(synced, { kind: "work_refused", lead: "The folder dialog was refused:", words: "gone" }), true, TATOLABS_OWN_PYTHON)).toBe(
      "tatolab new wrote /Users/someone/streams/hello. Add is ready.",
    );
    expect(addStreamPageSection(created)).toBe(addStreamPageSection(synced));
    expect(addStreamPageSection(synced)).toBe("form:new_project:created:folder");
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
    expect(newProjectCommand("/Users/someone/streams/hello")).toBe("tatolab new /Users/someone/streams/hello");
  });

  it("words each check, the request line and the warning count", () => {
    expect(presentStreamFunctionChecks(folderReport("/x"))).toEqual([{ checked: "stream_function", name: "heat_map", isFound: true, detail: null }]);
    expect(presentStreamFunctionChecks(folderReport("/x", { stream_functions: ["a", "b"] })).map((check) => check.name)).toEqual(["a", "b"]);
    expect(presentStreamFunctionChecks(folderReport("/x", { stream_functions: [] }))).toEqual([
      { checked: "stream_file", name: "stream.py", isFound: true, detail: "No @stream function found by reading it; the runtime decides when it compiles." },
    ]);
    expect(presentStreamFunctionChecks(folderReport("/x", { stream_file_present: false, stream_functions: [] }))).toEqual([
      { checked: "stream_file", name: "stream.py", isFound: false, detail: "The stream function the runtime compiles lives in stream.py." },
    ]);
    const builtIn = TATOLABS_OWN_PYTHON;
    expect(pythonEnvironmentSyncWords(builtIn)).toBe("uv sync  python=Tatolab's Python 3.12.12");
    expect(pythonEnvironmentSyncWords({ kind: "chosen", interpreter: "/opt/homebrew/bin/python3.12" })).toBe("uv sync  python=/opt/homebrew/bin/python3.12");
    expect([compilingHeadingVerb(true), compilingHeadingVerb(false)]).toEqual(["Setting up Python, then compiling", "Compiling"]);
    expect([compileWaitingWords(true, 0, 14_200), compileWaitingWords(false, 0, 3_000)]).toEqual([
      "waiting for uv and the runtime · 14s",
      "waiting for the runtime's answer · 3s",
    ]);
    expect(runRequestWords({ folder: "/x", streamFunction: "stream.py:a", streamName: "a" })).toBe("run_stream  /x  stream_function=stream.py:a  name=a  keep=true");
    expect([compileWarningsHeading(1), compileWarningsHeading(2)]).toEqual(["1 compile warning", "2 compile warnings"]);
  });

  it("words the compile view's name, the running facts and what the runtime did", () => {
    expect(compilingStreamWords({ folder: "/x", streamFunction: null, streamName: null })).toBe("the stream");
    expect(streamRunningFactsWords(HEAT_MAP_ANSWER)).toBe("Always on · 4 steps");
    expect(streamRunAnswerLines({ ...HEAT_MAP_ANSWER, replaced_the_kept_record: true })).toEqual([
      "loaded heat_map as instance 9: 4 steps, in place of the stream this project kept",
      "heat_map is running; kept, so it loads again whenever the runtime starts",
    ]);
  });

  it("offers the terminal run under the free name while the asked one is refused as taken", () => {
    const taken = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/main-v2", { stream_functions: ["main"] }) },
      { kind: "run_started", request: { folder: "/Users/someone/code/main-v2", streamFunction: null, streamName: "main" }, nowMs: 0 },
      { kind: "run_answered", outcome: { kind: "name_taken", refusal: "held", free_name: "main-2" } },
    ]);
    expect(terminalRunRequestOf(taken.form)).toEqual({ folder: "/Users/someone/code/main-v2", streamFunction: null, streamName: "main-2" });
    const withNoVenv = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/heat-map", { python_environment: { kind: "missing" } }) },
    ]);
    expect(terminalRunRequestOf(withNoVenv.form)).toBeNull();
    expect(addStreamActionUnavailableBecause({ ...taken.form, workUnderWay: "creating_the_project" }, true, TATOLABS_OWN_PYTHON)).toBe("Wait for tatolab new to write the project.");
  });

  it("says whether the stream compiled cleanly, with warnings, or replaced the project's kept stream", () => {
    expect(streamRunningSummary(HEAT_MAP_ANSWER)).toBe("It compiled cleanly.");
    expect(streamRunningSummary({ ...HEAT_MAP_ANSWER, compile_warnings: ["a"] })).toBe("It compiled with a warning. Read it before you rely on this stream.");
    expect(streamRunningSummary({ ...HEAT_MAP_ANSWER, compile_warnings: ["a", "b"], replaced_the_kept_record: true })).toBe(
      "It replaced the stream this project kept before. It compiled with 2 warnings. Read them before you rely on this stream.",
    );
  });
});

describe("the notice of a run that answered away from the page", () => {
  it("names the running stream, and its warnings to read, or a refusal in the runtime's words", () => {
    const running = afterEvents(initialAddStreamFlowState("new_project"), [
      { kind: "new_project_created", report: folderReport("/Users/someone/streams/hello", { stream_functions: ["main"] }) },
      { kind: "run_started", request: { folder: "/Users/someone/streams/hello", streamFunction: null, streamName: "hello" }, nowMs: 0 },
      { kind: "run_answered", outcome: { kind: "running", answer: { ...HEAT_MAP_ANSWER, stream: "hello", compile_warnings: ["a"] } } },
    ]);
    const runningNotice = addStreamRunNoticeOf(running);
    expect(runningNotice).toMatchObject({ kind: "running", source: "new_project", answer: { stream: "hello" } });
    expect(runningNotice === null ? null : presentAddStreamRunNotice(runningNotice)).toEqual({
      title: "hello is running",
      detail: "It compiled with a warning. Read it before you rely on this stream.",
      tone: "warning",
    });
    expect(presentAddStreamRunNotice({ kind: "running", source: "project_folder", answer: HEAT_MAP_ANSWER })).toEqual({
      title: "heat_map is running",
      detail: "It compiled cleanly.",
      tone: "plain",
    });

    const taken = afterEvents(initialAddStreamFlowState("project_folder"), [
      { kind: "project_folder_answered", report: folderReport("/Users/someone/code/main-v2", { stream_functions: ["main"] }) },
      { kind: "run_started", request: { folder: "/Users/someone/code/main-v2", streamFunction: null, streamName: "main" }, nowMs: 0 },
      { kind: "run_answered", outcome: { kind: "name_taken", refusal: "the stream name `main` is held", free_name: "main-2" } },
    ]);
    expect(addStreamRunNoticeOf(taken)).toEqual({ kind: "refused", source: "project_folder", title: "Adding the stream was refused", words: "the stream name `main` is held" });
    expect(presentAddStreamRunNotice({ kind: "refused", source: "project_folder", title: "Adding the stream was refused", words: "held" })).toEqual({
      title: "Adding the stream was refused",
      detail: "held",
      tone: "failure",
    });
    expect(addStreamRunNoticeOf(initialAddStreamFlowState("project_folder"))).toBeNull();
  });
});
