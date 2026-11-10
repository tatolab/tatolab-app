import { expect, test } from "vitest";
import type { PythonLanguageServerEvent } from "../shared/tatolab_backend_contract.js";
import { frameLanguageServerMessage, LanguageServerMessageReader } from "./language_server_message_framing.js";
import { PythonLanguageServers, type LanguageServerOfAWindow, type NodeProgramListeners, type StartANodeLanguageServer } from "./python_language_servers.js";
import { failedWith, succeeded } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const OPEN_PROJECT_FOLDER = "/home/someone/studio";

/** A Node program the test plays: what it was started with, what it was sent, and its listeners to answer through. */
class FakeNodeProgram {
  readonly bytesWritten: Buffer[] = [];
  wasStopped = false;

  constructor(
    readonly modulePath: string,
    readonly workingFolder: string,
    readonly listeners: NodeProgramListeners,
  ) {}

  messagesWritten(): unknown[] {
    return new LanguageServerMessageReader().readChunk(Buffer.concat(this.bytesWritten)).messages;
  }
}

function languageServersOverFakePrograms(startRefusal: string | null = null) {
  const programsStarted: FakeNodeProgram[] = [];
  const eventsSent: PythonLanguageServerEvent[] = [];
  const startANodeLanguageServer: StartANodeLanguageServer = (modulePath, workingFolder, listeners) => {
    if (startRefusal !== null) return failedWith(startRefusal);
    const program = new FakeNodeProgram(modulePath, workingFolder, listeners);
    programsStarted.push(program);
    return succeeded({
      writeToItsInput: (bytes) => program.bytesWritten.push(bytes),
      stop: () => {
        program.wasStopped = true;
      },
    });
  };
  const languageServers = new PythonLanguageServers({
    startANodeLanguageServer,
    pyrightLanguageServerModulePath: "/app/node_modules/pyright/langserver.index.js",
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  const studioWindow: LanguageServerOfAWindow = {
    projectFolderOfTheOpenProject: (projectFolder) =>
      projectFolder === OPEN_PROJECT_FOLDER ? succeeded(projectFolder) : failedWith(`${projectFolder} is not the folder of the open project or of one of its imports.`),
    sendTheWindowALanguageServerEvent: (event) => eventsSent.push(event),
  };
  return { languageServers, programsStarted, eventsSent, studioWindow };
}

test("a language server starts as Pyright's language server, in the project's folder", () => {
  const { languageServers, programsStarted, studioWindow } = languageServersOverFakePrograms();

  expect(languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow)).toEqual({ ok: true, value: { session: "python-language-server-1" } });
  expect(programsStarted.map(({ modulePath, workingFolder }) => ({ modulePath, workingFolder }))).toEqual([
    { modulePath: "/app/node_modules/pyright/langserver.index.js", workingFolder: OPEN_PROJECT_FOLDER },
  ]);
});

test("a folder outside the open project starts nothing", () => {
  const { languageServers, programsStarted, studioWindow } = languageServersOverFakePrograms();

  expect(languageServers.startALanguageServer("/etc", studioWindow)).toEqual({ ok: false, failure: "/etc is not the folder of the open project or of one of its imports." });
  expect(programsStarted).toEqual([]);
});

test("a program the platform refuses to start is refused in its words", () => {
  const { languageServers, studioWindow } = languageServersOverFakePrograms("spawn ENOENT");

  expect(languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow)).toEqual({ ok: false, failure: "The Python language server did not start: spawn ENOENT" });
});

test("the window's messages are framed onto the server's input, and the server's reach the window whole under its session", () => {
  const { languageServers, programsStarted, eventsSent, studioWindow } = languageServersOverFakePrograms();
  languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow);
  const program = programsStarted[0];
  if (program === undefined) throw new Error("no program started");

  expect(languageServers.sendToALanguageServer("python-language-server-1", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).toEqual({ ok: true, value: undefined });
  const framedAnswer = frameLanguageServerMessage({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
  program.listeners.onOutput(framedAnswer.subarray(0, 7));
  program.listeners.onOutput(framedAnswer.subarray(7));

  expect(program.messagesWritten()).toEqual([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }]);
  expect(eventsSent).toEqual([{ session: "python-language-server-1", kind: "message", message: { jsonrpc: "2.0", id: 1, result: { capabilities: {} } } }]);
});

test("a server that exits ends its session once, with why, and takes no more messages", () => {
  const { languageServers, programsStarted, eventsSent, studioWindow } = languageServersOverFakePrograms();
  languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow);
  const program = programsStarted[0];
  if (program === undefined) throw new Error("no program started");

  program.listeners.onExit("exit code 1");
  program.listeners.onExit("exit code 1");

  expect(eventsSent).toEqual([{ session: "python-language-server-1", kind: "ended", because: "The Python language server ended: exit code 1" }]);
  expect(languageServers.sendToALanguageServer("python-language-server-1", {})).toEqual({
    ok: false,
    failure: "The Python language server python-language-server-1 is no longer running.",
  });
});

test("a server writing something other than the protocol is stopped and its session ended", () => {
  const { languageServers, programsStarted, eventsSent, studioWindow } = languageServersOverFakePrograms();
  languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow);
  const program = programsStarted[0];
  if (program === undefined) throw new Error("no program started");

  program.listeners.onOutput(Buffer.from("Traceback: oops\r\n\r\n"));

  expect(program.wasStopped).toBe(true);
  expect(eventsSent).toEqual([{ session: "python-language-server-1", kind: "ended", because: expect.stringContaining("cannot read") }]);
});

test("a server the window stops ends quietly, and stopping every server stops each one", () => {
  const { languageServers, programsStarted, eventsSent, studioWindow } = languageServersOverFakePrograms();
  languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow);
  languageServers.startALanguageServer(OPEN_PROJECT_FOLDER, studioWindow);

  languageServers.stopALanguageServer("python-language-server-1");
  programsStarted[0]?.listeners.onExit("killed");
  languageServers.stopEveryLanguageServer();

  expect(programsStarted.map((program) => program.wasStopped)).toEqual([true, true]);
  expect(eventsSent).toEqual([]);
});
