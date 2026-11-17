// Where one input of one node sits: the key every surface and the value store name it by.

/** One level of one stream's graph a value is set on: the project it is in, the stream by its asset's UUID, and the subgraph node UUIDs from the stream's own level inward. */
export interface GraphAddress {
  readonly project_folder: string;
  readonly stream_asset: string;
  readonly level: readonly string[];
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
