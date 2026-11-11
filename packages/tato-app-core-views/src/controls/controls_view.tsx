import { useViewReading, useViewReadingSoFar, type ViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphReading, StreamTabAddress } from "@tatolab/tato-app-view-sdk/studio_readings";
import { useCallback, useMemo } from "react";
import { CoreViewFrame } from "../shared/core_view_page";
import { GraphInputControl } from "./graph_input_control";
import { graphInputsOfTheStream } from "./graph_inputs_of_the_stream";

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
      <ul className="flex flex-col gap-2" aria-label={`${streamTab.display_name}'s Graph Inputs`}>
        {graphInputs.map((graphInput) => (
          <GraphInputControl key={`${graphInput.node_id}:${graphInput.port_name}`} connection={connection} stream={streamTab.stream} graphInput={graphInput} />
        ))}
      </ul>
    </div>
  );
}

function ControlsBody({ connection, activeStreamTab }: { connection: TatoAppViewConnection; activeStreamTab: ViewReadingSoFar<StreamTabAddress | null> }) {
  if (activeStreamTab.kind === "not_read_yet") return null;
  if (activeStreamTab.reading === null) return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to control its Graph Inputs here." data-controls-state="no_tab" />;
  return <GraphInputsOfTheTab key={activeStreamTab.reading.stream} connection={connection} streamTab={activeStreamTab.reading} />;
}

/** Controls: the active stream's Graph Inputs as a control surface. */
export function ControlsView({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Controls tools">
      <ControlsBody connection={connection} activeStreamTab={activeStreamTab} />
    </CoreViewFrame>
  );
}
