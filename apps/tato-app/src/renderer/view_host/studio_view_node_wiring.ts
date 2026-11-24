// A view people write is a node in its stream's graph: each of its inputs reads whatever output a
// link wires into it, through that output's port viewer, what it writes on an output is set on the
// node's input of that name, which the node publishes on the output, and its settings are the node's
// inputs of their names, which take no wire.

import type { TatolabViewManifest, ViewDeclaredPort } from "@tatolab/tato-app-view-sdk";
import { setNodeInputValueAction } from "@tatolab/tato-app-view-sdk/pin_model/input_value_actions";
import { wiringOfTheInput, type InputWiring } from "@tatolab/tato-app-view-sdk/pin_model/input_wiring";
import { graphAddressOfTheStreamsOwnLevel } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { jsonObjectMembersOf, type JsonValue, type StreamGraphAction } from "@tatolab/tato-app-view-sdk/studio_readings";
import { nodeTitle } from "@tatolab/tato-app-core-views/shared/node_words";
import type { StreamGraph, StreamGraphNode, StudioViewNodeAddress } from "./studio_view_contract";

/** The nodes of `graph` of the view type `viewTypeId`, which is a node type of its own, in the graph's order. */
export function nodesOfTheStudioViewType(graph: StreamGraph, viewTypeId: string): StreamGraphNode[] {
  return graph.nodes.filter((node) => node.type === viewTypeId);
}

/** The node of `viewNodes` the area keeps showing, by `shownNodeId`, or the first when it keeps none or that node is gone; `null` when there are none. */
export function nodeShownByTheArea<Node extends Pick<StreamGraphNode, "id">>(viewNodes: readonly Node[], shownNodeId: string | null): Node | null {
  return viewNodes.find((node) => node.id === shownNodeId) ?? viewNodes[0] ?? null;
}

/** Where a value is set on the inputs of `viewNode`, on the own level of the stream `graph` renders, named `streamWords`, in the window's project at `projectFolder`; or why none is while either is unknown. */
export function studioViewNodeAddressOf(projectFolder: string | null, graph: StreamGraph, viewNode: StreamGraphNode, streamWords: string): StudioViewNodeAddress {
  const title = nodeTitle(viewNode.name, viewNode.type);
  if (projectFolder === null) return { kind: "not_addressed", because: `No project is open in this window, so nothing is set on the ${title} node in ${streamWords}.` };
  const streamAsset = graph.asset ?? null;
  if (streamAsset === null) return { kind: "not_addressed", because: `The runtime's graph of ${streamWords} names no stream asset, so nothing is set on its ${title} node.` };
  return { kind: "addressed", graph: graphAddressOfTheStreamsOwnLevel(projectFolder, streamAsset), node_id: viewNode.id };
}

/**
 * What each of `declaredInputs` of the view node `viewNode` reads in `graph`, the graph of the stream `stream`, by input name:
 * whatever output is linked into it, as the runtime judged that link by the two pins' types.
 */
export function studioViewInputWiring(stream: string, graph: StreamGraph, viewNode: StreamGraphNode, declaredInputs: readonly Pick<ViewDeclaredPort, "name">[]): Record<string, InputWiring> {
  return Object.fromEntries(
    declaredInputs.map((declaredInput) => [declaredInput.name, wiringOfTheInput(stream, graph, viewNode.name, declaredInput.name)]),
  );
}

/**
 * The settings `manifest` declares as the view node `viewNode` holds them: the value its graph document holds for each setting's input,
 * by name, a setting it holds none for left out to read its default; `undefined` for a view that declares no settings.
 */
export function settingsTheViewNodeHolds(manifest: Pick<TatolabViewManifest, "settings">, viewNode: Pick<StreamGraphNode, "input_values">): JsonValue | undefined {
  if (manifest.settings === undefined) return undefined;
  const valuesByInput = jsonObjectMembersOf(viewNode.input_values);
  return Object.fromEntries(Object.keys(manifest.settings.properties).flatMap((settingName) => (Object.hasOwn(valuesByInput, settingName) ? [[settingName, valuesByInput[settingName]]] : [])));
}

/** A set of the input of each setting whose value `settings` changes from `settingsHeld`, on the view node at `viewNode`, in the settings' order; none where nothing changed. */
export function settingsSetOnTheViewNode(
  viewNode: Extract<StudioViewNodeAddress, { kind: "addressed" }>,
  settingsHeld: { readonly [settingName: string]: JsonValue },
  settings: { readonly [settingName: string]: JsonValue },
): StreamGraphAction[] {
  return Object.entries(settings).flatMap(([settingName, value]) =>
    JSON.stringify(settingsHeld[settingName] ?? null) === JSON.stringify(value) ? [] : [setNodeInputValueAction({ graph: viewNode.graph, node_id: viewNode.node_id, input: settingName, member: null }, value)],
  );
}
