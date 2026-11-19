import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { InputControlMount, InputValueWords, useOwnFieldOfTheInput, useRefusalOfTheInput, useWhereTheInputsValueComesFrom } from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import { PropertyNumberField, PropertySliderField, PropertyTextField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { StatusChip } from "@tatolab/tato-app-view-sdk/design_system/status_chip";
import { ToggleSwitch } from "@tatolab/tato-app-view-sdk/design_system/toggle_switch";
import { takesAControl, type ControlledInput } from "@tatolab/tato-app-view-sdk/pin_model/controlled_inputs";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { InputValueGesture } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import { jsonTextOf, type JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { useId, useMemo, useRef, useState } from "react";
import { jsonFromTheWordsTyped, jsonObjectFromTheWordsTyped, numberFromTheWordsTyped, type GraphInputWordsTyped } from "./graph_input_words_typed";
import { GRAPH_INPUT_VALUE_INPUT, LIFETIME_WORDS, whyNoControlWritesTheInput, whyNothingSetsTheInput, type GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

/** The control Perform draws for `graphInput`'s value, the one its Graph Input node draws; `null` where it takes none, so Perform draws its own field. */
function controlledValueOf(graphInput: GraphInputOfTheStream, address: InputAddress): ControlledInput | null {
  const controlled = takesAControl({ name: GRAPH_INPUT_VALUE_INPUT, pin: graphInput.value_pin, annotations: graphInput.value_annotations, value_address: address, setting: null, wire: null });
  return controlled === null ? null : { ...controlled, declaration: { ...controlled.declaration, label: graphInput.port_name } };
}

/**
 * One of the stream's inputs in Perform: its name, its family and the lifetime of a value set live on it, and the control its
 * Graph Input node draws, through the frame's binder, on the node's `value` input, so Perform and the node share one value.
 * Every move there is live and nothing is committed. A live value says so and offers Back to saved; the refusal of the latest
 * one shows under it.
 */
export function GraphInputControl({ graphInput }: { graphInput: GraphInputOfTheStream }) {
  const labelId = useId();
  const portName = graphInput.port_name;
  const address = graphInput.value_address;
  const controlled = useMemo(() => (address === null ? null : controlledValueOf(graphInput, address)), [graphInput, address]);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line px-3.5 py-3" data-graph-input={portName}>
      <div className="flex items-center gap-2 text-xs">
        <span id={labelId} className="min-w-0 truncate text-fg">
          {portName}
        </span>
        <span className="ml-auto shrink-0 font-mono text-2xs text-fg-3">{graphInput.family ?? "no family"}</span>
      </div>
      {address === null ? (
        <p className="text-2xs text-fg-3" data-graph-input-not-set={portName}>
          {whyNothingSetsTheInput(graphInput)}
        </p>
      ) : (
        <ValueOfTheGraphInput graphInput={graphInput} address={address} controlled={controlled} labelId={labelId} />
      )}
    </li>
  );
}

/** The value of a Graph Input that holds one: its control, where its value comes from with Back to saved while it is live, its lifetime, and the refusal of its latest value. */
function ValueOfTheGraphInput({ graphInput, address, controlled, labelId }: { graphInput: GraphInputOfTheStream; address: InputAddress; controlled: ControlledInput | null; labelId: string }) {
  const portName = graphInput.port_name;
  const valueSource = useWhereTheInputsValueComesFrom(address, "live");
  const refusal = useRefusalOfTheInput(address);
  const [wordsRefused, setWordsRefused] = useState<string | null>(null);
  const ownField = <OwnFieldOfTheGraphInput graphInput={graphInput} address={address} labelId={labelId} onWordsRefused={setWordsRefused} />;
  const isLive = valueSource?.comes_from === "live";
  // Words refused here are the person's latest act, so they show over the refusal of the value last sent.
  const refusalShown = wordsRefused ?? refusal;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {controlled === null ? (
        ownField
      ) : (
        <InputControlMount
          input={controlled}
          surface="perform"
          readOnly={false}
          fallback={<InputValueWords address={address} pinType={graphInput.value_pin?.pin_type ?? null} className="text-xs" data-graph-input-value-words={portName} />}
          noControl={ownField}
          className="w-full"
        />
      )}
      <div className="flex min-h-6 items-center gap-2 text-2xs text-fg-3">
        {isLive && (
          <StatusChip tone="caution" data-graph-input-live={portName}>
            Live
          </StatusChip>
        )}
        <span data-graph-input-lifetime={graphInput.lifetime}>{LIFETIME_WORDS[graphInput.lifetime]}</span>
        {isLive && valueSource !== null && (
          <ActionButton
            appearance="quiet"
            size="small"
            className="ml-auto"
            label={`Back to saved: ${portName}`}
            onPressed={() => {
              setWordsRefused(null);
              valueSource.clearTheValue();
            }}
            data-graph-input-back-to-saved={portName}
          >
            Back to saved
          </ActionButton>
        )}
      </div>
      {refusalShown !== null && <RefusalLine lead="The value wasn't set:" layout="under_field" words={refusalShown} data-graph-input-refusal={portName} />}
    </div>
  );
}

/**
 * Perform's own field for a Graph Input the control table cannot draw yet, as its family, default and range guess it: a
 * slider whose drag is live and whose release stays live, Escape putting back the value it began at; a number field, a
 * toggle or the JSON field, each edit one live value. Words that are no value are refused here, before anything is sent.
 */
function OwnFieldOfTheGraphInput({
  graphInput,
  address,
  labelId,
  onWordsRefused,
}: {
  graphInput: GraphInputOfTheStream;
  address: InputAddress;
  /** The id of the element naming the Input, which names each field drawn here. */
  labelId: string;
  onWordsRefused: (because: string | null) => void;
}) {
  const ownField = useOwnFieldOfTheInput(address, "live");
  const fieldId = useId();
  const drag = useRef<InputValueGesture | null>(null);
  const portName = graphInput.port_name;
  const shownValue = ownField?.shown.value ?? null;
  const release = (value: JsonValue) => {
    onWordsRefused(null);
    ownField?.releaseTheValue(value);
  };
  const releaseTheWordsTyped = (typed: GraphInputWordsTyped) => {
    if (typed.kind === "value") release(typed.value);
    else onWordsRefused(typed.because);
  };
  switch (graphInput.control) {
    case "slider":
      return (
        <PropertySliderField
          fieldId={fieldId}
          value={typeof shownValue === "number" ? shownValue : null}
          minimum={graphInput.range?.lowest ?? 0}
          maximum={graphInput.range?.highest ?? 1}
          isWholeNumber={false}
          labelledBy={labelId}
          onDragStarted={() => {
            onWordsRefused(null);
            drag.current = ownField?.beginTheGesture() ?? null;
          }}
          onLiveEdit={(value) => drag.current?.move(value)}
          onCommitted={(value) => {
            drag.current?.release(value);
            drag.current = null;
          }}
          onDragCancelled={() => {
            drag.current?.cancel();
            drag.current = null;
          }}
          valueTypedBesideTheSlider={{ label: `${portName} value`, onWordsTyped: (words) => releaseTheWordsTyped(numberFromTheWordsTyped(words)) }}
        />
      );
    case "number":
      return <PropertyNumberField fieldId={fieldId} value={typeof shownValue === "number" ? shownValue : null} minimum={null} maximum={null} labelledBy={labelId} onCommitted={(words) => releaseTheWordsTyped(numberFromTheWordsTyped(words))} />;
    case "toggle":
      return <ToggleSwitch isOn={shownValue === true} onSwitched={release} labelledBy={labelId} data-graph-input-toggle={portName} />;
    case "json":
      return (
        <PropertyTextField
          fieldId={fieldId}
          words={shownValue === null ? "" : jsonTextOf(shownValue)}
          label={portName}
          onCommitted={(words) => releaseTheWordsTyped(graphInput.family === "records" ? jsonObjectFromTheWordsTyped(words) : jsonFromTheWordsTyped(words))}
        />
      );
    case "not_written":
      return <p className="text-2xs text-fg-3">{whyNoControlWritesTheInput(graphInput.family)}</p>;
  }
}
