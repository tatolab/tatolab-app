import { PropertyNumberField, PropertySliderField, PropertyTextField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { ToggleSwitch } from "@tatolab/tato-app-view-sdk/design_system/toggle_switch";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { jsonValueSchema, type JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { useEffect, useId, useMemo, useState } from "react";
import { GraphInputLatestValueWriter } from "./graph_input_value_writer";
import type { GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

/** A number, or the words typed refused, as `write_graph_input` would never take them. */
function numberFromTheWordsTyped(words: string): { kind: "number"; value: number } | { kind: "not_a_value"; because: string } {
  const typed = Number(words.trim());
  return words.trim() !== "" && Number.isFinite(typed) ? { kind: "number", value: typed } : { kind: "not_a_value", because: `“${words}” isn't a number.` };
}

/** JSON, or the words typed refused with why they don't parse. */
function jsonFromTheWordsTyped(words: string): { kind: "json"; value: JsonValue } | { kind: "not_a_value"; because: string } {
  const parsed = jsonValueSchema.safeParse(textParsedAsJson(words));
  return parsed.success ? { kind: "json", value: parsed.data } : { kind: "not_a_value", because: `“${words}” isn't JSON.` };
}

/** `words` parsed as JSON, `undefined` where they don't parse. */
function textParsedAsJson(words: string): unknown {
  try {
    return JSON.parse(words);
  } catch {
    return undefined;
  }
}

/** The control that writes `graphInput` of `stream`: each value it moves to is handed to the running stream, and the runtime's refusal shows under it. */
export function GraphInputControl({ connection, stream, graphInput }: { connection: Pick<TatoAppViewConnection, "writeGraphInput">; stream: string; graphInput: GraphInputOfTheStream }) {
  const fieldId = useId();
  const labelId = useId();
  const [valueThisControlWrote, setValueThisControlWrote] = useState<{ value: JsonValue } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const portName = graphInput.port_name;
  const writer = useMemo(
    () =>
      new GraphInputLatestValueWriter(
        (value) => connection.writeGraphInput(stream, portName, value),
        (outcome) => setRefusal(outcome.kind === "refused" ? outcome.because : null),
      ),
    [connection, stream, portName],
  );
  const currentValueWords = JSON.stringify(graphInput.current_value);
  useEffect(() => setValueThisControlWrote(null), [currentValueWords]);
  const write = (value: JsonValue) => {
    setValueThisControlWrote({ value });
    writer.write(value);
  };
  const shownValue = valueThisControlWrote === null ? graphInput.current_value : valueThisControlWrote.value;
  const control = (() => {
    switch (graphInput.control) {
      case "slider":
        return (
          <PropertySliderField
            fieldId={fieldId}
            value={typeof shownValue === "number" ? shownValue : null}
            minimum={graphInput.range?.lowest ?? 0}
            maximum={graphInput.range?.highest ?? 1}
            isWholeNumber={false}
            onDragStarted={() => setRefusal(null)}
            onLiveEdit={write}
            onCommitted={write}
          />
        );
      case "number":
        return (
          <PropertyNumberField
            fieldId={fieldId}
            value={typeof shownValue === "number" ? shownValue : null}
            minimum={null}
            maximum={null}
            onCommitted={(words) => {
              const typed = numberFromTheWordsTyped(words);
              if (typed.kind === "number") write(typed.value);
              else setRefusal(typed.because);
            }}
          />
        );
      case "toggle":
        return <ToggleSwitch isOn={shownValue === true} onSwitched={write} labelledBy={labelId} data-graph-input-toggle={portName} />;
      case "json":
        return (
          <PropertyTextField
            fieldId={fieldId}
            words={shownValue === null ? "" : JSON.stringify(shownValue)}
            onCommitted={(words) => {
              const typed = jsonFromTheWordsTyped(words);
              if (typed.kind === "json") write(typed.value);
              else setRefusal(typed.because);
            }}
          />
        );
      case "not_written":
        return <p className="text-2xs text-fg-3">{`${graphInput.family === null ? "An Input of no family" : `An ${graphInput.family} Input`} carries only what the graph wires into it, so no control writes it.`}</p>;
    }
  })();
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line px-3.5 py-3" data-graph-input={portName}>
      <div className="flex items-center gap-2 text-xs">
        <label id={labelId} htmlFor={fieldId} className="min-w-0 truncate text-fg">
          {portName}
        </label>
        <span className="ml-auto shrink-0 font-mono text-2xs text-fg-3">{graphInput.family ?? "no family"}</span>
      </div>
      {control}
      {refusal !== null && <RefusalLine layout="under_field" words={refusal} data-graph-input-refusal={portName} />}
    </li>
  );
}
