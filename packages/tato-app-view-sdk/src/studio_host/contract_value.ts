// A control contract type inside a Studio Schema, as where a graph action sits in what a view asks.
// The Studio writes no schema of a contract type: the runtime client's check of it decides.

import { controlContractIssues, type ControlContractComponentName, type ControlContractComponents } from "@tatolab/runtime-client/contract";
import { Effect, Schema, SchemaIssue } from "effect";

/** Whether `sent` is the contract's component `name` as the runtime takes it sent to it. */
function isSentAs<Name extends ControlContractComponentName>(name: Name, sent: unknown): sent is ControlContractComponents[Name] {
  return controlContractIssues(name, sent, "sent").length === 0;
}

/** Why `sent` is not the contract's component `name`: the first issue the client's check gives, at its place inside the value. */
function whyItIsNotSentAs(name: ControlContractComponentName, sent: unknown): SchemaIssue.Issue {
  const [firstIssue] = controlContractIssues(name, sent, "sent");
  const words = `not a ${name} the runtime takes: ${firstIssue?.message ?? "the contract's check refused it"}`;
  return new SchemaIssue.Pointer(firstIssue?.path ?? [], new SchemaIssue.InvalidValue({ message: words }, sent));
}

/**
 * A value of the control contract's component `name`, as the runtime takes it sent to it: a key the contract does not
 * name is refused, as the runtime refuses it. A value that is not one is refused with the first issue the runtime
 * client's check gives, at its place inside the value.
 */
export function contractValue<Name extends ControlContractComponentName>(name: Name) {
  return Schema.declareConstructor<ControlContractComponents[Name]>()(
    [],
    () => (sent) => (isSentAs(name, sent) ? Effect.succeed(sent) : Effect.fail(whyItIsNotSentAs(name, sent))),
    { identifier: name },
  );
}
