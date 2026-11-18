// How a call to the runtime's control API fails, each way named for what happened and carrying the
// `words` a person is shown. A refusal's words are the runtime's own, never rewritten.

import { Data } from "effect";
import type { ControlContractVersionMismatch, ProjectActionRefusalOnTheWire } from "./tatolab_runtime_control_operation_call.js";

/**
 * The runtime answered `operation` and said no: `byTheOperation` when the operation itself refused or failed, otherwise its
 * control API refused the call; `refusal` is the contract's whole structured refusal when the runtime sent one, under
 * whatever JSON-RPC code, so a refusal of the params (`-32602`) or of the operation (`-32601`) keeps its code and place too.
 */
export class RuntimeRefused extends Data.TaggedError("RuntimeRefused")<{
  readonly operation: string;
  readonly words: string;
  readonly byTheOperation: boolean;
  readonly refusal: ProjectActionRefusalOnTheWire | undefined;
}> {}

/** Nothing listens on the local API socket, or nothing answered `operation` there. */
export class RuntimeUnreachable extends Data.TaggedError("RuntimeUnreachable")<{
  readonly operation: string;
  readonly words: string;
}> {}

/** No answer to `operation` came within its time limit. */
export class RuntimeTimedOut extends Data.TaggedError("RuntimeTimedOut")<{
  readonly operation: string;
  readonly words: string;
}> {}

/** The params sent to `operation` (`request`) or the answer to it (`answer`) are not `contractType`, the control contract's type for them. */
export class ContractMismatch extends Data.TaggedError("ContractMismatch")<{
  readonly operation: string;
  readonly contractType: string;
  readonly words: string;
  readonly direction: "request" | "answer";
}> {}

/** The runtime refused `operation` because this Studio was built against another control contract than it serves; `mismatch` is its record of which side is older. */
export class RuntimeOfAnotherContract extends Data.TaggedError("RuntimeOfAnotherContract")<{
  readonly operation: string;
  readonly words: string;
  readonly mismatch: ControlContractVersionMismatch;
}> {}

/** Every way a call to the runtime's control API fails. */
export type RuntimeControlFailure = RuntimeRefused | RuntimeUnreachable | RuntimeTimedOut | ContractMismatch | RuntimeOfAnotherContract;
