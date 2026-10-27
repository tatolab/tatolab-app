import { cn } from "cn";
import { Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "../design_system/action_button";
import { PublicExposureTag } from "../design_system/public_exposure_tag";
import { FailureBanner } from "../design_system/failure_banner";
import { KeyValueRows } from "../design_system/key_value_rows";
import { FieldMenu, MenuItem } from "../design_system/menus";
import { PanelSection } from "../design_system/panel_section";
import { SidePanel } from "../design_system/side_panel";
import { ToggleIconButton } from "../design_system/toggle_icon_button";
import type { StreamGraphStepOutputPort } from "../presentation/stream_graph_canvas_presentation";
import type { StreamGraphStepInspection } from "../presentation/stream_graph_inspector_presentation";
import { exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { ExposedOutputWatchPageFrame } from "./exposed_output_watch_page_frame";
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
      <PanelSection title="Output" isDivided>
        <p className="text-xs text-fg-3">{inspection.previewAbsenceWords}</p>
      </PanelSection>
    );
  }
  const { output, watchPageUrl } = previewedOutput;
  const address = exposedOutputAddress(outputPlace.machineName, outputPlace.streamName, { node: output.stepName, port: output.name });
  const isPinned = pinnedOutputKeys.has(outputPinKey(output));
  return (
    <PanelSection
      title="Output"
      isDivided
      aside={
        <ToggleIconButton
          icon={Pin}
          iconWhileOn={PinOff}
          label="Pin preview"
          tooltipWhileOn="Unpin preview"
          isOn={isPinned}
          onToggled={() => onOutputPinToggled(output)}
          size="compact"
        />
      }
    >
      {previewableOutputs.length > 1 && (
        <div className="mb-2">
          <FieldMenu
            label="Output to preview"
            leading={<PortDataKindIcon dataKind={output.dataKind} />}
            words={<span className="truncate font-mono text-xs text-fg">{output.name}</span>}
            fillsItsPlace
          >
            {previewableOutputs.map((previewable) => (
              <MenuItem key={previewable.output.name} onChosen={() => setChosenOutputName(previewable.output.name)}>
                <PortDataKindIcon dataKind={previewable.output.dataKind} /> <span className="font-mono text-xs">{previewable.output.name}</span>
              </MenuItem>
            ))}
          </FieldMenu>
        </div>
      )}
      <ExposedOutputWatchPageFrame watchPageUrl={watchPageUrl} fullAddress={address.fullAddress} className="aspect-video w-full rounded-md" />
      <div className="mt-1.5 truncate font-mono text-xs text-fg-3 select-text" title={address.fullAddress}>
        {address.fullAddress}
      </div>
    </PanelSection>
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
      {step.stateEmphasis === "failure" && (
        <FailureBanner
          place="panel"
          action={
            <ActionButton size="small" onPressed={actions.onErrorsInLogsShown} data-stream-graph-show-errors="">
              Show errors
            </ActionButton>
          }
        >
          In error. The reason is in the logs.
        </FailureBanner>
      )}
      <StepOutputPreview inspection={inspection} outputPlace={outputPlace} pinnedOutputKeys={pinnedOutputKeys} onOutputPinToggled={actions.onOutputPinToggled} />
      <PanelSection title="Node" isDivided>
        <KeyValueRows
          rows={[
            ["Name", <span className="font-mono text-xs text-fg select-text">{step.name}</span>],
            [
              "Type",
              <span className="font-mono text-xs text-fg select-text" title={step.type}>
                {step.type}
              </span>,
            ],
          ]}
        />
      </PanelSection>
      <PanelSection title="Config" aside="Set when it was added" isDivided>
        {inspection.configRows === null ? (
          <p className="text-xs text-fg-3">The graph gives no config for this node.</p>
        ) : inspection.configRows.length === 0 ? (
          <p className="text-xs text-fg-3">None</p>
        ) : (
          <KeyValueRows look="fields" rows={inspection.configRows.map((configRow) => [configRow.key, configRow.valueText] as const)} data-stream-graph-step-config="" />
        )}
      </PanelSection>
      {step.outputPorts.length > 0 && (
        <PanelSection title="Outputs" isDivided>
          {step.outputPorts.map((output) => (
            <div key={output.name} className="flex h-7 items-center gap-2" data-stream-graph-output-exposure={output.name}>
              <PortDataKindIcon dataKind={output.dataKind} />
              <span className="min-w-0 truncate font-mono text-xs text-fg">{output.name}</span>
              {output.exposureLevel !== null && (
                <span className="ml-auto">
                  <PublicExposureTag level={output.exposureLevel} />
                </span>
              )}
            </div>
          ))}
        </PanelSection>
      )}
      {inspection.counterRows.length > 0 && (
        <PanelSection title="Counters" aside="since wired" isDivided>
          {inspection.counterRows.map((counterRow) => (
            <div key={`${counterRow.word}:${counterRow.counted}`} className="flex h-6 items-center gap-2 font-mono text-xs">
              <span className="min-w-0 flex-1 truncate text-fg-2">{counterRow.counted}</span>
              <span className="text-fg-3">{counterRow.word}</span>
              <span className={cn("w-14 text-right tabular-nums", counterRow.count > 0 ? "text-warn-text" : "text-fg-3")}>
                {counterRow.count.toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </PanelSection>
      )}
    </>
  );
}

/** The panel beside the canvas while a node is selected: that node. Viewing only; closing it selects nothing. */
export function StreamGraphInspectorView({
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
  return (
    <SidePanel
      label="Inspector"
      title={<span className="font-mono text-[13px]">{inspection.step.name}</span>}
      subtitle={
        <>
          <span className={inspection.step.stateEmphasis === "failure" ? "text-danger-text" : undefined}>{inspection.step.stateWord}</span> · {inspection.linkCountWords}
        </>
      }
      hiding={{ hideLabel: "Close inspector", onHidden: actions.onClosed }}
      data-stream-graph-inspector="step"
    >
      <StepInspectorView key={inspection.step.name} inspection={inspection} outputPlace={outputPlace} pinnedOutputKeys={pinnedOutputKeys} actions={actions} />
    </SidePanel>
  );
}
