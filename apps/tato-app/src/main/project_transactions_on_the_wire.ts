// A project's change feed as the runtime's `read_project_changes` answers it
// (`ProjectTransactionsResourceContents` in `local_api_wire_contract.rs`): applied and
// refused entries in one array, tagged by `status`, which this reads apart into `transactions` and
// `refused_actions`, each keeping the runtime's order; an entry of a `status` newer than this app is
// left out. The runtime orders the array by the second each entry happened, a refusal first on a
// tie, so `applied_at` and `refused_at` merge the two back as it sent them. An `undo` or `redo` tool answers one applied
// transaction with no `status`. A key the runtime leaves out when it has no value reads as `null`;
// every other key a newer runtime adds is ignored. A refusal is read against the contract's own
// refusal through the generated client, so a refusal code this app does not know reads as `refused`.

import type { JsonValue, ProjectActionRefusal, ProjectTransaction, ProjectTransactions, RefusedProjectAction } from "../shared/tatolab_backend_contract.js";
import {
  everyOneRead,
  isAJsonValue,
  jsonObject,
  optionalText,
  requiredArray,
  requiredText,
  requiredUnsignedInteger,
  type JsonObjectOnTheWire,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";
import {
  controlContractRefusalOf,
  type ControlOperationResult,
  type ProjectActionRefusalOnTheWire,
  type SuggestedOperationCall,
} from "./tatolab_runtime_control_operation_call.js";

function jsonValuesOf(values: readonly unknown[], key: string): Result<JsonValue[], string> {
  return everyOneRead(values, (value) => (isAJsonValue(value) ? succeeded(value) : failedWith(`an entry of ${key} is not JSON`)));
}

function jsonValuesAt(fields: JsonObjectOnTheWire, key: string): Result<JsonValue[], string> {
  const values = requiredArray(fields, key);
  return values.ok ? jsonValuesOf(values.value, key) : values;
}

function projectTransactionFromItsFields(fields: JsonObjectOnTheWire): Result<ProjectTransaction, string> {
  const formatVersion = requiredUnsignedInteger(fields, "format_version");
  if (!formatVersion.ok) return formatVersion;
  const transaction = requiredText(fields, "transaction");
  if (!transaction.ok) return transaction;
  const commit = requiredText(fields, "commit");
  if (!commit.ok) return commit;
  const parentCommit = optionalText(fields, "parent_commit");
  if (!parentCommit.ok) return parentCommit;
  const authorKind = requiredText(fields, "author_kind");
  if (!authorKind.ok) return authorKind;
  const authorName = requiredText(fields, "author_name");
  if (!authorName.ok) return authorName;
  const operations = jsonValuesAt(fields, "operations");
  if (!operations.ok) return operations;
  const inverseOperations = jsonValuesAt(fields, "inverse_operations");
  if (!inverseOperations.ok) return inverseOperations;
  const undoes = optionalText(fields, "undoes");
  if (!undoes.ok) return undoes;
  const redoes = optionalText(fields, "redoes");
  if (!redoes.ok) return redoes;
  const idempotencyKey = optionalText(fields, "idempotency_key");
  if (!idempotencyKey.ok) return idempotencyKey;
  const undoState = optionalText(fields, "undo_state");
  if (!undoState.ok) return undoState;
  const appliedAt = requiredText(fields, "applied_at");
  if (!appliedAt.ok) return appliedAt;
  return succeeded({
    format_version: formatVersion.value,
    transaction: transaction.value,
    commit: commit.value,
    parent_commit: parentCommit.value,
    author_kind: authorKind.value,
    author_name: authorName.value,
    operations: operations.value,
    inverse_operations: inverseOperations.value,
    undoes: undoes.value,
    redoes: redoes.value,
    idempotency_key: idempotencyKey.value,
    undo_state: undoState.value,
    applied_at: appliedAt.value,
  });
}

/** `call`'s params as JSON, or `null` when one of them is not JSON: the client reads an integer past `Number.MAX_SAFE_INTEGER` as a `bigint`. */
function suggestedCallOfTheContract(call: SuggestedOperationCall): ProjectActionRefusal["suggested_call"] {
  const params: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(call.params)) {
    if (!isAJsonValue(value)) return null;
    params[key] = value;
  }
  return { operation: call.operation, params };
}

/**
 * `refusal`, the contract's refusal as the generated runtime client read it, in Studio's shape: its code, its words and each place
 * Studio reads, `null` for each it leaves out. Each field is assigned from the contract's own type, so a Studio shape the contract's
 * values do not fit does not compile. `not_running_because` is not read yet.
 */
export function projectActionRefusalOfTheContract(refusal: ProjectActionRefusalOnTheWire): ProjectActionRefusal {
  return {
    refusal_code: refusal.refusal_code,
    action: refusal.action,
    refused_operation_index: refusal.refused_operation_index ?? null,
    refused_node: refusal.refused_node ?? null,
    refused_link: refusal.refused_link ?? null,
    refused_field: refusal.refused_field ?? null,
    refused_params_pointer: refusal.refused_params_pointer ?? null,
    refused_file: refusal.refused_file ?? null,
    suggested_call: refusal.suggested_call === undefined || refusal.suggested_call === null ? null : suggestedCallOfTheContract(refusal.suggested_call),
    runtime_words: refusal.runtime_words,
  };
}

/** The structured refusal `fields` carries under `refusal`, as the feed's refused actions do, read against the contract's refusal; or why it cannot be read. */
export function projectActionRefusalAt(fields: JsonObjectOnTheWire): Result<ProjectActionRefusal, string> {
  const refusal = controlContractRefusalOf(fields["refusal"]);
  return refusal.ok ? succeeded(projectActionRefusalOfTheContract(refusal.value)) : failedWith(`a refused action's refusal is not the contract's refusal: ${refusal.failure}`);
}

function refusedProjectActionFromItsFields(fields: JsonObjectOnTheWire): Result<RefusedProjectAction, string> {
  const authorKind = requiredText(fields, "author_kind");
  if (!authorKind.ok) return authorKind;
  const authorName = requiredText(fields, "author_name");
  if (!authorName.ok) return authorName;
  const mode = requiredText(fields, "mode");
  if (!mode.ok) return mode;
  const operations = jsonValuesAt(fields, "operations");
  if (!operations.ok) return operations;
  const idempotencyKey = optionalText(fields, "idempotency_key");
  if (!idempotencyKey.ok) return idempotencyKey;
  const refusal = projectActionRefusalAt(fields);
  if (!refusal.ok) return refusal;
  const refusedAt = requiredText(fields, "refused_at");
  if (!refusedAt.ok) return refusedAt;
  return succeeded({
    author_kind: authorKind.value,
    author_name: authorName.value,
    mode: mode.value,
    operations: operations.value,
    idempotency_key: idempotencyKey.value,
    refusal: refusal.value,
    refused_at: refusedAt.value,
  });
}

type ChangeFeedEntry = { status: "applied"; transaction: ProjectTransaction } | { status: "refused"; refused_action: RefusedProjectAction } | { status: "newer_than_this_app" };

function changeFeedEntryOnTheWire(value: unknown): Result<ChangeFeedEntry, string> {
  const fields = jsonObject(value, "a change feed entry");
  if (!fields.ok) return fields;
  const status = requiredText(fields.value, "status");
  if (!status.ok) return status;
  if (status.value === "applied") {
    const transaction = projectTransactionFromItsFields(fields.value);
    return transaction.ok ? succeeded({ status: "applied", transaction: transaction.value }) : transaction;
  }
  if (status.value === "refused") {
    const refusedAction = refusedProjectActionFromItsFields(fields.value);
    return refusedAction.ok ? succeeded({ status: "refused", refused_action: refusedAction.value }) : refusedAction;
  }
  return succeeded({ status: "newer_than_this_app" });
}

/** The change feed `read_project_changes` answers, or why it could not be read. */
export function projectTransactionsFromTheChangeFeed(changeFeed: unknown): Result<ProjectTransactions, string> {
  const fields = jsonObject(changeFeed, "the change feed");
  if (!fields.ok) return failedWith(`the project's change feed could not be read: ${fields.failure}`);
  const project = requiredText(fields.value, "project");
  const projectDirectory = requiredText(fields.value, "project_directory");
  const entries = requiredArray(fields.value, "transactions");
  if (!project.ok || !projectDirectory.ok || !entries.ok) {
    const failure = [project, projectDirectory, entries].find((field) => !field.ok);
    return failedWith(`the project's change feed could not be read: ${failure !== undefined && !failure.ok ? failure.failure : "a field is missing"}`);
  }
  const readEntries = everyOneRead(entries.value, changeFeedEntryOnTheWire);
  if (!readEntries.ok) return failedWith(`the project's change feed could not be read: ${readEntries.failure}`);
  return succeeded({
    project: project.value,
    project_directory: projectDirectory.value,
    transactions: readEntries.value.flatMap((entry) => (entry.status === "applied" ? [entry.transaction] : [])),
    refused_actions: readEntries.value.flatMap((entry) => (entry.status === "refused" ? [entry.refused_action] : [])),
  });
}

/** The transaction an `undo` or `redo` tool answered with `operationResult`, or why it could not be read. */
export function projectTransactionFromTheUndoOrRedoToolResult(toolName: "undo" | "redo", operationResult: ControlOperationResult<"undo" | "redo">): Result<ProjectTransaction, string> {
  const fields = jsonObject(operationResult, `the ${toolName} result`);
  const transaction = fields.ok ? projectTransactionFromItsFields(fields.value) : fields;
  return transaction.ok ? transaction : failedWith(`the runtime's ${toolName} result could not be read: ${transaction.failure}`);
}

