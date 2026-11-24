import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { InputControlMount, InputValueWords, useRefusalOfTheInput, useWhereTheInputsValueComesFrom } from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { StatusChip } from "@tatolab/tato-app-view-sdk/design_system/status_chip";
import { takesAControl, type ControlledInput } from "@tatolab/tato-app-view-sdk/pin_model/controlled_inputs";
import type { InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { pinTypeWords, pinWords } from "@tatolab/tato-app-view-sdk/pin_model/pin_type_words";
import { useMemo } from "react";
import { GRAPH_INPUT_VALUE_INPUT, LIFETIME_WORDS, WHY_NOTHING_SETS_THE_INPUT, type GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

/** The control Perform draws for `graphInput`'s value, the one its Graph Input node draws; `null` where it takes none, so Perform shows its value in words. */
function controlledValueOf(graphInput: GraphInputOfTheStream, address: InputAddress): ControlledInput | null {
  const controlled = takesAControl({ name: GRAPH_INPUT_VALUE_INPUT, pin: graphInput.value_pin, annotations: graphInput.value_annotations, value_address: address, setting: null, wire: null });
  return controlled === null ? null : { ...controlled, declaration: { ...controlled.declaration, label: graphInput.port_name } };
}

/**
 * One of the stream's inputs in Perform: its name, its type and the lifetime of a value set live on it, and the control its
 * Graph Input node draws, through the frame's binder, on the node's `value` input, so Perform and the node share one value.
 * Every move there is live and nothing is committed. A live value says so and offers Back to saved; the refusal of the latest
 * one shows under it.
 */
export function GraphInputControl({ graphInput }: { graphInput: GraphInputOfTheStream }) {
  const portName = graphInput.port_name;
  const address = graphInput.value_address;
  const controlled = useMemo(() => (address === null ? null : controlledValueOf(graphInput, address)), [graphInput, address]);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line px-3.5 py-3" data-graph-input={portName}>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 truncate text-fg">
          {portName}
        </span>
        <span className="ml-auto shrink-0 font-mono text-2xs text-fg-3">{graphInput.value_pin === null ? pinWords(null) : pinTypeWords(graphInput.value_pin.pin_type)}</span>
      </div>
      {address === null ? (
        <p className="text-2xs text-fg-3" data-graph-input-not-set={portName}>
          {WHY_NOTHING_SETS_THE_INPUT}
        </p>
      ) : (
        <ValueOfTheGraphInput graphInput={graphInput} address={address} controlled={controlled} />
      )}
    </li>
  );
}

/** The value of a Graph Input that holds one: its control, where its value comes from with Back to saved while it is live, its lifetime, and the refusal of its latest value. */
function ValueOfTheGraphInput({ graphInput, address, controlled }: { graphInput: GraphInputOfTheStream; address: InputAddress; controlled: ControlledInput | null }) {
  const portName = graphInput.port_name;
  const valueSource = useWhereTheInputsValueComesFrom(address, "live");
  const refusal = useRefusalOfTheInput(address);
  const valueWords = <InputValueWords address={address} pinType={graphInput.value_pin?.pin_type ?? null} className="text-xs" data-graph-input-value-words={portName} />;
  const isLive = valueSource?.comes_from === "live";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {controlled === null ? valueWords : <InputControlMount input={controlled} surface="perform" readOnly={false} fallback={valueWords} className="w-full" />}
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
            onPressed={() => valueSource.clearTheValue()}
            data-graph-input-back-to-saved={portName}
          >
            Back to saved
          </ActionButton>
        )}
      </div>
      {refusal !== null && <RefusalLine lead="The value wasn't set:" layout="under_field" words={refusal} data-graph-input-refusal={portName} />}
    </div>
  );
}
