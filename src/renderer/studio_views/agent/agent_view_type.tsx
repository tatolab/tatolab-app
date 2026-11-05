import { SquarePen } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ActionButton } from "../../design_system/action_button";
import {
  ConversationMessage,
  ConversationNote,
  ConversationPermissionRequest,
  ConversationPlan,
  ConversationToolCall,
  type ConversationToolCallState,
} from "../../design_system/agent_conversation_parts";
import { CommandLine } from "../../design_system/code_block";
import { EmptyState } from "../../design_system/empty_state";
import { IconButton } from "../../design_system/icon_button";
import { FieldMenu, MenuItem, MenuNote } from "../../design_system/menus";
import { MessageComposer } from "../../design_system/message_composer";
import { RefusalLine } from "../../design_system/refusal_line";
import { studioIconNamed } from "../../design_system/studio_icons";
import { WaitingState } from "../../design_system/waiting_state";
import { useStudioViewReading } from "../../view_host/in_window_view_host";
import { isAJsonRecord } from "../../view_host/json_values_in_the_window";
import type { AgentOnThisMachine, JsonValue, StudioViewHostConnection, StudioViewType } from "../../view_host/studio_view_contract";
import type { AgentConversationEntry, AgentFileChange } from "./agent_conversation";
import { agentPanelStateOf, type AgentPanelSnapshot, type AgentPanelState } from "./agent_panel_state";

/** What an agent area keeps: the agent it talks to, `null` for the first one installed. */
export interface AgentViewSettings {
  [settingName: string]: JsonValue;
  agent_id: string | null;
}

type AgentViewConnection = StudioViewHostConnection<AgentViewSettings>;

const DEFAULT_AGENT_VIEW_SETTINGS: AgentViewSettings = { agent_id: null };

function agentViewSettingsFromSavedLayout(saved: JsonValue): AgentViewSettings | null {
  if (!isAJsonRecord(saved)) return null;
  const agentId = saved["agent_id"];
  return agentId === null || typeof agentId === "string" ? { agent_id: agentId } : null;
}

function useAgentPanel(connection: AgentViewConnection): { panel: AgentPanelState; snapshot: AgentPanelSnapshot } {
  const panel = agentPanelStateOf(connection);
  const snapshot = useSyncExternalStore(panel.subscribe, panel.snapshot);
  useEffect(() => {
    if (panel.snapshot().agents === null) panel.describeTheAgents();
  }, [panel]);
  return { panel, snapshot };
}

/** The agent the area talks to: the one its settings name while it is installed, else the first installed. */
function chosenAgentOf(snapshot: AgentPanelSnapshot, settings: AgentViewSettings): AgentOnThisMachine | null {
  if (snapshot.agents?.kind !== "described") return null;
  const installed = snapshot.agents.agents.filter((agent) => agent.install.kind === "installed");
  return installed.find((agent) => agent.agent_id === settings.agent_id) ?? installed[0] ?? null;
}

/** How many lines `fileChange` added and removed, counted as lines present in one text and not the other. */
export function linesAddedAndRemoved(fileChange: AgentFileChange): { lines_added: number; lines_removed: number } {
  const linesBefore = fileChange.old_text === null ? [] : fileChange.old_text.split("\n");
  const linesAfter = fileChange.new_text.split("\n");
  const countsBefore = new Map<string, number>();
  for (const line of linesBefore) countsBefore.set(line, (countsBefore.get(line) ?? 0) + 1);
  let linesKept = 0;
  for (const line of linesAfter) {
    const left = countsBefore.get(line) ?? 0;
    if (left > 0) {
      countsBefore.set(line, left - 1);
      linesKept += 1;
    }
  }
  return { lines_added: linesAfter.length - linesKept, lines_removed: linesBefore.length - linesKept };
}

const TOOL_CALL_STATE_OF_A_STATUS: Record<Extract<AgentConversationEntry, { kind: "tool_call" }>["status"], ConversationToolCallState> = {
  pending: "waiting",
  in_progress: "running",
  completed: "done",
  failed: "failed",
};

function fileNameOf(path: string, workspaceProjectFolder: string): string {
  return path.startsWith(`${workspaceProjectFolder}/`) ? path.slice(workspaceProjectFolder.length + 1) : path;
}

function ConversationEntry({
  entry,
  agentTitle,
  workspaceProjectFolder,
  panel,
  connection,
}: {
  entry: AgentConversationEntry;
  agentTitle: string;
  workspaceProjectFolder: string;
  panel: AgentPanelState;
  connection: AgentViewConnection;
}) {
  switch (entry.kind) {
    case "person_message":
      return <ConversationMessage speaker={{ kind: "person" }} words={entry.text} data-agent-entry="person_message" />;
    case "agent_message":
      return <ConversationMessage speaker={{ kind: "agent", agent_title: agentTitle }} words={entry.text} data-agent-entry="agent_message" />;
    case "agent_thought":
      return <ConversationMessage speaker={{ kind: "agent_thinking", agent_title: agentTitle }} words={entry.text} data-agent-entry="agent_thought" />;
    case "tool_call":
      return (
        <ConversationToolCall
          state={TOOL_CALL_STATE_OF_A_STATUS[entry.status]}
          title={entry.title}
          output={entry.output_text}
          fileChanges={entry.file_changes.map((fileChange) => ({
            file_name: fileNameOf(fileChange.path, workspaceProjectFolder),
            ...linesAddedAndRemoved(fileChange),
            onOpenAsked: () => connection.openCodeFile(fileChange.path),
          }))}
          data-agent-entry="tool_call"
          data-agent-tool-call-status={entry.status}
        />
      );
    case "plan":
      return (
        <ConversationPlan
          steps={entry.steps.map((step) => ({ words: step.content, state: step.status === "completed" ? "done" : step.status === "in_progress" ? "doing" : "to_do" }))}
          data-agent-entry="plan"
        />
      );
    case "permission_request":
      return (
        <ConversationPermissionRequest
          question={`${agentTitle} asks to go on: ${entry.tool_title}`}
          choices={entry.choices.map((choice, index) => ({
            choiceId: choice.option_id,
            words: choice.name,
            appearance: index === 0 && choice.kind.startsWith("allow") ? "primary" : "secondary",
            onChosen: () => panel.answerThePermission(entry.entry_id, choice.option_id),
          }))}
          answerWords={entry.answer === null ? null : entry.answer.kind === "chosen" ? `You chose ${entry.answer.name}.` : "Cancelled."}
          data-agent-entry="permission_request"
          data-agent-permission-answered={entry.answer === null ? "no" : "yes"}
        />
      );
    case "turn_note":
      return <ConversationNote data-agent-entry="turn_note">{entry.text}</ConversationNote>;
  }
}

function ConversationWithTheAgent({ connection, agent, workspaceProjectFolder }: { connection: AgentViewConnection; agent: AgentOnThisMachine; workspaceProjectFolder: string }) {
  const { panel, snapshot } = useAgentPanel(connection);
  const open = snapshot.conversation;
  const isOpenWithThisAgent = open !== null && open.agent_id === agent.agent_id && open.workspace_project_folder === workspaceProjectFolder;
  useEffect(() => {
    if (!isOpenWithThisAgent) panel.startAConversation(agent.agent_id, workspaceProjectFolder);
  }, [agent.agent_id, isOpenWithThisAgent, panel, workspaceProjectFolder]);
  const entriesEnd = useRef<HTMLDivElement>(null);
  const entryCount = open?.session_state.conversation.entries.length ?? 0;
  const lastEntry = open?.session_state.conversation.entries.at(-1);
  const lastEntryLength = lastEntry !== undefined && "text" in lastEntry ? lastEntry.text.length : 0;
  useLayoutEffect(() => {
    entriesEnd.current?.scrollIntoView({ block: "end" });
  }, [entryCount, lastEntryLength]);
  if (!isOpenWithThisAgent) return null;
  const { phase, conversation } = open.session_state;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-agent-conversation={agent.agent_id} data-agent-phase={phase.kind}>
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5" data-agent-entries="">
        {conversation.entries.length === 0 && phase.kind !== "ended" && (
          <ConversationNote>{phase.kind === "starting" ? `Starting ${agent.title}…` : `${agent.title} works in ${workspaceProjectFolder.split("/").at(-1) ?? workspaceProjectFolder}, and reaches the runtime's tools.`}</ConversationNote>
        )}
        {conversation.entries.map((entry) => (
          <ConversationEntry key={entry.entry_id} entry={entry} agentTitle={agent.title} workspaceProjectFolder={workspaceProjectFolder} panel={panel} connection={connection} />
        ))}
        {phase.kind === "ended" && (
          <div className="mx-3 my-1.5 flex flex-col items-start gap-1.5" data-agent-ended="">
            <RefusalLine words={phase.because} />
            <ActionButton size="small" onPressed={() => panel.startAConversation(agent.agent_id, workspaceProjectFolder)} data-agent-action="start_again">
              Start {agent.title} again
            </ActionButton>
          </div>
        )}
        <div ref={entriesEnd} />
      </div>
      <MessageComposer
        label={`Message ${agent.title}`}
        placeholder={`Ask ${agent.title}`}
        text={snapshot.draft}
        onTextChanged={(draft) => panel.keepTheDraft(draft)}
        onSendAsked={() => panel.sendTheDraft()}
        sendDisabledReason={phase.kind === "starting" ? `${agent.title} is starting` : phase.kind === "ended" ? `${agent.title} has ended` : null}
        isTheAgentWorking={phase.kind === "working"}
        onStopAsked={() => panel.stopTheTurn()}
        data-agent-composer=""
      />
    </div>
  );
}

function NoAgentInstalled({ agents, panel }: { agents: AgentOnThisMachine[]; panel: AgentPanelState }) {
  return (
    <EmptyState icon={studioIconNamed("agent")} title="No agent is installed" explanation="The agent panel runs Claude Code, Gemini CLI or Codex. Install one in a terminal, sign in to it there, then look again." data-agent-state="none_installed">
      <div className="flex w-full flex-col gap-1.5">
        {agents.map((agent) => (agent.install.kind === "not_installed" ? <CommandLine key={agent.agent_id} command={agent.install.install_command} data-agent-install-command={agent.agent_id} /> : null))}
        <ActionButton size="small" className="self-center" onPressed={() => panel.describeTheAgents()} data-agent-action="look_again">
          Look again
        </ActionButton>
      </div>
    </EmptyState>
  );
}

function AgentAreaBody({ connection }: { connection: AgentViewConnection }) {
  const { panel, snapshot } = useAgentPanel(connection);
  const openWorkspace = useStudioViewReading(connection.watchOpenWorkspace);
  const workspaceProjectFolder = openWorkspace?.kind === "read" ? openWorkspace.workspace.workspace_project.folder : null;
  useEffect(() => {
    if (openWorkspace !== null && workspaceProjectFolder === null) panel.endTheConversation();
  }, [openWorkspace, panel, workspaceProjectFolder]);
  if (openWorkspace === null || snapshot.agents === null) return null;
  if (workspaceProjectFolder === null) return <WaitingState title="No workspace is open" explanation="Open a workspace, and its agent works in the workspace project." data-agent-state="no_workspace" />;
  if (snapshot.agents.kind === "not_described") return <WaitingState isFailure title="The agents can't be listed" explanation={snapshot.agents.because} data-agent-state="not_described" />;
  const agent = chosenAgentOf(snapshot, connection.settings);
  if (agent === null) return <NoAgentInstalled agents={snapshot.agents.agents} panel={panel} />;
  return <ConversationWithTheAgent connection={connection} agent={agent} workspaceProjectFolder={workspaceProjectFolder} />;
}

function AgentAreaHeaderTools({ connection }: { connection: AgentViewConnection }) {
  const { panel, snapshot } = useAgentPanel(connection);
  const openWorkspace = useStudioViewReading(connection.watchOpenWorkspace);
  const agent = chosenAgentOf(snapshot, connection.settings);
  if (snapshot.agents?.kind !== "described" || agent === null) return null;
  const workspaceProjectFolder = openWorkspace?.kind === "read" ? openWorkspace.workspace.workspace_project.folder : null;
  return (
    <>
      <FieldMenu label={`Agent: ${agent.title}`} words={agent.title} data-agent-picker="">
        {snapshot.agents.agents.map((choice) =>
          choice.install.kind === "installed" ? (
            <MenuItem key={choice.agent_id} onChosen={() => connection.rememberSettings({ agent_id: choice.agent_id })} data-agent-choice={choice.agent_id}>
              {choice.title}
            </MenuItem>
          ) : (
            <MenuItem key={choice.agent_id} isDisabled onChosen={() => undefined} data-agent-choice={choice.agent_id}>
              {choice.title} · not installed
            </MenuItem>
          ),
        )}
        <MenuNote>Each agent signs in on its own, in a terminal.</MenuNote>
      </FieldMenu>
      <IconButton
        icon={SquarePen}
        size="compact"
        label="New conversation"
        disabledReason={workspaceProjectFolder === null ? "No workspace is open" : null}
        onPressed={() => {
          if (workspaceProjectFolder !== null) panel.startAConversation(agent.agent_id, workspaceProjectFolder);
        }}
        data-agent-action="new_conversation"
      />
    </>
  );
}

/** Agent: a conversation with an ACP agent working in the workspace project, its tool calls, file edits and permission requests shown as they happen. */
export const AGENT_VIEW_TYPE: StudioViewType<AgentViewSettings> = {
  view_type_id: "agent",
  title: "Agent",
  icon: "agent",
  brought_by: { kind: "built_in" },
  default_settings: DEFAULT_AGENT_VIEW_SETTINGS,
  settingsFromSavedLayout: agentViewSettingsFromSavedLayout,
  renderStudioView: (connection) => ({ header_tools: <AgentAreaHeaderTools connection={connection} />, body: <AgentAreaBody connection={connection} /> }),
};
