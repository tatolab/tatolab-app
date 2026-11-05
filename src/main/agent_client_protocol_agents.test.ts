import { expect, test } from "vitest";
import type { AgentEvent } from "../shared/tatolab_backend_contract.js";
import { AgentClientProtocolAgents } from "./agent_client_protocol_agents.js";
import type { ProgramOnItsStandardStreamsListeners, ProgramOnItsStandardStreamsStart } from "./platform/start_a_program_speaking_on_its_standard_streams.js";
import { failedWith, succeeded, type Result } from "./result.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";

const WORKSPACE_PROJECT_FOLDER = "/home/someone/studio";

/** An agent program the test plays: how it was started, the lines it was sent, and its listeners to answer through. */
interface FakeAgentProgram {
  programPath: string;
  programArguments: readonly string[];
  programStart: ProgramOnItsStandardStreamsStart;
  listeners: ProgramOnItsStandardStreamsListeners;
  linesWritten: string[];
  wasStopped: boolean;
}

function agentsOverFakePrograms(options: { workspaceProjectFolder?: Result<string, string>; startRefusal?: string } = {}) {
  const programsStarted: FakeAgentProgram[] = [];
  const eventsSent: AgentEvent[] = [];
  const agents = new AgentClientProtocolAgents({
    findProgram: async (programName) => ({ "claude-agent-acp": "/opt/homebrew/bin/claude-agent-acp", gemini: "/opt/homebrew/bin/gemini" })[programName] ?? null,
    readTheLoginShellPath: async () => "/opt/homebrew/bin:/usr/bin:/bin",
    startAProgram: (programPath, programArguments, programStart, listeners) => {
      if (options.startRefusal !== undefined) return failedWith(options.startRefusal);
      const program: FakeAgentProgram = { programPath, programArguments, programStart, listeners, linesWritten: [], wasStopped: false };
      programsStarted.push(program);
      return succeeded({
        writeToItsInput: (bytes) => program.linesWritten.push(bytes.toString("utf8")),
        stop: () => {
          program.wasStopped = true;
        },
      });
    },
    workspaceProjectFolder: () => options.workspaceProjectFolder ?? succeeded(WORKSPACE_PROJECT_FOLDER),
    runtimeMcpServers: () => [{ name: "tatolab", command: "/Applications/Tatolab.app/Contents/Resources/bin/tatolab", args: ["mcp"], env: [] }],
    sendTheWindowAnAgentEvent: (event) => eventsSent.push(event),
    tatolabAppLog: createTatolabAppLog("error", () => {}),
  });
  return { agents, programsStarted, eventsSent };
}

test("each agent the studio runs is described as installed when its program is on the login shell's PATH, else with how to install it", async () => {
  const { agents } = agentsOverFakePrograms();
  expect(await agents.describeAgentsOnThisMachine()).toEqual({
    agents: [
      { agent_id: "claude_code", title: "Claude Code", install: { kind: "installed" } },
      { agent_id: "gemini_cli", title: "Gemini CLI", install: { kind: "installed" } },
      { agent_id: "codex", title: "Codex", install: { kind: "not_installed", install_command: "npm install -g @zed-industries/codex-acp" } },
    ],
  });
});

test("an agent starts as its program, in the workspace project's folder with the login shell's PATH, and is told the runtime's MCP server", async () => {
  const { agents, programsStarted } = agentsOverFakePrograms();
  expect(await agents.startAnAgent("gemini_cli")).toEqual({
    ok: true,
    value: {
      session: "agent-1",
      workspace_project_folder: WORKSPACE_PROJECT_FOLDER,
      runtime_mcp_servers: [{ name: "tatolab", command: "/Applications/Tatolab.app/Contents/Resources/bin/tatolab", args: ["mcp"], env: [] }],
    },
  });
  expect(programsStarted.map(({ programPath, programArguments, programStart }) => ({ programPath, programArguments, programStart }))).toEqual([
    { programPath: "/opt/homebrew/bin/gemini", programArguments: ["--acp"], programStart: { workingFolder: WORKSPACE_PROJECT_FOLDER, environmentVariablesAdded: { PATH: "/opt/homebrew/bin:/usr/bin:/bin" } } },
  ]);
});

test("an unknown agent, one not installed, no open workspace and a platform refusal each start nothing, in words", async () => {
  expect(await agentsOverFakePrograms().agents.startAnAgent("/bin/sh")).toEqual({ ok: false, failure: "/bin/sh is not an agent the studio runs." });
  expect(await agentsOverFakePrograms().agents.startAnAgent("codex")).toEqual({ ok: false, failure: "Codex is not installed. Install it with: npm install -g @zed-industries/codex-acp" });
  expect(await agentsOverFakePrograms({ workspaceProjectFolder: failedWith("No workspace is open.") }).agents.startAnAgent("claude_code")).toEqual({ ok: false, failure: "No workspace is open." });
  expect(await agentsOverFakePrograms({ startRefusal: "spawn EACCES" }).agents.startAnAgent("claude_code")).toEqual({ ok: false, failure: "Claude Code did not start: spawn EACCES" });
});

test("messages travel both ways as lines, each session's to its own agent", async () => {
  const { agents, programsStarted, eventsSent } = agentsOverFakePrograms();
  await agents.startAnAgent("claude_code");
  await agents.startAnAgent("gemini_cli");
  const [claude, gemini] = programsStarted;

  expect(agents.sendToAnAgent("agent-2", { jsonrpc: "2.0", id: 0, method: "initialize" })).toEqual({ ok: true, value: undefined });
  expect(gemini?.linesWritten).toEqual(['{"jsonrpc":"2.0","id":0,"method":"initialize"}\n']);
  expect(claude?.linesWritten).toEqual([]);

  claude?.listeners.onOutput(Buffer.from('{"jsonrpc":"2.0","method":"session/update","params":{}}\n{"jsonrpc":"2.0",'));
  claude?.listeners.onOutput(Buffer.from('"id":0,"result":{}}\n'));
  expect(eventsSent).toEqual([
    { session: "agent-1", kind: "message", message: { jsonrpc: "2.0", method: "session/update", params: {} } },
    { session: "agent-1", kind: "message", message: { jsonrpc: "2.0", id: 0, result: {} } },
  ]);
});

test("an agent that ends is told with its last error output, and one that writes something not JSON is stopped", async () => {
  const { agents, programsStarted, eventsSent } = agentsOverFakePrograms();
  await agents.startAnAgent("claude_code");
  await agents.startAnAgent("gemini_cli");
  const [claude, gemini] = programsStarted;

  claude?.listeners.onErrorOutput("Error: not logged in.\n");
  claude?.listeners.onErrorOutput("Run claude /login first.\n");
  claude?.listeners.onExit("exit status: 1");
  expect(eventsSent).toEqual([{ session: "agent-1", kind: "ended", because: "Claude Code ended (exit status: 1): Error: not logged in.\nRun claude /login first." }]);
  expect(agents.sendToAnAgent("agent-1", { jsonrpc: "2.0", method: "session/cancel" })).toEqual({ ok: false, failure: "The agent agent-1 is no longer running." });

  gemini?.listeners.onOutput(Buffer.from("Loaded cached credentials.\n"));
  expect(gemini?.wasStopped).toBe(true);
  expect(eventsSent[1]).toEqual({ session: "agent-2", kind: "ended", because: expect.stringContaining("The agent wrote something the studio cannot read") });
});

test("stopping an agent ends it without telling the window, and stopping every agent ends them all", async () => {
  const { agents, programsStarted, eventsSent } = agentsOverFakePrograms();
  await agents.startAnAgent("claude_code");
  await agents.startAnAgent("gemini_cli");
  agents.stopAnAgent("agent-1");
  programsStarted[0]?.listeners.onExit("signal: SIGTERM");
  expect(eventsSent).toEqual([]);
  agents.stopEveryAgent();
  expect(programsStarted.map((program) => program.wasStopped)).toEqual([true, true]);
});
