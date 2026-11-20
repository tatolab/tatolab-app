// The call a refusal suggests, read as a graph edit when it is one: a `transact` whose params are the
// control contract's, by the runtime client's check, name nothing the graph-edit command does not send
// as given, and commit, so the edit is one step Undo takes back and its key applies it once. A suggested
// read, such as `describe_operations`, is no edit.

import { controlContractIssues, type ControlContractComponents } from "@tatolab/runtime-client/contract";
import type { GraphEditMode, StreamGraphAction } from "./studio_readings.js";

/** A refusal's suggested call that is a graph edit: the `transact` operations the runtime named, unchanged, committed. */
export type SuggestedGraphEdit = { operations: readonly StreamGraphAction[]; mode: Extract<GraphEditMode, "commit"> };

/** The params of `transact` the graph-edit command sends as given; it names the author and the gesture's key itself. */
const PARAMS_SENT_AS_GIVEN: ReadonlySet<string> = new Set(["operations", "mode"]);

function isATransactRequest(params: unknown): params is ControlContractComponents["TransactRequest"] {
  return controlContractIssues("TransactRequest", params, "sent").length === 0;
}

/** The graph edit `suggested`, a refusal's `suggested_call`, names, or `null` when it names none: a call other than `transact`, no operation, a mode other than `commit`, or a param the graph-edit command does not send as given. */
export function suggestedGraphEditOf(suggested: { readonly operation: string; readonly params: { readonly [param: string]: unknown } } | null | undefined): SuggestedGraphEdit | null {
  if (suggested === null || suggested === undefined || suggested.operation !== "transact") return null;
  const { params } = suggested;
  if (!Object.keys(params).every((param) => PARAMS_SENT_AS_GIVEN.has(param)) || !isATransactRequest(params)) return null;
  if (params.operations.length === 0 || (params.mode !== undefined && params.mode !== null && params.mode !== "commit")) return null;
  return { operations: params.operations, mode: "commit" };
}
