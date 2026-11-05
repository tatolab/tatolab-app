import { expect, test, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../../backend/mock_tatolab_backend";
import { describeBackendRejection } from "../../backend/tatolab_backend";
import { AgentConnections } from "../../view_host/agent_connections";
import { AgentClientProtocolSession, linesOfTheText, wordsOfAFailedRequest, type AgentSessionHost, type AgentSessionState } from "./agent_client_protocol_session";
import { agentPanelStateOf } from "./agent_panel_state";

const WAIT_FOR_THE_MOCK_AGENT = { timeout: 10000, interval: 20 };

/** A host over the mock backend and its scripted agent, recording each code file the session opens. */
function hostOverTheMockBackend(pageQuery = "") {
  const backend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery)));
  const agentConnections = new AgentConnections(backend);
  const codeFilesOpened: string[] = [];
  const host: AgentSessionHost & { describeAgentsOnThisMachine: AgentConnections["describeAgentsOnThisMachine"] } = {
    connectToAgent: agentConnections.connectToAgent,
    describeAgentsOnThisMachine: agentConnections.describeAgentsOnThisMachine,
    readWorkspaceFile: (file) =>
      backend.readWorkspaceFile(file).then(
        (fileRead) => ({ kind: "read", file_read: fileRead }),
        (rejection: unknown) => ({ kind: "not_read", because: describeBackendRejection(rejection) }),
      ),
    saveWorkspaceFile: (file, text, basedOnVersion) =>
      backend.saveWorkspaceFile(file, text, basedOnVersion).then(
        (fileSaved) => ({ kind: "saved", version: fileSaved.version }),
        (rejection: unknown) => ({ kind: "not_saved", because: describeBackendRejection(rejection) }),
      ),
    openCodeFile: (file) => codeFilesOpened.push(file),
  };
  return { backend, host, codeFilesOpened };
}

function startedSession(host: AgentSessionHost) {
  let latest: AgentSessionState | null = null;
  const session = new AgentClientProtocolSession(host, "claude_code", (state) => {
    latest = state;
  });
  return { session, readState: () => latest ?? session.readLatestState() };
}

test("a turn reads stream.py, calls the runtime's tool, and writes the edit through the studio once the person allows it", async () => {
  const { backend, host, codeFilesOpened } = hostOverTheMockBackend();
  const { session, readState } = startedSession(host);
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);

  session.sendThePersonsMessage("Make the test pattern run at 60 fps");
  expect(readState().phase.kind).toBe("working");
  await vi.waitFor(() => expect(readState().conversation.entries.some((entry) => entry.kind === "permission_request")).toBe(true), WAIT_FOR_THE_MOCK_AGENT);
  const permission = readState().conversation.entries.find((entry) => entry.kind === "permission_request");
  if (permission?.kind !== "permission_request") throw new Error("no permission request");
  expect(permission.choices.map((choice) => choice.option_id)).toEqual(["allow_once", "allow_always", "reject_once"]);

  session.answerThePermission(permission.entry_id, "allow_once");
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);
  const entries = readState().conversation.entries;
  expect(entries.map((entry) => entry.kind)).toEqual(["person_message", "agent_message", "tool_call", "tool_call", "tool_call", "permission_request", "agent_message"]);
  expect(entries.filter((entry) => entry.kind === "tool_call").map((entry) => entry.kind === "tool_call" && entry.status)).toEqual(["completed", "completed", "completed"]);
  const editedFile = codeFilesOpened[0];
  expect(editedFile).toMatch(/\/stream\.py$/);
  const edited = await backend.readWorkspaceFile(editedFile ?? "");
  expect(edited.text).toContain(`"fps": 60`);
  session.close();
});

test("rejecting the edit leaves the file as it was", async () => {
  const { host, codeFilesOpened } = hostOverTheMockBackend();
  const { session, readState } = startedSession(host);
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);
  session.sendThePersonsMessage("Make it faster");
  await vi.waitFor(() => expect(readState().conversation.entries.some((entry) => entry.kind === "permission_request")).toBe(true), WAIT_FOR_THE_MOCK_AGENT);
  const permission = readState().conversation.entries.find((entry) => entry.kind === "permission_request");
  session.answerThePermission(permission?.entry_id ?? "", "reject_once");
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);
  expect(codeFilesOpened).toEqual([]);
  expect(readState().conversation.entries.at(-1)).toMatchObject({ kind: "agent_message", text: "Left stream.py as it was." });
  session.close();
});

test("stopping the turn answers the waiting permission as cancelled and notes the stop", async () => {
  const { host } = hostOverTheMockBackend();
  const { session, readState } = startedSession(host);
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);
  session.sendThePersonsMessage("Make it faster");
  await vi.waitFor(() => expect(readState().conversation.entries.some((entry) => entry.kind === "permission_request")).toBe(true), WAIT_FOR_THE_MOCK_AGENT);
  session.stopTheTurn();
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);
  expect(readState().conversation.entries.find((entry) => entry.kind === "permission_request")).toMatchObject({ answer: { kind: "cancelled" } });
  expect(readState().conversation.entries.at(-1)).toMatchObject({ kind: "turn_note", text: "Stopped." });
  session.close();
});

test("an agent the backend refuses to start ends the conversation in the backend's words", async () => {
  const { host } = hostOverTheMockBackend("agents=none");
  const { readState } = startedSession(host);
  await vi.waitFor(() => expect(readState().phase.kind).toBe("ended"), WAIT_FOR_THE_MOCK_AGENT);
  const phase = readState().phase;
  expect(phase.kind === "ended" && phase.because).toContain("Claude Code is not installed");
});

test("the panel keeps one state per window, clears the draft it sends, and holds a new conversation on New conversation", async () => {
  const { host } = hostOverTheMockBackend();
  const panel = agentPanelStateOf(host);
  expect(agentPanelStateOf(host)).toBe(panel);
  panel.describeTheAgents();
  await vi.waitFor(() => expect(panel.snapshot().agents?.kind).toBe("described"), WAIT_FOR_THE_MOCK_AGENT);
  panel.startAConversation("claude_code", "/project");
  await vi.waitFor(() => expect(panel.snapshot().conversation?.session_state.phase.kind).toBe("ready"), WAIT_FOR_THE_MOCK_AGENT);
  panel.keepTheDraft("Make it faster");
  panel.sendTheDraft();
  expect(panel.snapshot().draft).toBe("");
  expect(panel.snapshot().conversation?.session_state.phase.kind).toBe("working");
  const firstConversation = panel.snapshot().conversation?.conversation_number;
  panel.startAConversation("claude_code", "/project");
  expect(panel.snapshot().conversation?.conversation_number).not.toBe(firstConversation);
  expect(panel.snapshot().conversation?.session_state.conversation.entries).toEqual([]);
  panel.endTheConversation();
  expect(panel.snapshot().conversation).toBeNull();
});

test("a read of part of a file gives the lines asked for, from a 1-based line", () => {
  expect(linesOfTheText("a\nb\nc\nd", 2, 2)).toBe("b\nc");
  expect(linesOfTheText("a\nb\nc", null, null)).toBe("a\nb\nc");
  expect(linesOfTheText("a\nb\nc", 3, undefined)).toBe("c");
});

test("a failed request is told in its own words", () => {
  expect(wordsOfAFailedRequest(new Error("gone"))).toBe("gone");
  expect(wordsOfAFailedRequest("refused")).toBe("refused");
});
