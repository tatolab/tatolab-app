// The edge where a window's command starts an Effect. A converted command is declared once: its
// name, the Schema its arguments are decoded with, and its handler. It answers in the contract's
// plain shape and never rejects: an expected failure answers its words, and a defect is logged and
// answers that the command ended without an answer.

import { Cause, Data, Effect, Exit, type ManagedRuntime, Schema } from "effect";
import type { TatolabCommandAnswerTo, TatolabCommandName, TatolabCommandSignatures } from "../shared/tatolab_electron_bridge_contract.js";
import { describeCaughtFailure } from "./result.js";
import type { TatolabCommandFromWindow } from "./tatolab_command_answers.js";

/** Studio refused the command before it reached the runtime, in Studio's words. */
export class CommandRefused extends Data.TaggedError("CommandRefused")<{ readonly words: string }> {}

/** What the command `commandName` answers when it ended without an answer: `cause` was a defect, or the runtime that ran it was disposed. */
function refusalOfACommandThatEndedWithoutAnAnswer(commandName: TatolabCommandName, cause: Cause.Cause<unknown>): { ok: false; refusal: string } {
  return { ok: false, refusal: `${commandName} ended without an answer: ${describeCaughtFailure(Cause.squash(cause))}` };
}

/**
 * The handler of the window's command `commandName` on `studioRuntime`: the arguments the window sent decoded with
 * `commandArguments`, a mismatch refused with the command's name and the Schema's message, then `handler`'s answer, or
 * the words of the failure it ended with.
 */
export function windowCommand<CommandName extends TatolabCommandName, Services>(
  studioRuntime: ManagedRuntime.ManagedRuntime<Services, never>,
  commandName: CommandName,
  commandArguments: Schema.Decoder<TatolabCommandSignatures[CommandName]["commandArguments"]>,
  handler: (
    decoded: TatolabCommandSignatures[CommandName]["commandArguments"],
    commandFromWindow: TatolabCommandFromWindow,
  ) => Effect.Effect<TatolabCommandSignatures[CommandName]["answer"], { readonly words: string }, Services>,
): (sent: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<CommandName>> {
  return (sent, commandFromWindow) =>
    studioRuntime
      .runPromiseExit(
        Schema.decodeUnknownEffect(commandArguments)(sent).pipe(
          Effect.mapError((mismatch) => new CommandRefused({ words: `${commandName}: ${mismatch.message}` })),
          Effect.flatMap((decoded) => handler(decoded, commandFromWindow)),
          Effect.match({
            onSuccess: (value): TatolabCommandAnswerTo<CommandName> => ({ ok: true, value }),
            onFailure: (failure): TatolabCommandAnswerTo<CommandName> => ({ ok: false, refusal: failure.words }),
          }),
          Effect.catchCause((cause) =>
            Effect.logError(`${commandName} ended without an answer`, Cause.pretty(cause)).pipe(Effect.as(refusalOfACommandThatEndedWithoutAnAnswer(commandName, cause))),
          ),
        ),
      )
      .then((answered) => (Exit.isSuccess(answered) ? answered.value : refusalOfACommandThatEndedWithoutAnAnswer(commandName, answered.cause)));
}
