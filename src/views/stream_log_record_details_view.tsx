// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Filter, PanelRightClose, ScrollText, Workflow, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { LogLevelWordTone, StreamLogRecordDetails } from "../presentation/log_record_presentation";
import { syntaxPartsOfAJsonLine, type JsonSyntaxKind } from "../presentation/stream_graph_document_presentation";
import { CopyTextButton } from "./copy_text_button";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";

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

function DetailsSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-3 pb-3">
      <div className="flex h-8 items-center">
        <h3 className="label-caps">{title}</h3>
        {aside !== undefined && <div className="ml-auto flex items-center">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function SourceRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-3">
      <span className="w-16 shrink-0 text-fg-3">{name}</span>
      <span className="min-w-0 flex-1 truncate select-text">{children}</span>
    </div>
  );
}

function GoToButton({ icon: ButtonIcon, children, onClick, controlAttribute }: { icon: LucideIcon; children: ReactNode; onClick: () => void; controlAttribute: Record<`data-${string}`, string> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-fg-2 transition-colors hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      {...controlAttribute}
    >
      <ButtonIcon className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/** What the details panel asks of the Logs tab around it. */
export interface StreamLogRecordDetailsActions {
  onClosed: () => void;
  /** Narrows the rows to those of the step with this key in the step filter. */
  onOnlyStepShown: (stepKey: string) => void;
  /** Opens Graph with the step of this name selected. */
  onStepShownInGraph: (stepName: string) => void;
}

/** The selected record in full: its message, where it came from, where to go from it, its fields, and its JSON record exactly as the runtime wrote it. */
export function StreamLogRecordDetailsView({
  details,
  streamName,
  actions,
}: {
  details: StreamLogRecordDetails | null;
  streamName: string;
  actions: StreamLogRecordDetailsActions;
}) {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l bg-chrome" aria-label="Selected record" data-stream-log-record-details="">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b pr-1.5 pl-3">
        <h2 className="font-medium text-fg">Line</h2>
        <div className="ml-auto flex items-center">
          {details !== null && <CopyTextButton readTextToCopy={() => details.jsonlLine} label="Copy as JSON" controlAttribute={{ "data-stream-log-details-copy": "record" }} />}
          <Button variant="ghost" size="icon" aria-label="Hide details" onClick={actions.onClosed} data-stream-log-details-close="">
            <PanelRightClose className="size-4" strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
      </div>
      {details === null ? (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <ScrollText className="mx-auto size-5 text-fg-3" strokeWidth={1.5} aria-hidden />
            <div className="mt-2 text-fg-2">No line selected</div>
            <div className="mt-0.5 text-xs text-fg-3">Select a line to see its full record.</div>
          </div>
        </div>
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pt-1 pb-4">
          <DetailsSection title="Message">
            <div className="flex items-start gap-2">
              <span className={joinClassNames("font-mono text-xs leading-5", LOG_LEVEL_WORD_TONE_CLASS_NAMES[details.levelTone])}>{details.levelWord}</span>
              <div className="min-w-0 font-mono text-[12.5px] leading-5 break-words text-fg select-text">{details.message}</div>
            </div>
          </DetailsSection>
          <DetailsSection title="Source">
            <SourceRow name="Time">
              <span className="font-mono text-xs tabular">{details.dateAndTimeText}</span>
            </SourceRow>
            <SourceRow name="Stream">{streamName}</SourceRow>
            <SourceRow name="Step">
              <span className="font-mono text-xs">{details.step.stepName}</span>
            </SourceRow>
            <SourceRow name="Process">{details.processWords}</SourceRow>
          </DetailsSection>
          <DetailsSection title="Go to">
            <div className="-mx-2 flex flex-col gap-px">
              {details.step.isAStepOfTheGraph && (
                <GoToButton icon={Workflow} onClick={() => actions.onStepShownInGraph(details.step.stepName)} controlAttribute={{ "data-stream-log-details-go-to": "graph" }}>
                  Show in graph
                </GoToButton>
              )}
              <GoToButton icon={Filter} onClick={() => actions.onOnlyStepShown(details.step.stepKey)} controlAttribute={{ "data-stream-log-details-go-to": "only_this_step" }}>
                Only lines from <span className="font-mono text-xs">{details.step.stepName}</span>
              </GoToButton>
            </div>
          </DetailsSection>
          {details.fields.length > 0 && (
            <DetailsSection
              title="Fields"
              aside={
                <CopyTextButton
                  readTextToCopy={() => details.fields.map((field) => `${field.key}=${field.valueText}`).join(" ")}
                  label="Copy fields"
                  controlAttribute={{ "data-stream-log-details-copy": "fields" }}
                />
              }
            >
              <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs">
                {details.fields.map((field) => (
                  <div key={field.key} className="contents">
                    <dt className="text-fg-3">{field.key}</dt>
                    <dd className="min-w-0 break-all text-fg select-text">{field.valueText}</dd>
                  </div>
                ))}
              </dl>
            </DetailsSection>
          )}
          <DetailsSection title="Record" aside={<CopyTextButton readTextToCopy={() => details.jsonlLine} label="Copy as JSONL" controlAttribute={{ "data-stream-log-details-copy": "jsonl_line" }} />}>
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
          </DetailsSection>
        </div>
      )}
    </aside>
  );
}
