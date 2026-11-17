// The arguments of `transact_in_the_open_project` as the window sends them, decoded once in main.
// The bridge contract takes their type from here with `import type`, so the window's typed call and
// main's decode cannot drift, and neither preload nor the window carries Schema code.

import { Schema } from "effect";
import { graphEditModeSchema, streamGraphActionSchema } from "./tatolab_backend_contract.js";

/** What a view SDK schema of a contract type answers about a value it checks: the value as that type, or the issues that say why not. */
type SdkSchemaCheck<ContractType> = { success: true; data: ContractType } | { success: false; error: { issues: readonly { message: string }[] } };

/**
 * A value of a contract type, checked by the view SDK's schema of it, `sdkSchema`, until the runtime's client exports a guard;
 * a value that is not one is refused as not `whatItIs`, with the first reason the schema gives.
 */
function contractValueCheckedBy<ContractType>(whatItIs: string, sdkSchema: { safeParse: (sent: unknown) => SdkSchemaCheck<ContractType> }) {
  return Schema.Unknown.pipe(
    Schema.check(
      Schema.makeFilter(
        (sent: unknown) => {
          const checked = sdkSchema.safeParse(sent);
          return checked.success || `not ${whatItIs}: ${checked.error.issues[0]?.message ?? "it does not parse"}`;
        },
        undefined,
        true,
      ),
    ),
    Schema.refine((sent: unknown): sent is ContractType => sdkSchema.safeParse(sent).success),
  );
}

/** The graph actions a studio window sends as one transaction, at least one, with their mode and the gesture's idempotency key or none. */
export const TransactInTheOpenProjectArguments = Schema.Struct({
  operations: Schema.Array(contractValueCheckedBy("a graph action the runtime takes", streamGraphActionSchema)).check(Schema.isNonEmpty()),
  mode: contractValueCheckedBy("a graph edit mode, commit or live", graphEditModeSchema),
  idempotency_key: Schema.NullOr(Schema.String),
});

/** The graph actions a studio window sends as one transaction, under its gesture's idempotency key or none. */
export type ProjectGraphTransactionSentByTheWindow = typeof TransactInTheOpenProjectArguments.Type;
