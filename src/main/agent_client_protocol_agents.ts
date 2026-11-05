// The agent panel's agents: one Agent Client Protocol agent per session the window starts, each a
// program the person installed, run in the open workspace project's folder. The window speaks
// ACP; this module finds the program, runs it, and frames its newline-delimited JSON-RPC.

import type { AgentEvent, AgentsOnThisMachine, AgentStarted, AgentStdioMcpServer, JsonValue } from "../shared/tatolab_backend_contract.js";
import { isAJsonValue } from "./json_on_the_wire.js";
import { frameNewlineDelimitedJsonMessage, NewlineDelimitedJsonMessageReader } from "./newline_delimited_json_framing.js";
import type { ProgramSpeakingOnItsStandardStreams, StartAProgramSpeakingOnItsStandardStreams } from "./platform/start_a_program_speaking_on_its_standard_streams.js";
import { failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppLog } from "./tatolab_app_log.js";

/** One agent the studio runs: the program that speaks ACP on its standard streams, and how a person installs it. */
export interface AgentTheStudioRuns {
  agent_id: string;
  title: string;
  program_name: string;
  program_arguments: readonly string[];
  install_command: string;
}

/** The agents the studio offers, in the order it offers them; the window can start only these. */
export const AGENTS_THE_STUDIO_RUNS: readonly AgentTheStudioRuns[] = [
  { agent_id: "claude_code", title: "Claude Code", program_name: "claude-agent-acp", program_arguments: [], install_command: "npm install -g @agentclientprotocol/claude-agent-acp" },
  { agent_id: "gemini_cli", title: "Gemini CLI", program_name: "gemini", program_arguments: ["--acp"], install_command: "npm install -g @google/gemini-cli" },
  { agent_id: "codex", title: "Codex", program_name: "codex-acp", program_arguments: [], install_command: "npm install -g @zed-industries/codex-acp" },
];

/** The most of an agent's standard error kept, its latest last, to say why it ended. */
const LAST_ERROR_OUTPUT_KEPT_CHARACTERS = 2000;

/** What the agents reach: where programs are found, how one starts, the folder agents run in, the runtime's MCP servers, and the window. */
export interface AgentClientProtocolAgentsSources {
  /** The program named `programName` on the person's login-shell `PATH`, or `null` when it is not installed. */
  findProgram(programName: string): Promise<string | null>;
  /** The person's login-shell `PATH`, which an agent runs with so the programs it starts in turn are found. */
  readTheLoginShellPath(): Promise<string>;
  startAProgram: StartAProgramSpeakingOnItsStandardStreams;
  /** The open workspace project's folder, or why there is none. */
  workspaceProjectFolder(): Result<string, string>;
  /** The MCP servers an agent reaches the runtime's tools through. */
  runtimeMcpServers(): AgentStdioMcpServer[];
  sendTheWindowAnAgentEvent(event: AgentEvent): void;
  tatolabAppLog: TatolabAppLog;
}

interface RunningAgent {
  program: ProgramSpeakingOnItsStandardStreams;
  lastErrorOutput: string;
}

/** Every agent the window has started and not stopped, by session. */
export class AgentClientProtocolAgents {
  private readonly runningAgentsBySession = new Map<string, RunningAgent>();
  private sessionsStarted = 0;

  constructor(private readonly sources: AgentClientProtocolAgentsSources) {}

  /** Every agent the studio runs, each installed on this machine or not. */
  async describeAgentsOnThisMachine(): Promise<AgentsOnThisMachine> {
    const agents = await Promise.all(
      AGENTS_THE_STUDIO_RUNS.map(async (agent) => ({
        agent_id: agent.agent_id,
        title: agent.title,
        install: (await this.sources.findProgram(agent.program_name)) === null ? { kind: "not_installed" as const, install_command: agent.install_command } : { kind: "installed" as const },
      })),
    );
    return { agents };
  }

  /** Start the agent `agentId` names in the workspace project's folder; refused for an agent the studio does not run or that is not installed, while no workspace is open, or in the platform's words. */
  async startAnAgent(agentId: string): Promise<Result<AgentStarted, string>> {
    const agent = AGENTS_THE_STUDIO_RUNS.find((candidate) => candidate.agent_id === agentId);
    if (agent === undefined) return failedWith(`${agentId} is not an agent the studio runs.`);
    const workspaceProjectFolder = this.sources.workspaceProjectFolder();
    if (!workspaceProjectFolder.ok) return workspaceProjectFolder;
    const programPath = await this.sources.findProgram(agent.program_name);
    if (programPath === null) return failedWith(`${agent.title} is not installed. Install it with: ${agent.install_command}`);
    const loginShellPath = await this.sources.readTheLoginShellPath();
    this.sessionsStarted += 1;
    const session = `agent-${this.sessionsStarted}`;
    const messageReader = new NewlineDelimitedJsonMessageReader();
    const program = this.sources.startAProgram(
      programPath,
      agent.program_arguments,
      { workingFolder: workspaceProjectFolder.value, environmentVariablesAdded: { PATH: loginShellPath } },
      {
        onOutput: (chunk) => this.forwardTheMessagesIn(session, messageReader, chunk),
        onErrorOutput: (text) => this.keepTheErrorOutput(session, text),
        onExit: (exitWords) => this.endTheSession(session, `${agent.title} ended (${exitWords})`),
      },
    );
    if (!program.ok) return failedWith(`${agent.title} did not start: ${program.failure}`);
    this.runningAgentsBySession.set(session, { program: program.value, lastErrorOutput: "" });
    this.sources.tatolabAppLog.info("started an agent", { session, agent_id: agent.agent_id, project_folder: workspaceProjectFolder.value });
    return succeeded({ session, workspace_project_folder: workspaceProjectFolder.value, runtime_mcp_servers: this.sources.runtimeMcpServers() });
  }

  /** Send `message` to the agent of `session`; refused for a session that has ended. */
  sendToAnAgent(session: string, message: JsonValue): Result<void, string> {
    const runningAgent = this.runningAgentsBySession.get(session);
    if (runningAgent === undefined) return failedWith(`The agent ${session} is no longer running.`);
    runningAgent.program.writeToItsInput(frameNewlineDelimitedJsonMessage(message));
    return succeeded(undefined);
  }

  /** Stop the agent of `session`; a session already ended is left as it is. */
  stopAnAgent(session: string): void {
    const runningAgent = this.runningAgentsBySession.get(session);
    this.runningAgentsBySession.delete(session);
    runningAgent?.program.stop();
  }

  /** Stop every agent, as the app quits. */
  stopEveryAgent(): void {
    for (const session of [...this.runningAgentsBySession.keys()]) this.stopAnAgent(session);
  }

  private forwardTheMessagesIn(session: string, messageReader: NewlineDelimitedJsonMessageReader, chunk: Buffer): void {
    if (!this.runningAgentsBySession.has(session)) return;
    const read = messageReader.readChunk(chunk);
    for (const message of read.messages) {
      if (isAJsonValue(message)) this.sources.sendTheWindowAnAgentEvent({ session, kind: "message", message });
    }
    if (read.framing_failure !== null) {
      this.sources.tatolabAppLog.warn("an agent wrote output that is not the Agent Client Protocol; stopped", { session, failure: read.framing_failure });
      this.endTheSession(session, `The agent wrote something the studio cannot read: ${read.framing_failure}`);
    }
  }

  private keepTheErrorOutput(session: string, text: string): void {
    const runningAgent = this.runningAgentsBySession.get(session);
    if (runningAgent === undefined) return;
    runningAgent.lastErrorOutput = (runningAgent.lastErrorOutput + text).slice(-LAST_ERROR_OUTPUT_KEPT_CHARACTERS);
  }

  private endTheSession(session: string, because: string): void {
    const runningAgent = this.runningAgentsBySession.get(session);
    if (runningAgent === undefined) return;
    this.runningAgentsBySession.delete(session);
    runningAgent.program.stop();
    const lastErrorOutput = runningAgent.lastErrorOutput.trim();
    this.sources.sendTheWindowAnAgentEvent({ session, kind: "ended", because: lastErrorOutput === "" ? because : `${because}: ${lastErrorOutput}` });
  }
}
