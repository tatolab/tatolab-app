import { cn } from "cn";
import { Check, CircleDashed, FilePen, LoaderCircle, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ActionButton, type ActionButtonAppearance } from "./action_button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { InlineLink } from "./inline_link";

/** Who said a conversation's message: the person, the agent, or the agent thinking aloud, which reads quieter. */
export type ConversationSpeaker = { kind: "person" } | { kind: "agent"; agent_title: string } | { kind: "agent_thinking"; agent_title: string };

/** One message of a conversation with an agent, under who said it; its words keep their line breaks. */
export function ConversationMessage({ speaker, words, ...controlDataAttributes }: { speaker: ConversationSpeaker; words: string } & ControlDataAttributes) {
  const speakerName = speaker.kind === "person" ? "You" : speaker.kind === "agent" ? speaker.agent_title : `${speaker.agent_title} · thinking`;
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5" {...controlDataAttributes}>
      <span className={cn("text-2xs font-semibold", speaker.kind === "person" ? "text-fg-2" : "text-brand-text")}>{speakerName}</span>
      <p className={cn("text-studio break-words whitespace-pre-wrap select-text", speaker.kind === "agent_thinking" ? "text-fg-3 italic" : "text-fg")}>{words}</p>
    </div>
  );
}

/** Where a tool call has got to. */
export type ConversationToolCallState = "waiting" | "running" | "done" | "failed";

const TOOL_CALL_STATE_ICON: Record<ConversationToolCallState, LucideIcon> = { waiting: CircleDashed, running: LoaderCircle, done: Check, failed: X };
const TOOL_CALL_STATE_WORDS: Record<ConversationToolCallState, string> = { waiting: "Waiting", running: "Running", done: "Done", failed: "Failed" };

/** One file a tool call changed: its name, opening it in the code pane, and how many lines it gained and lost. */
export interface ConversationFileChange {
  file_name: string;
  lines_added: number;
  lines_removed: number;
  onOpenAsked: () => void;
}

/** One tool call an agent made, in Geist Mono: its state, its title, what it said back, and the files it changed. */
export function ConversationToolCall({
  state,
  title,
  output,
  fileChanges,
  ...controlDataAttributes
}: { state: ConversationToolCallState; title: string; output: string; fileChanges: ConversationFileChange[] } & ControlDataAttributes) {
  const StateIcon = TOOL_CALL_STATE_ICON[state];
  return (
    <div className="mx-3 my-1 flex flex-col gap-1 rounded-md bg-well px-2 py-1.5 font-mono text-2xs" {...controlDataAttributes}>
      <div className="flex min-w-0 items-center gap-1.5">
        <StateIcon
          className={cn("size-3 shrink-0", state === "failed" ? "text-danger" : state === "running" ? "animate-spin text-brand-text" : "text-fg-3")}
          strokeWidth={2}
          aria-label={TOOL_CALL_STATE_WORDS[state]}
        />
        <span className="min-w-0 flex-1 truncate text-fg-2">{title}</span>
      </div>
      {output !== "" && <p className="line-clamp-3 pl-[18px] break-words whitespace-pre-wrap text-fg-3 select-text">{output}</p>}
      {fileChanges.map((fileChange) => (
        <div key={fileChange.file_name} className="flex min-w-0 items-center gap-1.5 pl-[18px]">
          <FilePen className="size-3 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          <InlineLink destination={{ onPressed: fileChange.onOpenAsked }} data-conversation-file-change={fileChange.file_name}>
            {fileChange.file_name}
          </InlineLink>
          <span className="text-fg-3">
            +{fileChange.lines_added} −{fileChange.lines_removed}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One step of an agent's plan, and whether it is done. */
export interface ConversationPlanStep {
  words: string;
  state: "to_do" | "doing" | "done";
}

/** An agent's plan for its turn, a step to a line. */
export function ConversationPlan({ steps, ...controlDataAttributes }: { steps: ConversationPlanStep[] } & ControlDataAttributes) {
  return (
    <ol className="mx-3 my-1 flex flex-col gap-0.5 text-xs" {...controlDataAttributes}>
      {steps.map((step, index) => (
        <li key={`${index}:${step.words}`} className={cn("flex gap-1.5", step.state === "done" ? "text-fg-3 line-through" : step.state === "doing" ? "text-fg" : "text-fg-2")}>
          <span className="shrink-0 text-fg-3">{index + 1}.</span>
          <span className="min-w-0 break-words">{step.words}</span>
        </li>
      ))}
    </ol>
  );
}

/** One answer an agent's permission request offers. */
export interface ConversationPermissionChoice {
  words: string;
  appearance: ActionButtonAppearance;
  onChosen: () => void;
  choiceId: string;
}

/** An agent asking leave to go on, with the answers it offers; once answered, the answer in their place. */
export function ConversationPermissionRequest({
  question,
  choices,
  answerWords,
  ...controlDataAttributes
}: { question: string; choices: ConversationPermissionChoice[]; answerWords: string | null } & ControlDataAttributes) {
  return (
    <div className="mx-3 my-1 flex flex-col gap-1.5 rounded-md border border-line-strong px-2.5 py-2" {...controlDataAttributes}>
      <p className="text-xs text-fg">{question}</p>
      {answerWords === null ? (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((choice) => (
            <ActionButton key={choice.choiceId} size="small" appearance={choice.appearance} onPressed={choice.onChosen} data-permission-choice={choice.choiceId}>
              {choice.words}
            </ActionButton>
          ))}
        </div>
      ) : (
        <p className="text-2xs text-fg-3">{answerWords}</p>
      )}
    </div>
  );
}

/** A quiet line in a conversation, as how a turn ended. */
export function ConversationNote({ children, ...controlDataAttributes }: { children: ReactNode } & ControlDataAttributes) {
  return (
    <p className="px-3 py-1 text-2xs text-fg-3" {...controlDataAttributes}>
      {children}
    </p>
  );
}
