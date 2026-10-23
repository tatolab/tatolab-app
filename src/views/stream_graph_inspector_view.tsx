// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronDown, PanelRightClose, Pin, PinOff, SquareX } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { StreamGraphStepOutputPort } from "../presentation/stream_graph_canvas_presentation";
import type { StreamGraphInspection, StreamGraphStepInspection, StreamGraphStreamInspection } from "../presentation/stream_graph_inspector_presentation";
import { exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
import { ExposureLevelWords } from "./exposure_level_words";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./shadcn/dropdown_menu";
import { Kbd } from "./shadcn/kbd";
import type { StreamGraphOutputPlace } from "./stream_graph_output_previews_view";
import { outputPinKey, PortDataKindIcon } from "./stream_graph_step_card_view";

/** What the inspector asks of the Graph tab around it. */
export interface StreamGraphInspectorActions {
  onClosed: () => void;
  onStepSelected: (stepName: string) => void;
  onOutputPinToggled: (output: StreamGraphStepOutputPort) => void;
  /** Opens Logs narrowed to its errors, where a step in error says why. */
  onErrorsInLogsShown: () => void;
}

function InspectorSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-xs font-medium text-fg-3">{title}</h3>
        {aside !== undefined && <span className="ml-auto text-xs text-fg-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function KeyValueRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-3">
      <span className="w-[76px] shrink-0 text-fg-3">{name}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

function InspectorHeader({ title, subtitle, onClosed }: { title: ReactNode; subtitle: ReactNode; onClosed: () => void }) {
  return (
    <div className="flex items-start gap-2 border-b px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-medium text-fg">{title}</h2>
        <div className="truncate text-xs text-fg-3">{subtitle}</div>
      </div>
      <Button variant="ghost" size="icon" aria-label="Hide inspector" onClick={onClosed} data-stream-graph-inspector-close="">
        <PanelRightClose className="size-4" strokeWidth={1.75} aria-hidden />
      </Button>
    </div>
  );
}

function StepOutputPreview({
  inspection,
  outputPlace,
  pinnedOutputKeys,
  onOutputPinToggled,
}: {
  inspection: StreamGraphStepInspection;
  outputPlace: StreamGraphOutputPlace;
  pinnedOutputKeys: ReadonlySet<string>;
  onOutputPinToggled: (output: StreamGraphStepOutputPort) => void;
}) {
  const [chosenOutputName, setChosenOutputName] = useState<string | null>(null);
  const { previewableOutputs } = inspection;
  const previewedOutput = previewableOutputs.find((previewable) => previewable.output.name === chosenOutputName) ?? previewableOutputs[0];
  if (previewedOutput === undefined) {
    return (
      <InspectorSection title="Output">
        <p className="text-xs text-fg-3">{inspection.previewAbsenceWords}</p>
      </InspectorSection>
    );
  }
  const { output, watchPageUrl } = previewedOutput;
  const address = exposedOutputAddress(outputPlace.machineName, outputPlace.streamName, { node: output.stepName, port: output.name });
  const isPinned = pinnedOutputKeys.has(outputPinKey(output));
  return (
    <InspectorSection
      title="Output"
      aside={
        <Button variant="ghost" size="icon" className="size-6" aria-label={isPinned ? "Unpin preview" : "Pin preview"} aria-pressed={isPinned} onClick={() => onOutputPinToggled(output)}>
          {isPinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
        </Button>
      }
    >
      {previewableOutputs.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Output to preview"
            className="mb-2 flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border bg-window pr-1.5 pl-2 hover:bg-hover data-popup-open:bg-hover"
          >
            <PortDataKindIcon dataKind={output.dataKind} />
            <span className="truncate font-mono text-xs text-fg">{output.name}</span>
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64">
            {previewableOutputs.map((previewable) => (
              <DropdownMenuItem key={previewable.output.name} onClick={() => setChosenOutputName(previewable.output.name)}>
                <PortDataKindIcon dataKind={previewable.output.dataKind} /> <span className="font-mono text-xs">{previewable.output.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ExposedOutputWatchPageFrame watchPageUrl={watchPageUrl} fullAddress={address.fullAddress} className="aspect-video w-full rounded-md" />
      <div className="mt-1.5 truncate font-mono text-xs text-fg-3 select-text" title={address.fullAddress}>
        {address.fullAddress}
      </div>
    </InspectorSection>
  );
}

function StepInspectorView({
  inspection,
  outputPlace,
  pinnedOutputKeys,
  actions,
}: {
  inspection: StreamGraphStepInspection;
  outputPlace: StreamGraphOutputPlace;
  pinnedOutputKeys: ReadonlySet<string>;
  actions: StreamGraphInspectorActions;
}) {
  const { step } = inspection;
  return (
    <>
      <InspectorHeader
        title={<span className="font-mono text-[13px]">{step.name}</span>}
        subtitle={
          <>
            <span className={step.stateEmphasis === "failure" ? "text-danger-text" : undefined}>{step.stateWord}</span> · {inspection.linkCountWords}
          </>
        }
        onClosed={actions.onClosed}
      />
      {step.stateEmphasis === "failure" && (
        <div role="alert" className="flex items-center gap-2 border-b bg-danger-soft px-4 py-2 text-xs">
          <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
          <span className="text-fg">In error. The reason is in the logs.</span>
          <Button variant="outline" className="ml-auto h-6 text-xs" onClick={actions.onErrorsInLogsShown} data-stream-graph-show-errors="">
            Show errors
          </Button>
        </div>
      )}
      <StepOutputPreview inspection={inspection} outputPlace={outputPlace} pinnedOutputKeys={pinnedOutputKeys} onOutputPinToggled={actions.onOutputPinToggled} />
      <InspectorSection title="Step">
        <KeyValueRow name="Name">
          <span className="font-mono text-xs text-fg select-text">{step.name}</span>
        </KeyValueRow>
        <KeyValueRow name="Type">
          <span className="font-mono text-xs text-fg select-text" title={step.type}>
            {step.type}
          </span>
        </KeyValueRow>
        <KeyValueRow name="Origin">{step.origin ?? "—"}</KeyValueRow>
        <KeyValueRow name="Process">{inspection.processWords ?? "—"}</KeyValueRow>
      </InspectorSection>
      <InspectorSection title="Config" aside="Set when it was added">
        {inspection.configRows === null ? (
          <p className="text-xs text-fg-3">The graph gives no config for this step.</p>
        ) : inspection.configRows.length === 0 ? (
          <p className="text-xs text-fg-3">None</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs" data-stream-graph-step-config="">
            {inspection.configRows.map((configRow) => (
              <div key={configRow.key} className="contents">
                <span className="truncate text-fg-3">{configRow.key}</span>
                <span className="truncate text-fg select-text" title={configRow.valueText}>
                  {configRow.valueText}
                </span>
              </div>
            ))}
          </div>
        )}
      </InspectorSection>
      {step.outputPorts.length > 0 && (
        <InspectorSection title="Exposure">
          {step.outputPorts.map((output) => (
            <div key={output.name} className="flex h-7 items-center gap-2" data-stream-graph-output-exposure={output.name}>
              <PortDataKindIcon dataKind={output.dataKind} />
              <span className="min-w-0 truncate font-mono text-xs text-fg">{output.name}</span>
              {output.exposureLevel !== null && <ExposureLevelWords level={output.exposureLevel} className="ml-auto shrink-0 text-xs" />}
            </div>
          ))}
        </InspectorSection>
      )}
      {inspection.counterRows.length > 0 && (
        <InspectorSection title="Counters" aside="since wired">
          {inspection.counterRows.map((counterRow) => (
            <div key={`${counterRow.word}:${counterRow.counted}`} className="flex h-6 items-center gap-2 font-mono text-xs">
              <span className="min-w-0 flex-1 truncate text-fg-2">{counterRow.counted}</span>
              <span className="text-fg-3">{counterRow.word}</span>
              <span className={joinClassNames("w-14 text-right tabular-nums", counterRow.count > 0 ? "text-warn-text" : "text-fg-3")}>
                {counterRow.count.toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </InspectorSection>
      )}
    </>
  );
}

function StreamSummaryInspectorView({
  inspection,
  outputPlace,
  streamInstance,
  actions,
}: {
  inspection: StreamGraphStreamInspection;
  outputPlace: StreamGraphOutputPlace;
  streamInstance: string | null;
  actions: StreamGraphInspectorActions;
}) {
  return (
    <>
      <InspectorHeader title={outputPlace.streamName} subtitle="Nothing selected · the whole stream" onClosed={actions.onClosed} />
      <InspectorSection title="Summary">
        <KeyValueRow name="Steps">{inspection.stepCountWords}</KeyValueRow>
        <KeyValueRow name="Links">
          {inspection.linkCount}
          {inspection.droppedCount > 0 && <span className="text-warn-text"> · {inspection.droppedCount.toLocaleString("en-US")} dropped</span>}
        </KeyValueRow>
        <KeyValueRow name="Exposed">{inspection.exposedOutputs.length}</KeyValueRow>
        <KeyValueRow name="Instance">
          <span className="font-mono text-xs select-text">{streamInstance ?? "—"}</span>
        </KeyValueRow>
      </InspectorSection>
      {inspection.exposedOutputs.length > 0 && (
        <InspectorSection title="Exposed outputs">
          {inspection.exposedOutputs.map((output) => (
            <button
              type="button"
              key={outputPinKey(output)}
              className="-mx-1.5 flex h-7 w-[calc(100%+12px)] cursor-default items-center gap-2 rounded-md px-1.5 text-left hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => actions.onStepSelected(output.stepName)}
            >
              <PortDataKindIcon dataKind={output.dataKind} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">
                {output.stepName}/{output.name}
              </span>
              {output.exposureLevel !== null && <ExposureLevelWords level={output.exposureLevel} className="shrink-0 text-xs" />}
            </button>
          ))}
        </InspectorSection>
      )}
      <InspectorSection title="Keyboard">
        <div className="flex h-7 items-center">
          Fit to view
          <Kbd className="ml-auto">F</Kbd>
        </div>
        <div className="flex h-7 items-center">
          Select nothing
          <Kbd className="ml-auto">Esc</Kbd>
        </div>
        <p className="mt-2 text-xs text-fg-3">
          Hover an exposed output to preview it; click it to pin a preview. An internal output has no preview until it is exposed.
        </p>
      </InspectorSection>
    </>
  );
}

/** The panel beside the canvas: the selected step, or the whole stream while nothing is selected. Viewing only. */
export function StreamGraphInspectorView({
  inspection,
  outputPlace,
  streamInstance,
  pinnedOutputKeys,
  actions,
}: {
  inspection: StreamGraphInspection;
  outputPlace: StreamGraphOutputPlace;
  streamInstance: string | null;
  pinnedOutputKeys: ReadonlySet<string>;
  actions: StreamGraphInspectorActions;
}) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l bg-chrome" aria-label="Inspector" data-stream-graph-inspector={inspection.kind}>
      {inspection.kind === "step" ? (
        <StepInspectorView key={inspection.step.name} inspection={inspection} outputPlace={outputPlace} pinnedOutputKeys={pinnedOutputKeys} actions={actions} />
      ) : (
        <StreamSummaryInspectorView inspection={inspection} outputPlace={outputPlace} streamInstance={streamInstance} actions={actions} />
      )}
    </aside>
  );
}
