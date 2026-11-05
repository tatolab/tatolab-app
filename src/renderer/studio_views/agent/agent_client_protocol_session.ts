// One conversation with an agent, the studio as its Agent Client Protocol client: it starts the
// agent through the host, opens an ACP session in the workspace project with the runtime's MCP
// server, sends what the person asks, and answers the agent's file reads and writes through the
// host's workspace files and its permission requests through the person.

import {
  client,
  methods,
  PROTOCOL_VERSION,
  RequestError,
  type AnyMessage,
  type ClientConnection,
  type NewSessionRequest,
  type ReadTextFileRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type StopReason,
  type WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
import { isAJsonRecord, isAJsonValue } from "../../view_host/json_values_in_the_window";
import type { AgentConnection, AgentConnectionEvent, AgentStarted, JsonValue, StudioViewHostConnection } from "../../view_host/studio_view_contract";
import {
  conversationWithAPermissionRequest,
  conversationWithATurnNote,
  conversationWithThePermissionAnswered,
  conversationWithThePersonsMessage,
  conversationWithTheUpdate,
  EMPTY_AGENT_CONVERSATION,
  type AgentConversation,
} from "./agent_conversation";

/** What the session reaches of its view's host connection. */
export type AgentSessionHost = Pick<StudioViewHostConnection<JsonValue>, "connectToAgent" | "readWorkspaceFile" | "saveWorkspaceFile" | "openCodeFile">;

/** Where the conversation stands: starting the agent, ready for the person, the agent working on a turn, or ended with why. */
export type AgentSessionPhase = { kind: "starting" } | { kind: "ready" } | { kind: "working" } | { kind: "ended"; because: string };

/** What the panel draws of one session. */
export interface AgentSessionState {
  phase: AgentSessionPhase;
  conversation: AgentConversation;
}

/** What the studio tells an agent of itself in `initialize`. */
const STUDIO_CLIENT_INFO = { name: "spudnik-studio", title: "Spudnik Studio", version: "1" };

/** How a turn that did not simply end is told in the conversation. */
const TURN_NOTE_OF_A_STOP_REASON: Record<StopReason, string | null> = {
  end_turn: null,
  cancelled: "Stopped.",
  refusal: "The agent declined to go on.",
  max_tokens: "The agent reached its output limit.",
  max_turn_requests: "The agent reached its limit of steps for one turn.",
};

/** Whether `value` is one JSON-RPC message, as an ACP agent sends. */
function isAnAgentClientProtocolMessage(value: unknown): value is AnyMessage {
  return isAJsonRecord(value) && value["jsonrpc"] === "2.0" && (typeof value["method"] === "string" || "id" in value);
}

/** What a failed request says, in the agent's or the host's own words. */
export function wordsOfAFailedRequest(failure: unknown): string {
  if (failure instanceof RequestError) {
    const details = isAJsonRecord(failure.data) && typeof failure.data["details"] === "string" ? `: ${failure.data["details"]}` : "";
    return `${failure.message}${details}`;
  }
  if (failure instanceof Error) return failure.message;
  return String(failure);
}

/** `text` from its 1-based `line`, `limit` lines long, as `fs/read_text_file` asks. */
export function linesOfTheText(text: string, line: number | null | undefined, limit: number | null | undefined): string {
  if ((line === null || line === undefined) && (limit === null || limit === undefined)) return text;
  const lines = text.split("\n");
  const start = Math.max((line ?? 1) - 1, 0);
  return lines.slice(start, limit === null || limit === undefined ? undefined : start + limit).join("\n");
}

/** One conversation with the agent `agentId`, its state told to `onStateChanged` on each change. */
export class AgentClientProtocolSession {
  private state: AgentSessionState = { phase: { kind: "starting" }, conversation: EMPTY_AGENT_CONVERSATION };
  private readonly agentConnection: AgentConnection;
  private readonly answersOfPendingPermissions = new Map<string, (response: RequestPermissionResponse) => void>();
  private pushToTheClient: ((message: AnyMessage) => void) | null = null;
  private clientConnection: ClientConnection | null = null;
  private sessionId: string | null = null;
  private isClosed = false;

  constructor(
    private readonly host: AgentSessionHost,
    agentId: string,
    private readonly onStateChanged: (state: AgentSessionState) => void,
  ) {
    this.agentConnection = host.connectToAgent(agentId, (event) => this.takeTheConnectionEvent(event));
  }

  readLatestState(): AgentSessionState {
    return this.state;
  }

  /** Send `text` as the person's next prompt; nothing is sent while the agent is starting, working or has ended. */
  sendThePersonsMessage(text: string): void {
    const sessionId = this.sessionId;
    const clientConnection = this.clientConnection;
    if (this.state.phase.kind !== "ready" || sessionId === null || clientConnection === null || text.trim() === "") return;
    this.change({ phase: { kind: "working" }, conversation: conversationWithThePersonsMessage(this.state.conversation, text) });
    clientConnection.agent.request(methods.agent.session.prompt, { sessionId, prompt: [{ type: "text", text }] }).then(
      (response) => {
        const note = TURN_NOTE_OF_A_STOP_REASON[response.stopReason];
        this.change({ phase: { kind: "ready" }, conversation: note === null ? this.state.conversation : conversationWithATurnNote(this.state.conversation, note) });
      },
      (failure: unknown) => {
        if (this.state.phase.kind === "ended") return;
        this.change({ phase: { kind: "ready" }, conversation: conversationWithATurnNote(this.state.conversation, wordsOfAFailedRequest(failure)) });
      },
    );
  }

  /** Ask the agent to stop its turn, answering any permission it waits on as cancelled. */
  stopTheTurn(): void {
    const sessionId = this.sessionId;
    if (this.state.phase.kind !== "working" || sessionId === null) return;
    this.answerEveryPendingPermissionAsCancelled();
    void this.clientConnection?.agent.notify(methods.agent.session.cancel, { sessionId }).catch(() => undefined);
  }

  /** Answer the permission request `entryId` with the choice `optionId`. */
  answerThePermission(entryId: string, optionId: string): void {
    const answer = this.answersOfPendingPermissions.get(entryId);
    const entry = this.state.conversation.entries.find((candidate) => candidate.entry_id === entryId);
    if (answer === undefined || entry?.kind !== "permission_request") return;
    const choice = entry.choices.find((candidate) => candidate.option_id === optionId);
    if (choice === undefined) return;
    this.answersOfPendingPermissions.delete(entryId);
    this.change({ ...this.state, conversation: conversationWithThePermissionAnswered(this.state.conversation, entryId, { kind: "chosen", name: choice.name }) });
    answer({ outcome: { outcome: "selected", optionId } });
  }

  /** Stop the agent; nothing is told after. */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.answerEveryPendingPermissionAsCancelled();
    this.clientConnection?.close();
    this.agentConnection.close();
  }

  private takeTheConnectionEvent(event: AgentConnectionEvent): void {
    if (this.isClosed) return;
    switch (event.kind) {
      case "started":
        void this.openTheSession(event.started);
        return;
      case "message":
        if (isAnAgentClientProtocolMessage(event.message)) this.pushToTheClient?.(event.message);
        return;
      case "ended":
        this.endWith(event.because);
        return;
    }
  }

  private async openTheSession(started: AgentStarted): Promise<void> {
    const clientConnection = this.connectTheClient();
    try {
      await clientConnection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
        clientInfo: STUDIO_CLIENT_INFO,
      });
      const newSessionRequest: NewSessionRequest = {
        cwd: started.workspace_project_folder,
        mcpServers: started.runtime_mcp_servers.map((server) => ({ name: server.name, command: server.command, args: server.args, env: server.env })),
      };
      const newSession = await clientConnection.agent.request(methods.agent.session.new, newSessionRequest);
      this.sessionId = newSession.sessionId;
      if (this.state.phase.kind === "starting") this.change({ ...this.state, phase: { kind: "ready" } });
    } catch (failure) {
      this.endWith(`The agent did not open a session: ${wordsOfAFailedRequest(failure)}`);
    }
  }

  private connectTheClient(): ClientConnection {
    const readable = new ReadableStream<AnyMessage>({
      start: (controller) => {
        this.pushToTheClient = (message) => controller.enqueue(message);
      },
    });
    const writable = new WritableStream<AnyMessage>({
      write: (message) => {
        const sent: unknown = JSON.parse(JSON.stringify(message));
        if (isAJsonValue(sent)) this.agentConnection.send(sent);
      },
    });
    const clientConnection = client({ name: "Spudnik Studio" })
      .onNotification(methods.client.session.update, ({ params }) => this.takeTheUpdate(params))
      .onRequest(methods.client.session.requestPermission, ({ params }) => this.askThePerson(params))
      .onRequest(methods.client.fs.readTextFile, ({ params }) => this.readTheFile(params))
      .onRequest(methods.client.fs.writeTextFile, ({ params }) => this.writeTheFile(params))
      .connect({ readable, writable });
    this.clientConnection = clientConnection;
    return clientConnection;
  }

  private takeTheUpdate(notification: SessionNotification): void {
    if (notification.sessionId !== this.sessionId && this.sessionId !== null) return;
    this.change({ ...this.state, conversation: conversationWithTheUpdate(this.state.conversation, notification.update) });
  }

  private askThePerson(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const choices = request.options.map((option) => ({ option_id: option.optionId, name: option.name, kind: option.kind }));
    const asked = conversationWithAPermissionRequest(this.state.conversation, request.toolCall.title ?? "A tool call", choices);
    this.change({ ...this.state, conversation: asked.conversation });
    return new Promise((answer) => this.answersOfPendingPermissions.set(asked.entry_id, answer));
  }

  private async readTheFile(request: ReadTextFileRequest): Promise<{ content: string }> {
    const reading = await this.host.readWorkspaceFile(request.path);
    if (reading.kind === "not_read") throw RequestError.internalError({ details: reading.because }, reading.because);
    return { content: linesOfTheText(reading.file_read.text, request.line, request.limit) };
  }

  private async writeTheFile(request: WriteTextFileRequest): Promise<Record<string, never>> {
    const before = await this.host.readWorkspaceFile(request.path);
    const saving = await this.host.saveWorkspaceFile(request.path, request.content, before.kind === "read" ? before.file_read.version : null);
    if (saving.kind === "not_saved") throw RequestError.internalError({ details: saving.because }, saving.because);
    this.host.openCodeFile(request.path);
    return {};
  }

  private answerEveryPendingPermissionAsCancelled(): void {
    let conversation = this.state.conversation;
    for (const [entryId, answer] of this.answersOfPendingPermissions) {
      conversation = conversationWithThePermissionAnswered(conversation, entryId, { kind: "cancelled" });
      answer({ outcome: { outcome: "cancelled" } });
    }
    this.answersOfPendingPermissions.clear();
    if (conversation !== this.state.conversation) this.change({ ...this.state, conversation });
  }

  private endWith(because: string): void {
    if (this.state.phase.kind === "ended") return;
    this.answerEveryPendingPermissionAsCancelled();
    this.clientConnection?.close();
    this.change({ ...this.state, phase: { kind: "ended", because } });
  }

  private change(state: AgentSessionState): void {
    this.state = state;
    if (!this.isClosed) this.onStateChanged(state);
  }
}
