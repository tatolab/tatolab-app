import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { StudioViewToolbarTools } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { NodeGraphPinMark, NodeGraphPinMarkSlot } from "@tatolab/tato-app-view-sdk/design_system/node_graph/node_card";
import { pinWords } from "@tatolab/tato-app-view-sdk/pin_model/pin_type_words";
import { takesAControl } from "@tatolab/tato-app-view-sdk/pin_model/controlled_inputs";
import type { GraphAddress, InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { settingValuesOfTheGraph, valueReadOfTheSetting } from "@tatolab/tato-app-view-sdk/pin_model/node_settings";
import type { InputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import {
  InputControlBinderContext,
  InputControlMount,
  InputValueWords,
  useInputControlsOfTheFrame,
  useInputValuesOfTheStream,
  useRefusalOfTheInput,
  useWhereTheInputsValueComesFrom,
} from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import { nodePinWordsBesideItsSlot, type NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FailureBanner } from "@tatolab/tato-app-view-sdk/design_system/failure_banner";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import {
  PropertyHeadingNameField,
  PropertyPortRow,
  PropertyRow,
  type PropertyPortBandShade,
  PropertySection,
} from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { AreasForAViewTypeReading, StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { FieldMenu, MenuItem, MenuNote } from "@tatolab/tato-app-view-sdk/design_system/menus";
import {
  inputValueReadOfThePort,
  type InputValueComesFrom,
  nodeTypeDescriptionsByType,
  type NodeTypeDescription,
  type NodeTypeInputDescribed,
  type StreamGraph,
  type StreamGraphInputValueRead,
  type StreamGraphNode,
  type StreamGraphPort,
  type StreamGraphReading,
  mayCarryAPicture,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { useNodeTypesOfTheProject } from "../shared/use_node_types_of_the_project";
import { CoreViewFrame } from "../shared/core_view_page";
import { useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { VALUES_UNCHECKED_MEANING } from "../shared/port_stream_facts_words";
import { nodeTitle, nodeTypeClassName, wordsForTheSeveralSelectedNodes } from "../shared/node_words";
import { propertiesListedWords, propertiesMatchingTheSearch } from "./properties_matching_the_search";
import { areasToShowTheViewIn, viewShownInAreasWords } from "./view_node_areas";
import { useGraphEditsInTheOpenProject, type GraphEditsInTheOpenProject, type GraphEditsOfTheNode, type PlaceOfAnEdit } from "./graph_edits_in_the_open_project";
import { streamGraphLevelAtTheSubgraphIds } from "../stream_graph/stream_graph_levels";
import { nodeInputs, nodeOutputs, wiresReadAtTheLevel } from "../shared/node_pins_of_the_graph";
import { selectionOfTheNodes } from "../shared/nodes_of_the_selection";
import { inputRowStateOf, type InputRowState } from "./input_row_state";
import {
  linkDrivingTheInputTakenOut,
  linkedEndsOfThePort,
  nodeIdInShort,
  promoteToGraphInput,
} from "./properties_graph_edits";

/** The stream's own level, which a node selection with no `level` is at. */
const NO_LEVEL: readonly string[] = [];

/** The id of the field holding the value an unlinked input of the node takes. */
function pinValueFieldId(nodeId: string, portName: string): string {
  return `${nodeId}:${portName}:pin`;
}

/** What a port's name shows while the pointer rests on it: the stream facts it reads, and that a Records port's values are not checked. */
function meaningOfAPort(pin: Pick<NodePin, "stream_facts_words">, port: Pick<StreamGraphPort, "values_checked"> | null): string | undefined {
  const meaning = [pin.stream_facts_words.length > 0 ? pin.stream_facts_words.join(" · ") : null, port?.values_checked === false ? VALUES_UNCHECKED_MEANING : null]
    .filter((words): words is string => words !== null)
    .join("\n");
  return meaning === "" ? undefined : meaning;
}

/** Where the value an unwired input shows comes from, in a word. */
const COMES_FROM_WORDS: Record<Exclude<InputValueComesFrom, "wire">, string> = { live: "Live", saved: "Saved", default: "Default" };

/** The place an input's own edits, a disconnect or a promotion, show their refusal under. */
function placeOfTheInput(input: string): PlaceOfAnEdit {
  return `input:${input}`;
}

/** What every input row of the selected node reads and sends through. */
interface InputRowsOfTheNode {
  connection: TatoAppViewConnection;
  stream: string;
  level: readonly string[];
  graph: StreamGraph;
  node: StreamGraphNode;
  /** The stream's asset, which every edit names; `null` where the graph can't be edited. */
  streamAsset: string | null;
  /** The frame's store, which a promotion reads the value an input shows from. */
  inputValues: InputValues;
  graphEdits: GraphEditsOfTheNode;
  searchWords: string;
}

/** Where the runtime reads an input's value from: as its port states, or for a setting the graph lists among no port, as the node's graph document holds it. */
function whereTheInputReadsFrom(node: StreamGraphNode, port: StreamGraphPort | null, describedInput: NodeTypeInputDescribed | undefined): StreamGraphInputValueRead | null {
  if (port !== null) return inputValueReadOfThePort(port);
  return describedInput === undefined ? null : valueReadOfTheSetting(node, describedInput);
}

/** What a row offers to feed its input from a new Graph Input: a promotion of an input; nothing where it can't be. */
function graphInputOfferedOnTheRow(pin: NodePin, port: StreamGraphPort | null, state: InputRowState, rows: InputRowsOfTheNode): { label: string; onPromoted: () => void } | undefined {
  const { level, graph, node, streamAsset, inputValues, graphEdits } = rows;
  if (streamAsset === null) return undefined;
  const place = placeOfTheInput(pin.name);
  const canBePromoted = (state.kind === "holds_a_value" || state.kind === "not_connected") && state.can_be_promoted;
  if (!canBePromoted || port === null) return undefined;
  return {
    label: `Promote ${pin.name} to a Graph Input`,
    onPromoted: () => {
      const nodeNamesTaken = new Set(graph.nodes.map((graphNode) => graphNode.name));
      const valueShownNow = state.kind === "holds_a_value" ? inputValues.shownValue(state.address).value : (inputValueReadOfThePort(port)?.value ?? null);
      void graphEdits.commit(place, promoteToGraphInput(streamAsset, { node, input: port, valueShown: valueShownNow, isOnTheStreamsOwnLevel: level.length === 0, nodeNamesTaken }));
    },
  };
}

/**
 * One input of the node, its settings among them, as its card draws it, wider, in the state `inputRowStateOf` decides: a
 * wired input names each node and pin that drive it, with a way there and a disconnect; an unwired one draws the control its
 * card draws, or the panel's own field where the table has none, says where the store's value comes from, and offers Reset
 * to default and Promote to a Graph Input. `port`
 * is `null` for a setting the graph lists among no port of the node.
 */
function InputRowOfTheNode({ pin, port, describedInput, bandShade, rows }: { pin: NodePin; port: StreamGraphPort | null; describedInput: NodeTypeInputDescribed | undefined; bandShade: PropertyPortBandShade; rows: InputRowsOfTheNode }) {
  const { connection, stream, level, graph, node, streamAsset, graphEdits, searchWords } = rows;
  const place = placeOfTheInput(pin.name);
  const state = inputRowStateOf({ input: pin, value_comes_from: whereTheInputReadsFrom(node, port, describedInput)?.comes_from ?? null, driven_by: linkedEndsOfThePort(graph, node, "input", pin.name), is_editable: streamAsset !== null });
  const valueSource = useWhereTheInputsValueComesFrom(state.kind === "holds_a_value" ? state.address : null, "commit");
  const comesFrom = valueSource?.comes_from ?? null;
  const wireDriven = pin.pin?.pin_type.type === "named" ? takesAControl(pin) : null;
  return (
    <PropertyPortRow
      direction="input"
      portName={nodePinWordsBesideItsSlot(pin)}
      searchWords={searchWords}
      typeWords={pinWords(pin.pin)}
      pinMark={<NodeGraphPinMarkSlot pin={pin.pin} takesAWire={pin.takes_a_wire} />}
      meaning={meaningOfAPort(pin, port)}
      description={pin.description ?? undefined}
      bandShade={bandShade}
      refusal={graphEdits.refusalsByPlace.get(place) ?? null}
      comesFromWords={comesFrom === null || comesFrom === "wire" ? undefined : COMES_FROM_WORDS[comesFrom]}
      reset={valueSource === null || comesFrom !== "saved" ? undefined : { label: `Reset ${pin.name} to default`, onReset: valueSource.clearTheValue }}
      promotion={graphInputOfferedOnTheRow(pin, port, state, rows)}
      linkedEnds={
        state.kind !== "wired"
          ? []
          : state.driven_by.map((linkedEnd) => {
              const driverTitle = nodeTitle(linkedEnd.node.name, linkedEnd.node.type);
              const selectionOfTheDriver = selectionOfTheNodes(stream, [linkedEnd.node.name], level);
              return {
                nodeTitle: driverTitle,
                port: linkedEnd.port,
                linkKey: `${linkedEnd.node.id}:${linkedEnd.port}`,
                jump: selectionOfTheDriver === null ? undefined : { label: `Go to ${driverTitle}`, onJumped: () => void connection.select(selectionOfTheDriver) },
                disconnection:
                  !state.can_be_disconnected || streamAsset === null
                    ? undefined
                    : { label: `Disconnect ${driverTitle} › ${linkedEnd.port}`, onDisconnected: () => void graphEdits.commit(place, linkDrivingTheInputTakenOut(streamAsset, linkedEnd, node, pin.name)) },
              };
            })
      }
      wireReading={wireDriven === null ? undefined : <InputControlMount input={wireDriven} surface="properties" readOnly={streamAsset === null} fallback={null} className="w-full" />}
      unlinkedValue={
        state.kind === "holds_a_value" ? (
          <ValueOfTheUnwiredInput fieldId={pinValueFieldId(node.id, pin.name)} nodePin={pin} address={state.address} />
        ) : state.kind === "wired_from_outside_the_level" ? (
          <span className="text-fg-3" data-properties-input-wired-from-outside-the-level>
            Wired
          </span>
        ) : undefined
      }
    />
  );
}

/**
 * An unwired input's value: the control its card draws, through the frame's binder, where its type is exact, and its value
 * in words while that control loads and where the table has no control for it, which no surface sets. Under it, the store's
 * refusal of the last value sent to it.
 */
function ValueOfTheUnwiredInput({ fieldId, nodePin, address }: { fieldId: string; nodePin: Pick<NodePin, "pin" | "annotations" | "setting">; address: InputAddress }) {
  const controlled = takesAControl({ name: address.input, pin: nodePin.pin, annotations: nodePin.annotations, value_address: address, setting: nodePin.setting, wire: null });
  const valueWords = <InputValueWords id={fieldId} address={address} pinType={nodePin.pin?.pin_type ?? null} data-properties-input-value-words={address.input} />;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {controlled === null ? valueWords : <InputControlMount input={controlled} surface="properties" readOnly={false} fallback={valueWords} className="w-full" />}
      <RefusalOfTheInputsValue address={address} />
    </div>
  );
}

/** The store's refusal of the last value sent to `address`, under its value; nothing while the last one was taken. */
function RefusalOfTheInputsValue({ address }: { address: InputAddress }) {
  const refusal = useRefusalOfTheInput(address);
  if (refusal === null) return null;
  return <RefusalLine lead="The value wasn't set:" words={refusal} layout="under_field" data-properties-input-value-refusal={address.input} />;
}

/** One output of the node: its type, its description, and each input it feeds. */
function OutputRowOfTheNode({ pin, port, bandShade, graph, node, searchWords }: { pin: NodePin; port: StreamGraphPort; bandShade: PropertyPortBandShade; graph: StreamGraph; node: StreamGraphNode; searchWords: string }) {
  return (
    <PropertyPortRow
      direction="output"
      portName={nodePinWordsBesideItsSlot(pin)}
      searchWords={searchWords}
      typeWords={pinWords(pin.pin)}
      pinMark={<NodeGraphPinMark pin={pin.pin} />}
      meaning={meaningOfAPort(pin, port)}
      description={pin.description ?? undefined}
      bandShade={bandShade}
      linkedEnds={linkedEndsOfThePort(graph, node, "output", pin.name).map((reader) => ({ nodeTitle: nodeTitle(reader.node.name, reader.node.type), port: reader.port, linkKey: `${reader.node.id}:${reader.port}` }))}
    />
  );
}

/** The shade of the band at `bandIndex` down the panel. */
function bandShadeAt(bandIndex: number): PropertyPortBandShade {
  return bandIndex % 2 === 0 ? "first" : "second";
}

/** A view node's section, with its row naming how many areas show its view, with Show in an area to show it in another; nothing for a node that is not a view's. */
function ViewNodeShownInAreasRow({ connection, viewTypeId }: { connection: TatoAppViewConnection; viewTypeId: string }) {
  const areasReading = useViewReading(useCallback((listener: (reading: AreasForAViewTypeReading) => void): StopWatching => connection.watchAreasForTheViewType(viewTypeId, listener), [connection, viewTypeId]));
  const [showingRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  if (areasReading === null || areasReading.kind === "not_a_view_type") return null;
  if (areasReading.kind === "no_areas") {
    return (
      <PropertySection title="View">
        <PropertyRow label="Shown in" data-properties-view-shown-in={viewTypeId}>
          {() => <p className="text-xs text-fg-3">{areasReading.because}</p>}
        </PropertyRow>
      </PropertySection>
    );
  }
  const areasOffered = areasToShowTheViewIn(areasReading.areas);
  return (
    <PropertySection title="View">
      <PropertyRow label="Shown in" refusal={showingRefusal === null ? null : `${showingRefusal.lead} ${showingRefusal.because}`} data-properties-view-shown-in={viewTypeId}>
      {() => (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span role="status" aria-label={`Shown in: ${viewShownInAreasWords(areasReading.areas)}`} className="text-xs whitespace-nowrap text-fg-2" data-properties-view-shown-in-words>
            {viewShownInAreasWords(areasReading.areas)}
          </span>
          <FieldMenu label={`Show ${areasReading.view_title} in an area`} words="Show in an area" size="compact" menuWidth="wide" menuAlignment="end" data-properties-show-in-an-area={viewTypeId}>
            <MenuNote>Areas of the layout shown</MenuNote>
            {areasOffered.length === 0 ? (
              <MenuNote>Every other area shows {areasReading.view_title}.</MenuNote>
            ) : (
              areasOffered.map((area) => (
                <MenuItem key={area.area_id} onChosen={() => showTheRefusalOf(`${areasReading.view_title} wasn't shown:`, connection.showViewTypeInArea(viewTypeId, area.area_id))} data-properties-show-in-area={area.area_id}>
                  {area.words}
                </MenuItem>
              ))
            )}
          </FieldMenu>
        </div>
      )}
      </PropertyRow>
    </PropertySection>
  );
}

/** The selected node's name, and its inputs, its settings first, and outputs, with what each joins and the value each unwired input holds. */
function PropertiesOfTheSelectedNode({
  connection,
  stream,
  level,
  nodeName,
  graphEditsInTheProject,
  projectFolder,
  inputValues,
  searchWords,
}: {
  connection: TatoAppViewConnection;
  stream: string;
  level: readonly string[];
  nodeName: string;
  graphEditsInTheProject: GraphEditsInTheOpenProject;
  /** The open project's folder, where the frame's store sends each input's value; `null` while none is open. */
  projectFolder: string | null;
  inputValues: InputValues;
  searchWords: string;
}) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const graphReading = useViewReading(watchTheStreamsGraph);
  const nodeTypesReading = useNodeTypesOfTheProject(connection, projectFolder);
  const describedByType = useMemo(() => nodeTypeDescriptionsByType(nodeTypesReading?.kind === "listed" ? nodeTypesReading.node_types.described : []), [nodeTypesReading]);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const nodeShownWhileItWasSelectedByName = useRef<{ nodeName: string; nodeId: string } | null>(null);
  const streamGraph = graphReading?.kind === "read" ? graphReading.graph : null;
  const graph = useMemo(() => (streamGraph === null ? null : (streamGraphLevelAtTheSubgraphIds(streamGraph, level)?.graph ?? null)), [streamGraph, level]);
  const nodeSelectedByName = graph?.nodes.find((graphNode) => graphNode.name === nodeName);
  const nodeRenamedSinceItWasSelected =
    nodeSelectedByName === undefined && nodeShownWhileItWasSelectedByName.current?.nodeName === nodeName
      ? graph?.nodes.find((graphNode) => graphNode.id === nodeShownWhileItWasSelectedByName.current?.nodeId)
      : undefined;
  const node = nodeSelectedByName ?? nodeRenamedSinceItWasSelected;
  if (nodeSelectedByName !== undefined) nodeShownWhileItWasSelectedByName.current = { nodeName, nodeId: nodeSelectedByName.id };
  const graphEdits = graphEditsInTheProject.ofTheNode(node?.id ?? "", level);
  const described: NodeTypeDescription | undefined = node === undefined ? undefined : describedByType.get(node.type);
  const settingValues = useMemo(() => (streamGraph === null ? [] : settingValuesOfTheGraph(streamGraph, describedByType)), [streamGraph, describedByType]);
  useInputValuesOfTheStream(connection, inputValues, stream, projectFolder, settingValues);
  const streamAssetOfTheGraph = streamGraph?.asset ?? null;
  const valuesAt = useMemo(
    (): GraphAddress | null => (projectFolder === null || streamAssetOfTheGraph === null ? null : { project_folder: projectFolder, stream_asset: streamAssetOfTheGraph, level }),
    [projectFolder, streamAssetOfTheGraph, level],
  );
  const nameTheNodeGoesByNow = node?.name;
  useEffect(() => {
    if (nameTheNodeGoesByNow === undefined || nameTheNodeGoesByNow === nodeName) return;
    const selectionOfTheNodeRenamed = selectionOfTheNodes(stream, [nameTheNodeGoesByNow], level);
    if (selectionOfTheNodeRenamed !== null) void connection.select(selectionOfTheNodeRenamed);
  }, [connection, stream, level, nodeName, nameTheNodeGoesByNow]);

  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") return <WaitingState title={`${nodeName} can't be read`} explanation={graphReading.because} data-properties-state="graph_not_read" />;
  if (graph === null || node === undefined)
    return <WaitingState title={`${nodeName} is gone`} explanation="Its stream's graph no longer has it." data-properties-state="node_gone" />;
  const streamAsset = graph.asset ?? null;
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((candidate) => candidate.stream === stream) : undefined;
  const streamName = listedStream?.display_name ?? stream;
  const typeClassName = nodeTypeClassName(node.type);
  const refusalOfTheName = graphEdits.refusalsByPlace.get("name");
  const inputPins = nodeInputs(graph, node, described, valuesAt, wiresReadAtTheLevel(stream, valuesAt));
  const outputPins = nodeOutputs(node, described);
  const matching = propertiesMatchingTheSearch(
    inputPins.map((pin) => pin.name),
    outputPins.map((pin) => pin.name),
    searchWords,
  );
  const inputsListed = inputPins.flatMap((pin) =>
    matching.inputs_listed.has(pin.name) ? [{ pin, port: node.ports.inputs.find((port) => port.name === pin.name) ?? null, describedInput: described?.inputs.find((input) => input.name === pin.name) }] : [],
  );
  const outputPortsListed = outputPins.flatMap((pin) => {
    const port = node.ports.outputs.find((candidate) => candidate.name === pin.name);
    return port !== undefined && matching.outputs_listed.has(pin.name) ? [{ port, pin }] : [];
  });
  const inputRows: InputRowsOfTheNode = { connection, stream, level, graph, node, streamAsset, inputValues, graphEdits, searchWords };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-properties-of-node={node.name}>
      <header className="flex min-w-0 flex-col gap-0.5 border-b px-3 py-2">
        <PropertyHeadingNameField
          label="Node name"
          name={nodeTitle(node.name, node.type)}
          onCommitted={
            streamAsset === null
              ? undefined
              : (name) => {
                  void graphEdits.commit("name", [{ operation: "rename_node", stream: streamAsset, node: node.id, name }]);
                }
          }
        />
        <div className="flex min-w-0 items-center gap-2 px-1">
          <span
            className="min-w-0 truncate text-xs text-fg-3"
            title={described === undefined || described.documentation === "" ? node.type : `${node.type} · ${described.documentation}`}
          >
            {typeClassName}
          </span>
          <span className="ml-auto shrink-0 font-mono text-2xs text-fg-3" title={node.id} data-properties-node-id={node.id}>
            {nodeIdInShort(node.id)}
          </span>
        </div>
      </header>
      {refusalOfTheName !== undefined && (
        <div data-property-refusal>
          <RefusalLine words={refusalOfTheName} layout="bar" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {node.components.state === "Error" && (
          <div data-properties-node-failed={node.name}>
            <FailureBanner place="panel">{node.components.failed_because === null ? "This node failed. The runtime gave no reason." : "This node failed."}</FailureBanner>
            {node.components.failed_because !== null && (
              <div className="border-b px-3 py-2.5">
                <RuntimeFailureWords words={node.components.failed_because} data-properties-failed-because={node.name} />
              </div>
            )}
          </div>
        )}
        {node.components.state !== "Error" && node.components.process_raising_because !== null && (
          <div data-properties-node-process-raising={node.name}>
            <FailureBanner place="panel">This node is running, but its process() keeps raising.</FailureBanner>
            <div className="border-b px-3 py-2.5">
              <RuntimeFailureWords words={node.components.process_raising_because} data-properties-process-raising-because={node.name} />
            </div>
          </div>
        )}
        {node.components.not_ready_because !== null && (
          <div data-properties-node-not-ready={node.name}>
            <RefusalLine lead="This node isn't ready:" words={node.components.not_ready_because} tone="warning" layout="bar" data-properties-not-ready-because={node.name} />
          </div>
        )}
        {streamAsset === null && <p className="border-b px-3 py-1.5 text-xs text-fg-3">This runtime names no stream asset for {streamName}, so its nodes can't be edited from here.</p>}
        {matching.is_searching && (
          <p role="status" className="border-b px-3 py-1.5 text-xs text-fg-3" data-properties-listed-count="">
            {propertiesListedWords(matching)}
          </p>
        )}
        {!matching.is_searching && <ViewNodeShownInAreasRow connection={connection} viewTypeId={node.type} />}
        {(!matching.is_searching || matching.inputs_listed.size > 0) && (
          <PropertySection title="Inputs" data-properties-section="inputs">
            {nodeTypesReading?.kind === "not_listed" && <p className="px-1 text-xs text-fg-3" data-properties-settings-not-listed="">{nodeTypesReading.because}</p>}
            {inputPins.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              inputsListed.map(({ pin, port, describedInput }, inputIndex) => <InputRowOfTheNode key={pin.name} pin={pin} port={port} describedInput={describedInput} bandShade={bandShadeAt(inputIndex)} rows={inputRows} />)
            )}
          </PropertySection>
        )}
        {(!matching.is_searching || matching.outputs_listed.size > 0) && (
          <PropertySection title="Outputs" data-properties-section="outputs">
            {outputPins.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              outputPortsListed.map(({ port, pin }, portIndex) => (
                <OutputRowOfTheNode key={port.name} pin={pin} port={port} bandShade={bandShadeAt(inputsListed.length + portIndex)} graph={graph} node={node} searchWords={searchWords} />
              ))
            )}
            {outputPortsListed
              .filter(({ pin }) => mayCarryAPicture(pin.pin?.pin_type))
              .map(({ port }) => (
                <div key={port.name} className="flex justify-end">
                  <ActionButton
                    appearance="secondary"
                    size="small"
                    onPressed={() =>
                      void connection.openView("viewer", {
                        kind: "port",
                        target: { stream, node_id: node.id, port: port.name },
                      })
                    }
                  >
                    Visualize {port.name}
                  </ActionButton>
                </div>
              ))}
          </PropertySection>
        )}
      </div>
    </div>
  );
}

/** How many nodes are selected together and their titles, in place of fields that would belong to no one node. */
function SummaryOfTheSeveralSelectedNodes({ connection, stream, level, nodeNames }: { connection: TatoAppViewConnection; stream: string; level: readonly string[]; nodeNames: readonly string[] }) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const graphReading = useViewReading(watchTheStreamsGraph);
  const nodesOfTheLevel = graphReading?.kind === "read" ? (streamGraphLevelAtTheSubgraphIds(graphReading.graph, level)?.graph.nodes ?? []) : [];
  const { title, explanation } = wordsForTheSeveralSelectedNodes(nodeNames, nodesOfTheLevel);
  return <WaitingState title={title} explanation={explanation} data-properties-state="several_nodes" />;
}

function PropertiesBody({ connection }: { connection: TatoAppViewConnection }) {
  const selection = useViewReading(connection.watchSelection);
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const openProject = useViewReading(connection.watchOpenProject);
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const graphEditsInTheProject = useGraphEditsInTheOpenProject(connection, projectFolder);
  const [searchWords, setSearchWords] = useState("");
  const { inputValues, inputControls } = useInputControlsOfTheFrame(connection);
  if (selection?.kind === "nodes" && activeStreamTab?.stream === selection.stream) {
    return <SummaryOfTheSeveralSelectedNodes connection={connection} stream={selection.stream} level={selection.level ?? NO_LEVEL} nodeNames={selection.nodes} />;
  }
  if (selection?.kind !== "node" || activeStreamTab?.stream !== selection.stream) {
    return <WaitingState title="Nothing to show" explanation="Select a node in the stream graph to set its inputs and see what it's connected to." data-properties-state="no_node" />;
  }
  return (
    <>
      <StudioViewToolbarTools label="Properties search">
        <SearchField label="Search properties" placeholder="Search properties" text={searchWords} onTextChanged={setSearchWords} width="fills_the_row" data-properties-search="" />
      </StudioViewToolbarTools>
        <InputControlBinderContext value={inputControls}>
          <PropertiesOfTheSelectedNode
            key={`${selection.stream}/${(selection.level ?? []).join("/")}`}
            connection={connection}
            stream={selection.stream}
            level={selection.level ?? NO_LEVEL}
            nodeName={selection.node}
            graphEditsInTheProject={graphEditsInTheProject}
            projectFolder={projectFolder}
            inputValues={inputValues}
            searchWords={searchWords}
          />
        </InputControlBinderContext>
    </>
  );
}

/** The Properties view's whole frame: the selection's properties, under its header row. */
export function PropertiesView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Properties tools">
      <PropertiesBody connection={connection} />
    </CoreViewFrame>
  );
}
