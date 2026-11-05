// A scripted stand-in for an ACP agent in the mock window, spoken to over the real protocol: it
// opens a session, and to any prompt reads the workspace's `stream.py` through the studio, calls
// the runtime's `graph` tool, asks permission to raise the test pattern to 60 frames a second,
// writes the change through the studio once allowed, and says what it did.

import { agent, methods, RequestError, type AgentContext, type AnyMessage, type SessionUpdate } from "@agentclientprotocol/sdk";
import type { JsonValue } from "../../shared/tatolab_backend_contract";
import { isAJsonRecord, isAJsonValue } from "./json_values_in_the_window";

/** How long the mock agent takes between the steps of a turn. */
const MOCK_AGENT_STEP_MILLISECONDS = 160;

const MOCK_AGENT_SESSION_ID = "mock-agent-session";

function isAnAgentClientProtocolMessage(value: unknown): value is AnyMessage {
  return isAJsonRecord(value) && value["jsonrpc"] === "2.0";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** The mock's agent for one session, each message it sends handed to `sendToTheWindow`. */
export class MockAgentClientProtocolAgent {
  private pushToTheAgent: ((message: AnyMessage) => void) | null = null;
  private isTheTurnCancelled = false;

  constructor(
    private readonly workspaceProjectFolder: string,
    sendToTheWindow: (message: JsonValue) => void,
  ) {
    const readable = new ReadableStream<AnyMessage>({
      start: (controller) => {
        this.pushToTheAgent = (message) => controller.enqueue(message);
      },
    });
    const writable = new WritableStream<AnyMessage>({
      write: (message) => {
        const sent: unknown = JSON.parse(JSON.stringify(message));
        if (isAJsonValue(sent)) sendToTheWindow(sent);
      },
    });
    agent({ name: "Mock agent" })
      .onRequest(methods.agent.initialize, ({ params }) => ({
        protocolVersion: params.protocolVersion,
        agentCapabilities: { loadSession: false },
        agentInfo: { name: "mock-agent", title: "Mock agent", version: "1" },
        authMethods: [],
      }))
      .onRequest(methods.agent.session.new, () => ({ sessionId: MOCK_AGENT_SESSION_ID }))
      .onRequest(methods.agent.session.prompt, ({ client: windowClient }) => this.takeATurn(windowClient))
      .onNotification(methods.agent.session.cancel, () => {
        this.isTheTurnCancelled = true;
      })
      .connect({ readable, writable });
  }

  receive(message: JsonValue): void {
    if (isAnAgentClientProtocolMessage(message)) this.pushToTheAgent?.(message);
  }

  private async takeATurn(windowClient: AgentContext): Promise<{ stopReason: "end_turn" | "cancelled" }> {
    this.isTheTurnCancelled = false;
    const streamPy = `${this.workspaceProjectFolder}/stream.py`;
    const tell = async (update: SessionUpdate) => {
      await sleep(MOCK_AGENT_STEP_MILLISECONDS);
      await windowClient.notify(methods.client.session.update, { sessionId: MOCK_AGENT_SESSION_ID, update });
    };
    await tell({ sessionUpdate: "agent_message_chunk", messageId: "reply-1", content: { type: "text", text: "I'll look at how main is built first." } });
    await tell({ sessionUpdate: "tool_call", toolCallId: "read-stream-py", title: "Read stream.py", kind: "read", status: "in_progress", locations: [{ path: streamPy }] });
    const read = await windowClient.request(methods.client.fs.readTextFile, { sessionId: MOCK_AGENT_SESSION_ID, path: streamPy });
    await tell({ sessionUpdate: "tool_call_update", toolCallId: "read-stream-py", status: "completed" });
    await tell({ sessionUpdate: "tool_call", toolCallId: "graph-main", title: "tatolab · graph main", kind: "fetch", status: "in_progress" });
    await tell({
      sessionUpdate: "tool_call_update",
      toolCallId: "graph-main",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "4 nodes, 3 links: TestPatternSource → InvertingEffect → DisplayWindow, BrightnessMeter" } }],
    });
    const raised = read.content.replace(`"fps": 30`, `"fps": 60`);
    const edit = { type: "diff" as const, path: streamPy, oldText: read.content, newText: raised };
    await tell({ sessionUpdate: "tool_call", toolCallId: "edit-stream-py", title: "Edit stream.py", kind: "edit", status: "pending", locations: [{ path: streamPy, line: 11 }], content: [edit] });
    if (this.isTheTurnCancelled) return { stopReason: "cancelled" };
    const permission = await windowClient.request(methods.client.session.requestPermission, {
      sessionId: MOCK_AGENT_SESSION_ID,
      toolCall: { toolCallId: "edit-stream-py", title: "Edit stream.py" },
      options: [
        { optionId: "allow_once", name: "Allow", kind: "allow_once" },
        { optionId: "allow_always", name: "Always allow edits", kind: "allow_always" },
        { optionId: "reject_once", name: "Reject", kind: "reject_once" },
      ],
    });
    if (permission.outcome.outcome === "cancelled" || this.isTheTurnCancelled) {
      await tell({ sessionUpdate: "tool_call_update", toolCallId: "edit-stream-py", status: "failed" });
      return { stopReason: "cancelled" };
    }
    if (permission.outcome.optionId === "reject_once") {
      await tell({ sessionUpdate: "tool_call_update", toolCallId: "edit-stream-py", status: "failed" });
      await tell({ sessionUpdate: "agent_message_chunk", messageId: "reply-2", content: { type: "text", text: "Left stream.py as it was." } });
      return { stopReason: "end_turn" };
    }
    await tell({ sessionUpdate: "tool_call_update", toolCallId: "edit-stream-py", status: "in_progress" });
    try {
      await windowClient.request(methods.client.fs.writeTextFile, { sessionId: MOCK_AGENT_SESSION_ID, path: streamPy, content: raised });
    } catch (failure) {
      await tell({ sessionUpdate: "tool_call_update", toolCallId: "edit-stream-py", status: "failed" });
      throw failure instanceof RequestError ? failure : RequestError.internalError();
    }
    await tell({ sessionUpdate: "tool_call_update", toolCallId: "edit-stream-py", status: "completed" });
    await tell({
      sessionUpdate: "agent_message_chunk",
      messageId: "reply-2",
      content: { type: "text", text: "The test pattern in main now runs at 60 frames a second. Press Live to load the change." },
    });
    return { stopReason: "end_turn" };
  }
}
