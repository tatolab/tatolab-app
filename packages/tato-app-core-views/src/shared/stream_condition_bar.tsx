import type { StreamCondition, StreamHealth } from "@tatolab/tato-app-view-sdk/studio_readings";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { StatusChip, type StatusChipTone } from "@tatolab/tato-app-view-sdk/design_system/status_chip";
import { streamConditionSummary, streamDiagnosticLines, type StreamDiagnosticLine } from "./stream_condition_words";

const HEALTH_TONES: Record<StreamHealth, StatusChipTone> = { healthy: "positive", degraded: "caution", failed: "danger" };

/** A stream's load, playback and health as one chip, toned by its health. */
export function StreamConditionChip({ condition }: { condition: StreamCondition }) {
  return (
    <StatusChip tone={HEALTH_TONES[condition.health]} data-stream-condition={condition.health}>
      {streamConditionSummary(condition)}
    </StatusChip>
  );
}

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
