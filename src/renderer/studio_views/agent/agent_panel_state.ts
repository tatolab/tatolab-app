// What the agent panel holds for the window, shared by its header and its body and kept while the
// layout changes: the agents this machine has, and the one conversation open with one of them.

import type { AgentsOnThisMachineReading, JsonValue, StudioViewHostConnection } from "../../view_host/studio_view_contract";
import { AgentClientProtocolSession, type AgentSessionHost, type AgentSessionState } from "./agent_client_protocol_session";

/** The agent panel's host: the session's, and describing the agents. */
export type AgentPanelHost = AgentSessionHost & Pick<StudioViewHostConnection<JsonValue>, "describeAgentsOnThisMachine">;

/** What the panel draws: the agents, and the conversation with the agent it is open with, in the workspace project it started in. */
export interface AgentPanelSnapshot {
  agents: AgentsOnThisMachineReading | null;
  conversation: { agent_id: string; workspace_project_folder: string; conversation_number: number; session_state: AgentSessionState } | null;
  draft: string;
}

/** The agents and the open conversation, told to every subscriber on each change. */
export class AgentPanelState {
  private snapshotNow: AgentPanelSnapshot = { agents: null, conversation: null, draft: "" };
  private readonly subscribers = new Set<() => void>();
  private session: AgentClientProtocolSession | null = null;
  private conversationsStarted = 0;
  private isDescribing = false;

  constructor(private readonly host: AgentPanelHost) {}

  readonly subscribe = (onChange: () => void): (() => void) => {
    this.subscribers.add(onChange);
    return () => {
      this.subscribers.delete(onChange);
    };
  };

  readonly snapshot = (): AgentPanelSnapshot => this.snapshotNow;

  /** Ask which agents are installed, once at a time. */
  describeTheAgents(): void {
    if (this.isDescribing) return;
    this.isDescribing = true;
    void this.host.describeAgentsOnThisMachine().then((agents) => {
      this.isDescribing = false;
      this.change({ ...this.snapshotNow, agents });
    });
  }

  /** Open a new conversation with `agentId` in `workspaceProjectFolder`, ending the one open. */
  startAConversation(agentId: string, workspaceProjectFolder: string): void {
    this.session?.close();
    this.conversationsStarted += 1;
    const conversationNumber = this.conversationsStarted;
    const session = new AgentClientProtocolSession(this.host, agentId, (sessionState) => {
      const open = this.snapshotNow.conversation;
      if (open === null || open.conversation_number !== conversationNumber) return;
      this.change({ ...this.snapshotNow, conversation: { ...open, session_state: sessionState } });
    });
    this.session = session;
    this.change({
      ...this.snapshotNow,
      conversation: { agent_id: agentId, workspace_project_folder: workspaceProjectFolder, conversation_number: conversationNumber, session_state: session.readLatestState() },
    });
  }

  /** End the open conversation, as when the workspace closes. */
  endTheConversation(): void {
    this.session?.close();
    this.session = null;
    if (this.snapshotNow.conversation !== null) this.change({ ...this.snapshotNow, conversation: null });
  }

  keepTheDraft(draft: string): void {
    this.change({ ...this.snapshotNow, draft });
  }

  /** Send the draft to the open conversation's agent, and clear it. */
  sendTheDraft(): void {
    const draft = this.snapshotNow.draft;
    if (this.session === null || draft.trim() === "" || this.snapshotNow.conversation?.session_state.phase.kind !== "ready") return;
    this.change({ ...this.snapshotNow, draft: "" });
    this.session.sendThePersonsMessage(draft);
  }

  stopTheTurn(): void {
    this.session?.stopTheTurn();
  }

  answerThePermission(entryId: string, optionId: string): void {
    this.session?.answerThePermission(entryId, optionId);
  }

  private change(snapshot: AgentPanelSnapshot): void {
    this.snapshotNow = snapshot;
    for (const subscriber of [...this.subscribers]) subscriber();
  }
}

const agentPanelStateOfEachHost = new WeakMap<AgentPanelHost["connectToAgent"], AgentPanelState>();

/** The one panel state of the window `host` serves. */
export function agentPanelStateOf(host: AgentPanelHost): AgentPanelState {
  const known = agentPanelStateOfEachHost.get(host.connectToAgent);
  if (known !== undefined) return known;
  const created = new AgentPanelState(host);
  agentPanelStateOfEachHost.set(host.connectToAgent, created);
  return created;
}
