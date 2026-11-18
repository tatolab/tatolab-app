import type { TatolabCommandAnswerTo, TatolabCommandName } from "../shared/tatolab_electron_bridge_contract.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import type { StudioWindowOfAProject } from "./tatolab_app_windows.js";

/** `work`'s answer to the command `commandName`; a failure nothing expected becomes a refusal naming the command. */
export async function answerTheWindow<Answer>(commandName: string, work: () => Promise<Result<Answer, string>>): Promise<Result<Answer, string>> {
  try {
    return await work();
  } catch (unexpectedFailure) {
    return failedWith(`${commandName} ended without an answer: ${describeCaughtFailure(unexpectedFailure)}`);
  }
}

/** `work`'s answer to the command `commandName`, then a status round whether it was carried out or refused, so the window sees what it changed. */
export function answerTheWindowThenRefreshTheStatus(
  sharedState: TatolabAppSharedState,
  commandName: string,
  work: () => Promise<Result<void, string>>,
): Promise<Result<void, string>> {
  return answerTheWindow(commandName, async () => {
    const answer = await work();
    sharedState.statusPublisher.requestRefresh();
    return answer;
  });
}

/** The window a command came from, by its page's contents id. */
export interface TatolabCommandFromWindow {
  windowContentsId: number;
}

/** Why a command about a window's own project is refused in the Projects window. */
export const NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL = "No project is open in this window.";

/** The studio window whose project `commandFromWindow` acts on, its own page or a view popped out of it, or why there is none. */
export function studioWindowTheCommandCameFrom(sharedState: TatolabAppSharedState, commandFromWindow: TatolabCommandFromWindow): Result<StudioWindowOfAProject, string> {
  const studioWindow = sharedState.appWindows.studioWindowServingTheContents(commandFromWindow.windowContentsId);
  return studioWindow === null ? failedWith(NO_PROJECT_IN_THE_PROJECTS_WINDOW_REFUSAL) : succeeded(studioWindow);
}

/** Whether `value` is text or `null`. */
export function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** The text argument `argumentName` of the command `commandName`, or why the window's arguments carry none, naming what it is. */
export function oneTextArgumentFrom(commandName: TatolabCommandName, commandArguments: unknown, argumentName: string, whatItIs: string): Result<string, string> {
  const argument = isAJsonObject(commandArguments) ? commandArguments[argumentName] : undefined;
  return typeof argument === "string" ? succeeded(argument) : failedWith(`${commandName} needs \`${argumentName}\`, ${whatItIs}`);
}

/** Each command's handler, taking the arguments as the window sent them and the window that sent them, and answering in the contract's shape. */
export type TatolabWindowCommandHandlers = {
  readonly [CommandName in TatolabCommandName]: (commandArguments: unknown, commandFromWindow: TatolabCommandFromWindow) => Promise<TatolabCommandAnswerTo<CommandName>>;
};

/** The window's answer to a command from `outcome`: its value, or its failure as the refusal. */
export function commandAnswerFrom<Answer>(outcome: Result<Answer, string>): { ok: true; value: Answer } | { ok: false; refusal: string } {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, refusal: outcome.failure };
}

/** The window's answer of `null` to a command from `outcome`, or its failure as the refusal. */
export function commandAnswerOfNothingFrom(outcome: Result<unknown, string>): { ok: true; value: null } | { ok: false; refusal: string } {
  return outcome.ok ? { ok: true, value: null } : { ok: false, refusal: outcome.failure };
}
