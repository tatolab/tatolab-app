import { useViewReading, useViewReadingSoFar, type ViewReadingSoFar } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { graphAddressOfTheStreamsOwnLevel } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { InputControlBinderContext, useInputControlsOfTheFrame, useInputValuesOfTheStream } from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { InputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { StreamGraphReading, StreamTabAddress } from "@tatolab/tato-app-view-sdk/studio_readings";
import { useCallback, useMemo } from "react";
import { CoreViewFrame } from "../shared/core_view_page";
import { GraphInputControl } from "./graph_input_control";
import { graphInputsOfTheStream } from "./graph_inputs_of_the_stream";

/** The inputs of the stream `streamTab` is open on, each with its control, their values fed into the frame's store from the stream while the project in `projectFolder` is open. */
function GraphInputsOfTheTab({ connection, inputValues, streamTab, projectFolder }: { connection: TatoAppViewConnection; inputValues: InputValues; streamTab: StreamTabAddress; projectFolder: string | null }) {
  const graphReading = useViewReading(
    useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(streamTab.stream, listener), [connection, streamTab.stream]),
  );
  useInputValuesOfTheStream(connection, inputValues, streamTab.stream, projectFolder);
  const graphInputs = useMemo(() => {
    if (graphReading?.kind !== "read") return null;
    const streamAsset = graphReading.graph.asset ?? null;
    return graphInputsOfTheStream(graphReading.graph, graphAddressOfTheStreamsOwnLevel(projectFolder, streamAsset));
  }, [graphReading, projectFolder]);
  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") return <WaitingState isFailure title={`${streamTab.display_name}'s graph can't be read`} explanation={graphReading.because} />;
  if (graphInputs === null || graphInputs.length === 0) {
    return <WaitingState title={`${streamTab.display_name} has no inputs`} explanation="Add a Graph Input node to the stream, and it shows here with its control." data-controls-state="no_graph_inputs" />;
  }
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2.5">
      <ul className="flex flex-col gap-2" aria-label={`${streamTab.display_name}'s inputs`}>
        {graphInputs.map((graphInput) => (
          <GraphInputControl key={`${graphInput.node_id}:${graphInput.port_name}`} graphInput={graphInput} />
        ))}
      </ul>
    </div>
  );
}

function PerformBody({ connection, activeStreamTab }: { connection: TatoAppViewConnection; activeStreamTab: ViewReadingSoFar<StreamTabAddress | null> }) {
  const openProject = useViewReading(connection.watchOpenProject);
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const { inputValues, inputControls } = useInputControlsOfTheFrame(connection);
  if (activeStreamTab.kind === "not_read_yet") return null;
  if (activeStreamTab.reading === null) return <WaitingState title="No stream is open" explanation="Double-click a stream in the outliner to perform its inputs here." data-controls-state="no_tab" />;
  return (
    <InputControlBinderContext value={inputControls}>
      <GraphInputsOfTheTab key={activeStreamTab.reading.stream} connection={connection} inputValues={inputValues} streamTab={activeStreamTab.reading} projectFolder={projectFolder} />
    </InputControlBinderContext>
  );
}

/** Perform: the active stream's inputs, each with the control its Graph Input node draws, every move live and none recorded. */
export function ControlsView({ connection }: { connection: TatoAppViewConnection }) {
  const activeStreamTab = useViewReadingSoFar(connection.watchActiveStreamTab);
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Perform tools">
      <PerformBody connection={connection} activeStreamTab={activeStreamTab} />
    </CoreViewFrame>
  );
}
