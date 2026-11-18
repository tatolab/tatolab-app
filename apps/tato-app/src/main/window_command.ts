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

/**
 * `work`, named `workName`, run on `studioRuntime` to its answer, never rejecting: when it ended without one, as a defect does or a
 * disposed runtime's work does, the answer `answerOfAnEnd` makes of words naming why, the defect logged.
 */
export function answerOnTheStudioRuntime<Answer, Services>(
  studioRuntime: ManagedRuntime.ManagedRuntime<Services, never>,
  workName: string,
  work: Effect.Effect<Answer, never, Services>,
  answerOfAnEnd: (words: string) => Answer,
): Promise<Answer> {
  const endedWithoutAnAnswer = (cause: Cause.Cause<unknown>) => answerOfAnEnd(`${workName} ended without an answer: ${describeCaughtFailure(Cause.squash(cause))}`);
  return studioRuntime
    .runPromiseExit(work.pipe(Effect.catchCause((cause) => Effect.logError(`${workName} ended without an answer`, Cause.pretty(cause)).pipe(Effect.as(endedWithoutAnAnswer(cause))))))
    .then((answered) => (Exit.isSuccess(answered) ? answered.value : endedWithoutAnAnswer(answered.cause)));
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
    answerOnTheStudioRuntime(
      studioRuntime,
      commandName,
      Schema.decodeUnknownEffect(commandArguments)(sent).pipe(
        Effect.mapError((mismatch) => new CommandRefused({ words: `${commandName}: ${mismatch.message}` })),
        Effect.flatMap((decoded) => handler(decoded, commandFromWindow)),
        Effect.match({
          onSuccess: (value): TatolabCommandAnswerTo<CommandName> => ({ ok: true, value }),
          onFailure: (failure): TatolabCommandAnswerTo<CommandName> => ({ ok: false, refusal: failure.words }),
        }),
      ),
      (refusal): TatolabCommandAnswerTo<CommandName> => ({ ok: false, refusal }),
    );
}
