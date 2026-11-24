import type { StreamCondition } from "@tatolab/tato-app-view-sdk/studio_readings";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { streamDiagnosticLines, type StreamDiagnosticLine } from "./stream_condition_words";

/**
 * A bar per diagnostic of a stream's condition, where it applies leading the runtime's words, what recovers from it under them, with the
 * action that does when there is one: `whyTheActionCannotRun` says why an action cannot run now, `null` when it can.
 */
export function StreamDiagnosticBars({
  condition,
  streamWords,
  onActionChosen,
  whyTheActionCannotRun,
}: {
  condition: StreamCondition | null;
  streamWords: string;
  onActionChosen: (line: StreamDiagnosticLine) => void;
  whyTheActionCannotRun: (line: StreamDiagnosticLine) => string | null;
}) {
  return streamDiagnosticLines(condition, streamWords).map((line) => (
    <RefusalLine
      key={line.key}
      layout="bar"
      tone={line.tone}
      lead={line.lead}
      words={line.words}
      whatRecoversFromIt={line.whatRecoversFromIt}
      action={
        line.action.kind === "none" ? undefined : (
          <ActionButton size="small" disabledReason={whyTheActionCannotRun(line)} onPressed={() => onActionChosen(line)} data-stream-diagnostic-action={line.diagnostic.recovery}>
            {line.action.label}
          </ActionButton>
        )
      }
      data-stream-diagnostic={line.diagnostic.kind}
    />
  ));
}
