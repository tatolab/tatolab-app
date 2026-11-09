// The code pane's Python language servers: one Pyright language server per session a studio window
// starts, each a Node program in its own process, its working folder a project folder of that
// window's project. The window speaks JSON-RPC; this module frames and unframes it.

import type { JsonValue, PythonLanguageServerEvent } from "../shared/tatolab_backend_contract.js";
import { isAJsonValue } from "./json_on_the_wire.js";
import { frameLanguageServerMessage, LanguageServerMessageReader } from "./language_server_message_framing.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** A Node language server running in its own process, with the byte stream its messages travel on. */
export interface RunningNodeProgram {
  writeToItsInput(bytes: Buffer): void;
  /** End the program; its exit still arrives on `onExit`. */
  stop(): void;
}

/** Where the bytes a language server writes, and its exit, are told. */
export interface NodeProgramListeners {
  onOutput(chunk: Buffer): void;
  /** The program ended, with how, in words. */
  onExit(exitWords: string): void;
}

/** Start the Node language server module at `modulePath` in `workingFolder`, over whichever byte stream the platform gives it; refused in the platform's words. */
export type StartANodeLanguageServer = (modulePath: string, workingFolder: string, listeners: NodeProgramListeners) => Result<RunningNodeProgram, string>;

/** What the language servers reach: how a Node language server starts and Pyright's language server module. */
export interface PythonLanguageServersSources {
  startANodeLanguageServer: StartANodeLanguageServer;
  /** Pyright's `langserver.index.js`, as this build carries it. */
  pyrightLanguageServerModulePath: string;
  tatolabAppLog: TatolabAppLog;
}

/** The project of the studio window starting a language server: which folders it may serve, and where the server's events go. */
export interface LanguageServerOfAStudioWindow {
  /** `projectFolder` as the folder of the window's project or of one of its imports, or why it is not one. */
  projectFolderOfTheOpenProject(projectFolder: string): Result<string, string>;
  sendTheWindowALanguageServerEvent(event: PythonLanguageServerEvent): void;
}

/** A running language server and the window its events go to. */
interface RunningLanguageServerSession {
  program: RunningNodeProgram;
  studioWindow: LanguageServerOfAStudioWindow;
}

/** Every Python language server the studio windows have started and not stopped, by session. */
export class PythonLanguageServers {
  private readonly runningSessionsBySession = new Map<string, RunningLanguageServerSession>();
  private sessionsStarted = 0;

  constructor(private readonly sources: PythonLanguageServersSources) {}

  /** Start a language server for `projectFolder` of `studioWindow`'s project, answering the session its messages are sent and arrive under; refused for a folder outside that project, or in the platform's words. */
  startALanguageServer(projectFolder: string, studioWindow: LanguageServerOfAStudioWindow): Result<{ session: string }, string> {
    const servedFolder = studioWindow.projectFolderOfTheOpenProject(projectFolder);
    if (!servedFolder.ok) return servedFolder;
    this.sessionsStarted += 1;
    const session = `python-language-server-${this.sessionsStarted}`;
    const messageReader = new LanguageServerMessageReader();
    const program = this.sources.startANodeLanguageServer(this.sources.pyrightLanguageServerModulePath, servedFolder.value, {
      onOutput: (chunk) => this.forwardTheMessagesIn(session, messageReader, chunk),
      onExit: (exitWords) => this.endTheSession(session, `The Python language server ended: ${exitWords}`),
    });
    if (!program.ok) return failedWith(`The Python language server did not start: ${program.failure}`);
    this.runningSessionsBySession.set(session, { program: program.value, studioWindow });
    this.sources.tatolabAppLog.info("started a Python language server", { session, project_folder: servedFolder.value });
    return succeeded({ session });
  }

  /** Send `message` to the language server of `session`; refused for a session that has ended. */
  sendToALanguageServer(session: string, message: JsonValue): Result<void, string> {
    const running = this.runningSessionsBySession.get(session);
    if (running === undefined) return failedWith(`The Python language server ${session} is no longer running.`);
    running.program.writeToItsInput(frameLanguageServerMessage(message));
    return succeeded(undefined);
  }

  /** Stop the language server of `session`; a session already ended is left as it is. */
  stopALanguageServer(session: string): void {
    const running = this.runningSessionsBySession.get(session);
    this.runningSessionsBySession.delete(session);
    running?.program.stop();
  }

  /** Stop every language server `studioWindow` started, as it closes. */
  stopTheLanguageServersOf(studioWindow: LanguageServerOfAStudioWindow): void {
    for (const [session, running] of [...this.runningSessionsBySession]) {
      if (running.studioWindow === studioWindow) this.stopALanguageServer(session);
    }
  }

  /** Stop every language server, as the app quits. */
  stopEveryLanguageServer(): void {
    for (const session of [...this.runningSessionsBySession.keys()]) this.stopALanguageServer(session);
  }

  private forwardTheMessagesIn(session: string, messageReader: LanguageServerMessageReader, chunk: Buffer): void {
    const running = this.runningSessionsBySession.get(session);
    if (running === undefined) return;
    const read = messageReader.readChunk(chunk);
    for (const message of read.messages) {
      if (isAJsonValue(message)) running.studioWindow.sendTheWindowALanguageServerEvent({ session, kind: "message", message });
    }
    if (read.framing_failure !== null) {
      this.sources.tatolabAppLog.warn("a Python language server wrote output that is not the Language Server Protocol; stopped", { session, failure: read.framing_failure });
      this.endTheSession(session, `The Python language server wrote something the studio cannot read: ${read.framing_failure}`);
    }
  }

  private endTheSession(session: string, because: string): void {
    const running = this.runningSessionsBySession.get(session);
    if (running === undefined) return;
    this.runningSessionsBySession.delete(session);
    running.program.stop();
    running.studioWindow.sendTheWindowALanguageServerEvent({ session, kind: "ended", because });
  }
}
