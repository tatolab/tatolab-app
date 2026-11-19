// A control contract type inside a Studio Schema, as where a graph action sits in what a view asks.
// The Studio writes no schema of a contract type: the runtime client's check of it decides.

import { CONTROL_CONTRACT_SCHEMAS, controlContractIssues, type ControlContractComponentName, type ControlContractComponents } from "@tatolab/runtime-client/contract";
import { Effect, Predicate, Schema, SchemaIssue } from "effect";

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

const CONTRACT_COMPONENT_REFERENCE_PREFIX = "#/components/schemas/";

function isAContractComponentName(name: string): name is ControlContractComponentName {
  return Object.hasOwn(CONTROL_CONTRACT_SCHEMAS.components, name);
}

/** The contract component `keyword` and `held`, one member of a JSON Schema, refer to; `null` for a member that is no such reference. */
function componentReferredToAt(keyword: string, held: unknown): ControlContractComponentName | null {
  if (keyword !== "$ref" || !Predicate.isString(held) || !held.startsWith(CONTRACT_COMPONENT_REFERENCE_PREFIX)) return null;
  const name = held.slice(CONTRACT_COMPONENT_REFERENCE_PREFIX.length);
  return isAContractComponentName(name) ? name : null;
}

/** Every contract component `schema` refers to by name. */
function componentsReferredToBy(schema: unknown): ControlContractComponentName[] {
  if (Array.isArray(schema)) return schema.flatMap(componentsReferredToBy);
  if (!Predicate.isObject(schema)) return [];
  return Object.entries(schema).flatMap(([keyword, held]) => {
    const referredTo = componentReferredToAt(keyword, held);
    return referredTo === null ? componentsReferredToBy(held) : [referredTo];
  });
}

/** `schema` with each reference to a contract component pointed at `$defs` of the document it is placed in. */
function referringToDefinitions(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(referringToDefinitions);
  if (!Predicate.isObject(schema)) return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([keyword, held]) => {
      const referredTo = componentReferredToAt(keyword, held);
      return [keyword, referredTo === null ? referringToDefinitions(held) : `#/$defs/${referredTo}`];
    }),
  );
}

/**
 * The JSON Schema of the contract's component `name` and of each component it refers to, as `$defs` of a JSON Schema
 * document, which a `$ref` of `#/$defs/<name>` points at: the runtime client's own schemas, which the Studio writes none of.
 */
export function contractComponentJsonSchemaDefinitions(name: ControlContractComponentName): Record<string, unknown> {
  const definitions: Record<string, unknown> = {};
  const toPlace: ControlContractComponentName[] = [name];
  for (let next = toPlace.pop(); next !== undefined; next = toPlace.pop()) {
    if (Object.hasOwn(definitions, next)) continue;
    const schema = CONTROL_CONTRACT_SCHEMAS.components[next];
    definitions[next] = referringToDefinitions(schema);
    toPlace.push(...componentsReferredToBy(schema));
  }
  return definitions;
}
