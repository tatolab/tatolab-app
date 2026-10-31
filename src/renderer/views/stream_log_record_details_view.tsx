import { cn } from "cn";
import { Filter, Workflow } from "lucide-react";
import { CopyIconButton } from "../design_system/copy_icon_button";
import { KeyValueRows } from "../design_system/key_value_rows";
import { ListRowButton } from "../design_system/list_row_button";
import { PanelSection } from "../design_system/panel_section";
import { SidePanel } from "../design_system/side_panel";
import type { LogLevelWordTone, StreamLogRecordDetails } from "../presentation/log_record_presentation";
import { syntaxPartsOfAJsonLine, type JsonSyntaxKind } from "../presentation/stream_graph_document_presentation";

/** The colour of a level word, by its tone: only warn and error are coloured. */
export const LOG_LEVEL_WORD_TONE_CLASS_NAMES: Record<LogLevelWordTone, string> = {
  quiet: "text-fg-3",
  plain: "text-fg-2",
  warn: "text-warn-text",
  error: "text-danger-text",
};

const JSON_SYNTAX_CLASS_NAMES: Record<JsonSyntaxKind, string> = {
  key: "text-fg-3",
  string: "text-fg-2",
  number: "text-fg",
  literal: "text-fg",
  punctuation: "text-fg-3",
};

/** What the details panel asks of the Logs tab around it. */
export interface StreamLogRecordDetailsActions {
  onClosed: () => void;
  /** Narrows the rows to those of the step with this key in the step filter. */
  onOnlyStepShown: (stepKey: string) => void;
  /** Opens Graph with the step of this name selected. */
  onStepShownInGraph: (stepName: string) => void;
}

/** The selected record in full: its message, where it came from, where to go from it, its fields, and its JSON record exactly as the runtime wrote it. */
export function StreamLogRecordDetailsView({ details, actions }: { details: StreamLogRecordDetails; actions: StreamLogRecordDetailsActions }) {
  return (
    <SidePanel
      label="Selected record"
      title="Line"
      actions={<CopyIconButton readTextToCopy={() => details.jsonlLine} label="Copy as JSON" data-stream-log-details-copy="record" />}
      hiding={{ hideLabel: "Hide details", onHidden: actions.onClosed }}
      data-stream-log-record-details=""
    >
      <div className="pb-2">
        <PanelSection title="Message">
          <div className="flex items-start gap-2">
            <span className={cn("font-mono text-xs leading-5", LOG_LEVEL_WORD_TONE_CLASS_NAMES[details.levelTone])}>{details.levelWord}</span>
            <div className="min-w-0 font-mono text-[12.5px] leading-5 break-words text-fg select-text">{details.message}</div>
          </div>
        </PanelSection>
        <PanelSection title="Source">
          <KeyValueRows
            rows={[
              ["Time", <span className="font-mono text-xs tabular select-text">{details.dateAndTimeText}</span>],
              ["Stream", <span className="select-text">{details.streamWords}</span>],
              ["Action", <span className="tabular select-text">{details.actionWords}</span>],
              ["Node", <span className="font-mono text-xs select-text">{details.step.stepName}</span>],
            ]}
          />
        </PanelSection>
        <PanelSection title="Go to">
          <div className="-mx-2 flex flex-col gap-px">
            {details.step.isAStepOfTheGraph && (
              <ListRowButton icon={Workflow} onPressed={() => actions.onStepShownInGraph(details.step.stepName)} data-stream-log-details-go-to="graph">
                <span className="min-w-0 truncate">Show in graph</span>
              </ListRowButton>
            )}
            <ListRowButton icon={Filter} onPressed={() => actions.onOnlyStepShown(details.step.stepKey)} data-stream-log-details-go-to="only_this_step">
              <span className="min-w-0 truncate">
                Only lines from <span className="font-mono text-xs">{details.step.stepName}</span>
              </span>
            </ListRowButton>
          </div>
        </PanelSection>
        {details.fields.length > 0 && (
          <PanelSection
            title="Fields"
            aside={<CopyIconButton readTextToCopy={() => details.fieldsTextToCopy} label="Copy fields" size="compact" data-stream-log-details-copy="fields" />}
          >
            <KeyValueRows look="fields" rows={details.fields.map((field) => [field.key, field.valueText] as const)} />
          </PanelSection>
        )}
        <PanelSection
          title="Record"
          aside={<CopyIconButton readTextToCopy={() => details.jsonlLine} label="Copy as JSONL" size="compact" data-stream-log-details-copy="jsonl_line" />}
        >
          <pre
            className="scrollbar-thin overflow-x-auto rounded-md border bg-window p-2.5 font-mono text-[11px] leading-4 whitespace-pre select-text"
            data-stream-log-details-record=""
          >
            {details.recordJsonLines.map((jsonLine, lineIndex) => (
              <div key={lineIndex}>
                {syntaxPartsOfAJsonLine(jsonLine).map((syntaxPart, partIndex) => (
                  <span key={partIndex} className={JSON_SYNTAX_CLASS_NAMES[syntaxPart.kind]}>
                    {syntaxPart.text}
                  </span>
                ))}
              </div>
            ))}
          </pre>
        </PanelSection>
      </div>
    </SidePanel>
  );
}
