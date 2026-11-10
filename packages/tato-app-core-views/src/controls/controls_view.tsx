import { useViewReading, useViewReadingSoFar, type ViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphReading, StreamTabAddress } from "@tatolab/tato-app-view-sdk/studio_readings";
import { useCallback, useMemo } from "react";
import { CoreViewFrame } from "../shared/core_view_page";
import { graphInputsOfTheStream, type GraphInputOfTheStream } from "./graph_inputs_of_the_stream";

/** The runtime work a control's live value waits on before moving it can change the stream. */
const LIVE_GRAPH_INPUT_VALUES_WAIT_ON = "tatolab/streamlib#3485";

function GraphInputControl({ graphInput }: { graphInput: GraphInputOfTheStream }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-studio-control px-3.5 py-3" data-graph-input={graphInput.port_name}>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 truncate text-fg">{graphInput.port_name}</span>
        <span className="ml-auto shrink-0 font-mono text-2xs text-fg-3">{graphInput.family ?? "no family"}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line" aria-hidden />
    </li>
  );
}

/** The Graph Inputs of the stream `streamTab` is open on, each a control. */
function GraphInputsOfTheTab({ connection, streamTab }: { connection: TatoAppViewConnection; streamTab: StreamTabAddress }) {
  const graphReading = useViewReading(
    useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(streamTab.stream, listener), [connection, streamTab.stream]),
  );
  const graphInputs = useMemo(() => (graphReading?.kind === "read" ? graphInputsOfTheStream(graphReading.graph) : null), [graphReading]);
  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") return <WaitingState isFailure title={`${streamTab.display_name}'s graph can't be read`} explanation={graphReading.because} />;
  if (graphInputs === null || graphInputs.length === 0) {
    return <WaitingState title={`${streamTab.display_name} has no Graph Inputs`} explanation="Add a Graph Input node to the stream, and it shows here as a control." data-controls-state="no_graph_inputs" />;
  }
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2.5">
      <ul className="flex flex-col gap-2 rounded-lg outline-1 outline-offset-2 outline-warn outline-dashed" aria-label={`${streamTab.display_name}'s Graph Inputs`}>
        {graphInputs.map((graphInput) => (
          <GraphInputControl key={graphInput.node_id} graphInput={graphInput} />
        ))}
      </ul>
      <p className="mt-auto rounded-lg bg-well p-2.5 text-2xs text-fg-3">
        Moving a control will send its value to the running stream live, leaving History quiet. Until the runtime takes a live value for a Graph Input, each control shows the input but
        sets nothing.
        <span className="mt-1 block">
          Waits on <span className="font-mono">{LIVE_GRAPH_INPUT_VALUES_WAIT_ON}</span>
        </span>
      </p>
    </div>
  );
}

function ControlsBody({ connection, activeStreamTab }: { connection: TatoAppViewConnection; activeStreamTab: ViewReadingSoFar<StreamTabAddress | null> }) {
  if (activeStreamTab.kind === "not_read_yet") return null;
  if (activeStreamTab.reading === null) return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to control its Graph Inputs here." data-controls-state="no_tab" />;
  return <GraphInputsOfTheTab key={activeStreamTab.reading.stream} connection={connection} streamTab={activeStreamTab.reading} />;
}

/** Controls: the active stream's Graph Inputs as a control surface, beside Perform's viewers. */
export function ControlsView({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  const headerWords = activeStreamTab.kind === "read" && activeStreamTab.reading !== null ? `${activeStreamTab.reading.display_name}'s Graph Inputs` : null;
  return (
    <CoreViewFrame connection={connection} headerTools={headerWords === null ? undefined : <span className="truncate text-2xs text-fg-3">{headerWords}</span>}>
      <ControlsBody connection={connection} activeStreamTab={activeStreamTab} />
    </CoreViewFrame>
  );
}
