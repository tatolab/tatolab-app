// A project's change feed as the runtime's `streamlib://project/<project>/transactions` resource
// renders it (`ProjectTransactionsResourceContents` in `local_api_wire_contract.rs`), and the
// transaction its `undo` and `redo` tools answer. A transaction that is no undo or redo leaves
// `undoes` and `redoes` out, and a runtime from before streamlib #3426 leaves `applied_at` out; every other key a newer runtime adds is ignored.

import type { JsonValue, ProjectTransaction, ProjectTransactions } from "../shared/tatolab_backend_contract.js";
import { everyOneRead, isAJsonValue, jsonObject, optionalText, parseJsonOnTheWire, requiredArray, requiredText, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

function jsonValuesOf(values: readonly unknown[], key: string): Result<JsonValue[], string> {
  return everyOneRead(values, (value) => (isAJsonValue(value) ? succeeded(value) : failedWith(`an entry of ${key} is not JSON`)));
}

function projectTransactionOnTheWire(value: unknown): Result<ProjectTransaction, string> {
  const fields = jsonObject(value, "a transaction");
  if (!fields.ok) return fields;
  return projectTransactionFromItsFields(fields.value);
}

function projectTransactionFromItsFields(fields: JsonObjectOnTheWire): Result<ProjectTransaction, string> {
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
  const operations = requiredArray(fields, "operations");
  if (!operations.ok) return operations;
  const operationValues = jsonValuesOf(operations.value, "operations");
  if (!operationValues.ok) return operationValues;
  const inverseOperations = requiredArray(fields, "inverse_operations");
  if (!inverseOperations.ok) return inverseOperations;
  const inverseOperationValues = jsonValuesOf(inverseOperations.value, "inverse_operations");
  if (!inverseOperationValues.ok) return inverseOperationValues;
  const undoes = optionalText(fields, "undoes");
  if (!undoes.ok) return undoes;
  const redoes = optionalText(fields, "redoes");
  if (!redoes.ok) return redoes;
  const appliedAt = optionalText(fields, "applied_at");
  if (!appliedAt.ok) return appliedAt;
  return succeeded({
    transaction: transaction.value,
    commit: commit.value,
    parent_commit: parentCommit.value,
    author_kind: authorKind.value,
    author_name: authorName.value,
    operations: operationValues.value,
    inverse_operations: inverseOperationValues.value,
    undoes: undoes.value,
    redoes: redoes.value,
    applied_at: appliedAt.value,
  });
}

/** The change feed the resource's text `resourceText` holds, or why it could not be read. */
export function projectTransactionsFromTheResourceText(resourceText: string): Result<ProjectTransactions, string> {
  const parsed = parseJsonOnTheWire(resourceText);
  const fields = parsed.ok ? jsonObject(parsed.value, "the change feed") : parsed;
  if (!fields.ok) return failedWith(`the project's change feed could not be read: ${fields.failure}`);
  const project = requiredText(fields.value, "project");
  const projectDirectory = requiredText(fields.value, "project_directory");
  const transactions = requiredArray(fields.value, "transactions");
  if (!project.ok || !projectDirectory.ok || !transactions.ok) {
    const failure = [project, projectDirectory, transactions].find((field) => !field.ok);
    return failedWith(`the project's change feed could not be read: ${failure !== undefined && !failure.ok ? failure.failure : "a field is missing"}`);
  }
  const readTransactions = everyOneRead(transactions.value, projectTransactionOnTheWire);
  if (!readTransactions.ok) return failedWith(`the project's change feed could not be read: ${readTransactions.failure}`);
  return succeeded({ project: project.value, project_directory: projectDirectory.value, transactions: readTransactions.value });
}

/** The transaction an `undo` or `redo` tool answered with `toolResultText`, or why it could not be read. */
export function projectTransactionFromTheUndoOrRedoToolResult(toolName: "undo" | "redo", toolResultText: string): Result<ProjectTransaction, string> {
  const parsed = parseJsonOnTheWire(toolResultText);
  const fields = parsed.ok ? jsonObject(parsed.value, `the ${toolName} result`) : parsed;
  const transaction = fields.ok ? projectTransactionFromItsFields(fields.value) : fields;
  return transaction.ok ? transaction : failedWith(`the runtime's ${toolName} result could not be read: ${transaction.failure}`);
}

/** The change-feed resource `list_assets` names under `transactions_resource_uri`, or why it names none. */
export function transactionsResourceUriFromTheListAssetsToolResult(toolResultText: string): Result<string, string> {
  const parsed = parseJsonOnTheWire(toolResultText);
  const fields = parsed.ok ? jsonObject(parsed.value, "the listing") : parsed;
  const uri = fields.ok ? requiredText(fields.value, "transactions_resource_uri") : fields;
  return uri.ok ? uri : failedWith(`the runtime's list_assets result names no change feed: ${uri.failure}`);
}
