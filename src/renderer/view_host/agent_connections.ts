// The agents the host starts for its views, one per connection, and the agents this machine has.

import type { AgentsOnThisMachine } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { ProgramSessionConnections } from "./program_session_connections";
import type { AgentConnection, AgentConnectionEvent, AgentsOnThisMachineReading } from "./studio_view_contract";

type AgentBackend = Pick<TatolabBackend, "describeAgents" | "startAgent" | "sendToAgent" | "stopAgent" | "onAgentEvent">;

/** Every agent connection the host holds, routed through `backend`. */
export class AgentConnections {
  private readonly sessionConnections: ProgramSessionConnections;

  constructor(private readonly backend: AgentBackend) {
    this.sessionConnections = new ProgramSessionConnections((listener) => backend.onAgentEvent(listener));
  }

  readonly describeAgentsOnThisMachine = (): Promise<AgentsOnThisMachineReading> =>
    this.backend.describeAgents().then(
      (agentsOnThisMachine: AgentsOnThisMachine) => ({ kind: "described", agents: agentsOnThisMachine.agents }),
      (rejection: unknown) => ({ kind: "not_described", because: describeBackendRejection(rejection) }),
    );

  readonly connectToAgent = (agentId: string, onEvent: (event: AgentConnectionEvent) => void): AgentConnection =>
    this.sessionConnections.connect(
      {
        start: () => this.backend.startAgent(agentId),
        sessionOf: (started) => started.session,
        send: (session, message) => this.backend.sendToAgent(session, message),
        stop: (session) => this.backend.stopAgent(session),
      },
      onEvent,
    );
}
