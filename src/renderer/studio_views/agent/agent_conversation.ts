// A conversation with an agent as the panel shows it: what the person asked, what the agent said
// and thought, each tool it called with the files it changed, its plan, and each permission it
// asked for, built from the agent's ACP `session/update` notifications in the order they came.

import type { ContentBlock, PermissionOptionKind, PlanEntryStatus, SessionUpdate, ToolCallContent, ToolCallStatus, ToolKind } from "@agentclientprotocol/sdk";

/** One file a tool call changed, with its text before (`null` for a new file) and after. */
export interface AgentFileChange {
  path: string;
  old_text: string | null;
  new_text: string;
}

/** One choice an agent's permission request offers. */
export interface AgentPermissionChoice {
  option_id: string;
  name: string;
  kind: PermissionOptionKind;
}

/** One entry of the conversation, in the order it happened. */
export type AgentConversationEntry =
  | { kind: "person_message"; entry_id: string; text: string }
  | { kind: "agent_message"; entry_id: string; message_id: string | null; text: string }
  | { kind: "agent_thought"; entry_id: string; message_id: string | null; text: string }
  | { kind: "tool_call"; entry_id: string; title: string; tool_kind: ToolKind; status: ToolCallStatus; file_changes: AgentFileChange[]; locations: string[]; output_text: string }
  | { kind: "plan"; entry_id: string; steps: { content: string; status: PlanEntryStatus }[] }
  | { kind: "permission_request"; entry_id: string; tool_title: string; choices: AgentPermissionChoice[]; answer: { kind: "chosen"; name: string } | { kind: "cancelled" } | null }
  | { kind: "turn_note"; entry_id: string; text: string };

/** The conversation's entries, oldest first. */
export interface AgentConversation {
  entries: AgentConversationEntry[];
  entries_made: number;
}

/** A conversation with nothing in it yet. */
export const EMPTY_AGENT_CONVERSATION: AgentConversation = { entries: [], entries_made: 0 };

function lastIndexWhere<Item>(items: readonly Item[], isTheOne: (item: Item) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && isTheOne(item)) return index;
  }
  return -1;
}

function withAnEntry(conversation: AgentConversation, makeEntry: (entryId: string) => AgentConversationEntry): AgentConversation {
  const entriesMade = conversation.entries_made + 1;
  return { entries: [...conversation.entries, makeEntry(`entry-${entriesMade}`)], entries_made: entriesMade };
}

/** The words a content block shows: its text, or what it names when it is not text. */
export function wordsOfAContentBlock(contentBlock: ContentBlock): string {
  switch (contentBlock.type) {
    case "text":
      return contentBlock.text;
    case "resource_link":
      return contentBlock.uri;
    case "resource":
      return "text" in contentBlock.resource ? contentBlock.resource.text : contentBlock.resource.uri;
    case "image":
      return "[image]";
    case "audio":
      return "[audio]";
  }
}

/** `conversation` with `text` the person sent. */
export function conversationWithThePersonsMessage(conversation: AgentConversation, text: string): AgentConversation {
  return withAnEntry(conversation, (entryId) => ({ kind: "person_message", entry_id: entryId, text }));
}

/** `conversation` with a note on how a turn ended, as a refusal or the agent's limit. */
export function conversationWithATurnNote(conversation: AgentConversation, text: string): AgentConversation {
  return withAnEntry(conversation, (entryId) => ({ kind: "turn_note", entry_id: entryId, text }));
}

function chunkAppended(conversation: AgentConversation, entryKind: "agent_message" | "agent_thought", messageId: string | null, text: string): AgentConversation {
  const last = conversation.entries.at(-1);
  if (last !== undefined && last.kind === entryKind && (messageId === null || last.message_id === messageId)) {
    return { ...conversation, entries: [...conversation.entries.slice(0, -1), { ...last, text: last.text + text }] };
  }
  return withAnEntry(conversation, (entryId) => ({ kind: entryKind, entry_id: entryId, message_id: messageId, text }));
}

function fileChangesIn(content: readonly ToolCallContent[]): AgentFileChange[] {
  return content.flatMap((contentItem) => (contentItem.type === "diff" ? [{ path: contentItem.path, old_text: contentItem.oldText ?? null, new_text: contentItem.newText }] : []));
}

function outputTextIn(content: readonly ToolCallContent[]): string {
  return content.flatMap((contentItem) => (contentItem.type === "content" ? [wordsOfAContentBlock(contentItem.content)] : [])).join("\n");
}

function withTheToolCall(
  conversation: AgentConversation,
  toolCallId: string,
  replace: (before: Extract<AgentConversationEntry, { kind: "tool_call" }>) => Extract<AgentConversationEntry, { kind: "tool_call" }>,
): AgentConversation {
  const entryId = `tool-call:${toolCallId}`;
  const index = conversation.entries.findIndex((entry) => entry.kind === "tool_call" && entry.entry_id === entryId);
  const before = conversation.entries[index];
  if (before === undefined || before.kind !== "tool_call") {
    const made = replace({ kind: "tool_call", entry_id: entryId, title: "Tool call", tool_kind: "other", status: "pending", file_changes: [], locations: [], output_text: "" });
    return { entries: [...conversation.entries, made], entries_made: conversation.entries_made };
  }
  const entries = [...conversation.entries];
  entries[index] = replace(before);
  return { ...conversation, entries };
}

/** `conversation` with one `session/update` applied; updates the panel does not show leave it as it is. */
export function conversationWithTheUpdate(conversation: AgentConversation, update: SessionUpdate): AgentConversation {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return chunkAppended(conversation, "agent_message", update.messageId ?? null, wordsOfAContentBlock(update.content));
    case "agent_thought_chunk":
      return chunkAppended(conversation, "agent_thought", update.messageId ?? null, wordsOfAContentBlock(update.content));
    case "tool_call":
      return withTheToolCall(conversation, update.toolCallId, () => ({
        kind: "tool_call",
        entry_id: `tool-call:${update.toolCallId}`,
        title: update.title,
        tool_kind: update.kind ?? "other",
        status: update.status ?? "pending",
        file_changes: fileChangesIn(update.content ?? []),
        locations: (update.locations ?? []).map((location) => location.path),
        output_text: outputTextIn(update.content ?? []),
      }));
    case "tool_call_update":
      return withTheToolCall(conversation, update.toolCallId, (before) => ({
        ...before,
        title: update.title ?? before.title,
        tool_kind: update.kind ?? before.tool_kind,
        status: update.status ?? before.status,
        file_changes: update.content === undefined || update.content === null ? before.file_changes : [...before.file_changes, ...fileChangesIn(update.content)].filter(
          (change, index, changes) => lastIndexWhere(changes, (later) => later.path === change.path) === index,
        ),
        locations: update.locations === undefined || update.locations === null ? before.locations : update.locations.map((location) => location.path),
        output_text: update.content === undefined || update.content === null ? before.output_text : outputTextIn(update.content) || before.output_text,
      }));
    case "plan": {
      const steps = update.entries.map((planEntry) => ({ content: planEntry.content, status: planEntry.status }));
      const index = lastIndexWhere(conversation.entries, (entry) => entry.kind === "plan");
      const lastPersonMessage = lastIndexWhere(conversation.entries, (entry) => entry.kind === "person_message");
      if (index !== -1 && index > lastPersonMessage) {
        const entries = [...conversation.entries];
        entries[index] = { kind: "plan", entry_id: conversation.entries[index]?.entry_id ?? "plan", steps };
        return { ...conversation, entries };
      }
      return withAnEntry(conversation, (entryId) => ({ kind: "plan", entry_id: entryId, steps }));
    }
    default:
      return conversation;
  }
}

/** `conversation` with a permission request the agent is waiting on, answered by `entry_id`. */
export function conversationWithAPermissionRequest(conversation: AgentConversation, toolTitle: string, choices: AgentPermissionChoice[]): { conversation: AgentConversation; entry_id: string } {
  const next = withAnEntry(conversation, (entryId) => ({ kind: "permission_request", entry_id: entryId, tool_title: toolTitle, choices, answer: null }));
  return { conversation: next, entry_id: next.entries.at(-1)?.entry_id ?? "" };
}

/** `conversation` with the permission request `entryId` answered. */
export function conversationWithThePermissionAnswered(
  conversation: AgentConversation,
  entryId: string,
  answer: { kind: "chosen"; name: string } | { kind: "cancelled" },
): AgentConversation {
  return { ...conversation, entries: conversation.entries.map((entry) => (entry.kind === "permission_request" && entry.entry_id === entryId ? { ...entry, answer } : entry)) };
}
