import { expect, test } from "vitest";
import {
  conversationWithAPermissionRequest,
  conversationWithThePermissionAnswered,
  conversationWithThePersonsMessage,
  conversationWithTheUpdate,
  EMPTY_AGENT_CONVERSATION,
  type AgentConversation,
} from "./agent_conversation";
import { linesAddedAndRemoved } from "./agent_view_type";

test("an agent's message chunks join into one message until another message id begins", () => {
  let conversation: AgentConversation = conversationWithThePersonsMessage(EMPTY_AGENT_CONVERSATION, "hi");
  conversation = conversationWithTheUpdate(conversation, { sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "Hel" } });
  conversation = conversationWithTheUpdate(conversation, { sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "lo" } });
  conversation = conversationWithTheUpdate(conversation, { sessionUpdate: "agent_message_chunk", messageId: "m2", content: { type: "text", text: "Next" } });
  expect(conversation.entries.map((entry) => ("text" in entry ? entry.text : entry.kind))).toEqual(["hi", "Hello", "Next"]);
});

test("a thought is its own entry beside the message", () => {
  let conversation = conversationWithTheUpdate(EMPTY_AGENT_CONVERSATION, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } });
  conversation = conversationWithTheUpdate(conversation, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "said" } });
  expect(conversation.entries.map((entry) => entry.kind)).toEqual(["agent_thought", "agent_message"]);
});

test("a tool call's updates change its one entry, keeping the latest diff of each file", () => {
  let conversation = conversationWithTheUpdate(EMPTY_AGENT_CONVERSATION, {
    sessionUpdate: "tool_call",
    toolCallId: "t1",
    title: "Edit stream.py",
    kind: "edit",
    status: "pending",
    content: [{ type: "diff", path: "/p/stream.py", oldText: "a", newText: "b" }],
  });
  conversation = conversationWithTheUpdate(conversation, {
    sessionUpdate: "tool_call_update",
    toolCallId: "t1",
    status: "completed",
    content: [
      { type: "diff", path: "/p/stream.py", oldText: "a", newText: "c" },
      { type: "content", content: { type: "text", text: "done" } },
    ],
  });
  expect(conversation.entries).toHaveLength(1);
  expect(conversation.entries[0]).toMatchObject({
    kind: "tool_call",
    entry_id: "tool-call:t1",
    title: "Edit stream.py",
    status: "completed",
    file_changes: [{ path: "/p/stream.py", old_text: "a", new_text: "c" }],
    output_text: "done",
  });
});

test("an update for a tool call not yet told makes its entry", () => {
  const conversation = conversationWithTheUpdate(EMPTY_AGENT_CONVERSATION, { sessionUpdate: "tool_call_update", toolCallId: "late", status: "in_progress" });
  expect(conversation.entries[0]).toMatchObject({ kind: "tool_call", title: "Tool call", status: "in_progress" });
});

test("a plan is replaced within a turn and begun anew after the person's next message", () => {
  const plan = (content: string) => ({ sessionUpdate: "plan" as const, entries: [{ content, priority: "medium" as const, status: "pending" as const }] });
  let conversation = conversationWithTheUpdate(EMPTY_AGENT_CONVERSATION, plan("first"));
  conversation = conversationWithTheUpdate(conversation, plan("revised"));
  expect(conversation.entries).toHaveLength(1);
  conversation = conversationWithThePersonsMessage(conversation, "again");
  conversation = conversationWithTheUpdate(conversation, plan("second turn"));
  expect(conversation.entries.map((entry) => entry.kind)).toEqual(["plan", "person_message", "plan"]);
});

test("updates the panel does not show leave the conversation as it is", () => {
  expect(conversationWithTheUpdate(EMPTY_AGENT_CONVERSATION, { sessionUpdate: "available_commands_update", availableCommands: [] })).toBe(EMPTY_AGENT_CONVERSATION);
});

test("a permission request is answered by its entry id", () => {
  const asked = conversationWithAPermissionRequest(EMPTY_AGENT_CONVERSATION, "Edit stream.py", [{ option_id: "allow_once", name: "Allow", kind: "allow_once" }]);
  const answered = conversationWithThePermissionAnswered(asked.conversation, asked.entry_id, { kind: "chosen", name: "Allow" });
  expect(answered.entries[0]).toMatchObject({ kind: "permission_request", answer: { kind: "chosen", name: "Allow" } });
});

test("a file change counts the lines it added and removed", () => {
  expect(linesAddedAndRemoved({ path: "p", old_text: "a\nb\nc", new_text: "a\nB\nc" })).toEqual({ lines_added: 1, lines_removed: 1 });
  expect(linesAddedAndRemoved({ path: "p", old_text: null, new_text: "a\nb" })).toEqual({ lines_added: 2, lines_removed: 0 });
});
