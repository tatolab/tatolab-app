// A loaded stream's graph, as the runtime's `graph` answers it, built from the few fields a reading looks at: every field the
// contract requires is filled with what the runtime writes for a node, port or link that states nothing more, so a test writes
// only what it reads.

import type { GraphLinkOnTheWire, GraphLinkStateOnTheWire, GraphNodeComponentsOnTheWire, GraphNodeOnTheWire, GraphNodePortOnTheWire, StreamGraphOnTheWire } from "@tatolab/runtime-client/contract";

/** The port `name`, with the fields a test reads of it, such as its pin type. */
export function aGraphPort(name: string, fields: Omit<Partial<GraphNodePortOnTheWire>, "name"> = {}): GraphNodePortOnTheWire {
  return { name, ...fields };
}

/** The fields of a node beside its name, with its ports and components written apart; each it leaves out reads as the runtime renders none. */
export type GraphNodeFields = Omit<Partial<GraphNodeOnTheWire>, "name" | "ports" | "components"> & {
  readonly inputs?: readonly GraphNodePortOnTheWire[];
  readonly outputs?: readonly GraphNodePortOnTheWire[];
  readonly components?: Partial<GraphNodeComponentsOnTheWire>;
};

/** The node `name`, its id `name` and its type `nodes.<name>:Node` unless `fields` names others, failing for no reason. */
export function aGraphNode(name: string, fields: GraphNodeFields = {}): GraphNodeOnTheWire {
  const { inputs = [], outputs = [], components = {}, ...nodeFields } = fields;
  return {
    id: name,
    type: `nodes.${name}:Node`,
    name,
    ...nodeFields,
    ports: { inputs: [...inputs], outputs: [...outputs] },
    components: { failed_because: null, process_raising_because: null, not_ready_because: null, ...components },
  };
}

/** The link `id` from the output `[node, port]` `source` to the input `target`, in `state`. */
export function aGraphLink(id: string, source: readonly [string, string], target: readonly [string, string], state: GraphLinkStateOnTheWire = "wired"): GraphLinkOnTheWire {
  return { id, source: { node: source[0], port: source[1] }, target: { node: target[0], port: target[1] }, state, components: {} };
}

/** The graph of the stream `main` on the machine `studio-machine` holding `nodes` and `links`, with any other field `fields` names. */
export function aStreamGraph(nodes: readonly GraphNodeOnTheWire[], links: readonly GraphLinkOnTheWire[], fields: Omit<Partial<StreamGraphOnTheWire>, "nodes" | "links"> = {}): StreamGraphOnTheWire {
  return { stream: "main", machine: "studio-machine", ...fields, nodes: [...nodes], links: [...links] };
}
