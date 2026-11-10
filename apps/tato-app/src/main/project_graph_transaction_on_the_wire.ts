// What the runtime's `transact` answers (`GraphTransactionToolResult` in `local_api_wire_contract.rs`): the
// transaction applied, its `transaction` and `commit` left out on a live one, `added_groups` and `added_notes` left
// out when empty; and the structured refusal a refused action carries under `structuredContent.refusal`
// (`ProjectActionRefusalOnTheWire`), each optional key left out when the refusal names none. Every other key a
// newer runtime adds is ignored.

import type { GraphLinkEnd, JsonValue, ProjectActionRefusal, ProjectGraphTransaction } from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  isAJsonValue,
  isAnUnsignedInteger,
  jsonObject,
  type JsonObjectOnTheWire,
  optionalObject,
  optionalText,
  parseJsonOnTheWire,
  requiredArray,
  requiredText,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

function graphLinkEndOnTheWire(value: unknown, what: string): Result<GraphLinkEnd, string> {
  const fields = jsonObject(value, what);
  if (!fields.ok) return fields;
  const node = requiredText(fields.value, "node");
  if (!node.ok) return node;
  const port = requiredText(fields.value, "port");
  return port.ok ? succeeded({ node: node.value, port: port.value }) : port;
}

function linkEndsOnTheWire(fields: JsonObjectOnTheWire): Result<{ source: GraphLinkEnd; target: GraphLinkEnd }, string> {
  const source = graphLinkEndOnTheWire(fields["source"], "a link's source");
  if (!source.ok) return source;
  const target = graphLinkEndOnTheWire(fields["target"], "a link's target");
  return target.ok ? succeeded({ source: source.value, target: target.value }) : target;
}

type AddedNode = ProjectGraphTransaction["added_nodes"][number];
type ConnectedLink = ProjectGraphTransaction["connected_links"][number];
type AddedGroup = ProjectGraphTransaction["added_groups"][number];
type AddedNote = ProjectGraphTransaction["added_notes"][number];

function addedNodeOnTheWire(value: unknown): Result<AddedNode, string> {
  const fields = jsonObject(value, "an added node");
  if (!fields.ok) return fields;
  const stream = requiredText(fields.value, "stream");
  if (!stream.ok) return stream;
  const node = requiredText(fields.value, "node");
  if (!node.ok) return node;
  const name = requiredText(fields.value, "name");
  if (!name.ok) return name;
  const label = optionalText(fields.value, "as");
  return label.ok ? succeeded({ stream: stream.value, node: node.value, name: name.value, as: label.value }) : label;
}

function connectedLinkOnTheWire(value: unknown): Result<ConnectedLink, string> {
  const fields = jsonObject(value, "a connected link");
  if (!fields.ok) return fields;
  const stream = requiredText(fields.value, "stream");
  if (!stream.ok) return stream;
  const ends = linkEndsOnTheWire(fields.value);
  if (!ends.ok) return ends;
  const state = optionalText(fields.value, "state");
  if (!state.ok) return state;
  const errorReason = optionalText(fields.value, "error_reason");
  return errorReason.ok ? succeeded({ stream: stream.value, ...ends.value, state: state.value, error_reason: errorReason.value }) : errorReason;
}

function addedGroupOnTheWire(value: unknown): Result<AddedGroup, string> {
  const fields = jsonObject(value, "an added group");
  if (!fields.ok) return fields;
  const stream = requiredText(fields.value, "stream");
  if (!stream.ok) return stream;
  const group = requiredText(fields.value, "group");
  if (!group.ok) return group;
  const title = requiredText(fields.value, "title");
  return title.ok ? succeeded({ stream: stream.value, group: group.value, title: title.value }) : title;
}

function addedNoteOnTheWire(value: unknown): Result<AddedNote, string> {
  const fields = jsonObject(value, "an added note");
  if (!fields.ok) return fields;
  const stream = requiredText(fields.value, "stream");
  if (!stream.ok) return stream;
  const note = requiredText(fields.value, "note");
  return note.ok ? succeeded({ stream: stream.value, note: note.value }) : note;
}

function appliedOperationOnTheWire(value: unknown): Result<JsonValue, string> {
  return isAJsonValue(value) ? succeeded(value) : failedWith("an applied operation is not JSON");
}

function projectGraphTransactionFromItsFields(fields: JsonObjectOnTheWire): Result<ProjectGraphTransaction, string> {
  const mode = requiredText(fields, "mode");
  if (!mode.ok) return mode;
  const transaction = optionalText(fields, "transaction");
  if (!transaction.ok) return transaction;
  const commit = optionalText(fields, "commit");
  if (!commit.ok) return commit;
  const operations = requiredArray(fields, "operations");
  const appliedOperations = operations.ok ? everyOneRead(operations.value, appliedOperationOnTheWire) : operations;
  if (!appliedOperations.ok) return appliedOperations;
  const addedNodesOnTheWire = requiredArray(fields, "added_nodes");
  const addedNodes = addedNodesOnTheWire.ok ? everyOneRead(addedNodesOnTheWire.value, addedNodeOnTheWire) : addedNodesOnTheWire;
  if (!addedNodes.ok) return addedNodes;
  const connectedLinksOnTheWire = requiredArray(fields, "connected_links");
  const connectedLinks = connectedLinksOnTheWire.ok ? everyOneRead(connectedLinksOnTheWire.value, connectedLinkOnTheWire) : connectedLinksOnTheWire;
  if (!connectedLinks.ok) return connectedLinks;
  const addedGroupsOnTheWire = arrayOrEmpty(fields, "added_groups");
  const addedGroups = addedGroupsOnTheWire.ok ? everyOneRead(addedGroupsOnTheWire.value, addedGroupOnTheWire) : addedGroupsOnTheWire;
  if (!addedGroups.ok) return addedGroups;
  const addedNotesOnTheWire = arrayOrEmpty(fields, "added_notes");
  const addedNotes = addedNotesOnTheWire.ok ? everyOneRead(addedNotesOnTheWire.value, addedNoteOnTheWire) : addedNotesOnTheWire;
  if (!addedNotes.ok) return addedNotes;
  return succeeded({
    mode: mode.value,
    transaction: transaction.value,
    commit: commit.value,
    operations: appliedOperations.value,
    added_nodes: addedNodes.value,
    connected_links: connectedLinks.value,
    added_groups: addedGroups.value,
    added_notes: addedNotes.value,
  });
}

/** The transaction a graph tool answered with `toolResultText`, or why it could not be read. */
export function projectGraphTransactionFromTheTransactToolResult(toolResultText: string): Result<ProjectGraphTransaction, string> {
  const parsed = parseJsonOnTheWire(toolResultText);
  const fields = parsed.ok ? jsonObject(parsed.value, "the transact result") : parsed;
  const transaction = fields.ok ? projectGraphTransactionFromItsFields(fields.value) : fields;
  return transaction.ok ? transaction : failedWith(`the runtime's transact answer could not be read: ${transaction.failure}`);
}

function optionalOperationIndex(fields: JsonObjectOnTheWire): Result<number | null, string> {
  const index = fields["refused_operation_index"];
  if (index === undefined || index === null) return succeeded(null);
  return isAnUnsignedInteger(index) ? succeeded(index) : failedWith("refused_operation_index is not an unsigned integer");
}

/** The structured refusal a refused action's `structuredContent` carries under `refusal`, or why it carries none that can be read. */
export function projectActionRefusalFromTheStructuredContent(structuredContent: unknown): Result<ProjectActionRefusal, string> {
  if (!isAJsonObject(structuredContent)) return failedWith("the refusal carries no structured content");
  const fields = jsonObject(structuredContent["refusal"], "the refusal");
  if (!fields.ok) return fields;
  const action = requiredText(fields.value, "action");
  if (!action.ok) return action;
  const refusedOperationIndex = optionalOperationIndex(fields.value);
  if (!refusedOperationIndex.ok) return refusedOperationIndex;
  const refusedNode = optionalText(fields.value, "refused_node");
  if (!refusedNode.ok) return refusedNode;
  const refusedLinkFields = optionalObject(fields.value, "refused_link");
  if (!refusedLinkFields.ok) return refusedLinkFields;
  const refusedLink = refusedLinkFields.value === null ? succeeded(null) : linkEndsOnTheWire(refusedLinkFields.value);
  if (!refusedLink.ok) return refusedLink;
  const refusedField = optionalText(fields.value, "refused_field");
  if (!refusedField.ok) return refusedField;
  const runtimeWords = requiredText(fields.value, "runtime_words");
  if (!runtimeWords.ok) return runtimeWords;
  return succeeded({
    action: action.value,
    refused_operation_index: refusedOperationIndex.value,
    refused_node: refusedNode.value,
    refused_link: refusedLink.value,
    refused_field: refusedField.value,
    runtime_words: runtimeWords.value,
  });
}
