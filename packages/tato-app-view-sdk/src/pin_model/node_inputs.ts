// Where one input of one node sits: the key every surface and the value store name it by.

import type { StreamGraphDeclaredPort } from "../studio_readings.js";

/** One level of one stream's graph a value is set on: the project it is in, the stream by its asset's UUID, and the subgraph node UUIDs from the stream's own level inward. */
export interface GraphAddress {
  readonly project_folder: string;
  readonly stream_asset: string;
  readonly level: readonly string[];
}

/** The stream's own level, where a value can be set live, in the project at `projectFolder`, of the stream whose asset's UUID is `streamAsset`; `null` while either is unknown. */
export function graphAddressOfTheStreamsOwnLevel(projectFolder: string, streamAsset: string): GraphAddress;
export function graphAddressOfTheStreamsOwnLevel(projectFolder: string | null, streamAsset: string | null): GraphAddress | null;
export function graphAddressOfTheStreamsOwnLevel(projectFolder: string | null, streamAsset: string | null): GraphAddress | null {
  return projectFolder === null || streamAsset === null ? null : { project_folder: projectFolder, stream_asset: streamAsset, level: [] };
}

/** One input of one node, by the node's UUID. */
export interface InputAddress {
  readonly graph: GraphAddress;
  readonly node_id: string;
  readonly input: string;
}

/** The text `address` is keyed by: two addresses naming the same input give the same key. */
export function inputAddressKey(address: InputAddress): string {
  return JSON.stringify([address.graph.project_folder, address.graph.stream_asset, address.graph.level, address.node_id, address.input]);
}

/** Whether `address` is on a stream's own level, where a value can be set live; below it the runtime takes only a commit. */
export function isOnTheStreamsOwnLevel(address: InputAddress): boolean {
  return address.graph.level.length === 0;
}

/** Where the value `port`, an input of the node `nodeId` at `valuesAt`, holds of its own is kept; `null` on an input that takes no stored value or that a link feeds, and where no stream's graph is known. */
export function valueAddressOfTheInput(valuesAt: GraphAddress | null, nodeId: string, port: Pick<StreamGraphDeclaredPort, "name" | "value_read">): InputAddress | null {
  return valuesAt === null || port.value_read === null || port.value_read.comes_from === "wire" ? null : { graph: valuesAt, node_id: nodeId, input: port.name };
}
