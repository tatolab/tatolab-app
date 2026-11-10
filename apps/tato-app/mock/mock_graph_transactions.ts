// The browser mock's `transact`: graph actions applied to the mock streams' graphs whole or not at all, a node named
// by its id or an earlier `add_node`'s `as`, answered as the runtime answers (`GraphTransactionToolResult`) or
// refused as it refuses (`ProjectActionRefusalOnTheWire`), in words modelled on the runtime's. An action the mock
// does not model is refused, naming it.

import { mockNodeIdOf, type MockStreamGraph } from "./mock_stream_fixtures";
import { MOCK_NODE_CATALOG_ENTRIES } from "./mock_node_catalog";
import type { JsonValue, ProjectActionRefusal, ProjectGraphTransaction, StreamGraphAction, StreamGraphActionLinkEnd } from "../src/shared/tatolab_backend_contract";

/** A mock stream a graph action can name: its id, and the graph the mock holds for it. */
export interface MockStreamGraphTarget {
  stream_id: string;
  graph: MockStreamGraph;
}

/** What a mock transaction did, or the refusal that left every graph as it was. */
export type MockGraphTransactionOutcome =
  | { kind: "applied"; transaction: Omit<ProjectGraphTransaction, "mode" | "transaction" | "commit">; inverse_operations: JsonValue[] }
  | { kind: "refused"; refusal: ProjectActionRefusal };

class MockGraphActionRefused {
  constructor(readonly refusal: Omit<ProjectActionRefusal, "action" | "refused_operation_index">) {}
}

function refusedNaming(words: string, named: Partial<Omit<ProjectActionRefusal, "action" | "refused_operation_index" | "runtime_words">> = {}): MockGraphActionRefused {
  return new MockGraphActionRefused({ refused_node: null, refused_link: null, refused_field: null, ...named, runtime_words: words });
}

function shortNameOfTheType(nodeType: string): string {
  return (nodeType.split(":").at(-1) ?? nodeType).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * Apply `operations` to `targetsByStreamAsset`'s graphs as one transaction: each graph is changed only once every
 * operation has applied to a copy of it.
 */
export function applyMockGraphTransaction(targetsByStreamAsset: ReadonlyMap<string, MockStreamGraphTarget>, operations: readonly StreamGraphAction[]): MockGraphTransactionOutcome {
  const workingGraphs = new Map([...targetsByStreamAsset].map(([streamAsset, target]) => [streamAsset, structuredClone(target.graph)]));
  const nodeNamesByLabel = new Map<string, string>();
  const applied: Omit<ProjectGraphTransaction, "mode" | "transaction" | "commit"> = { operations: [], added_nodes: [], connected_links: [], added_groups: [], added_notes: [] };
  const inverseOperations: JsonValue[] = [];
  for (const [operationIndex, operation] of operations.entries()) {
    const target = targetsByStreamAsset.get(operation.stream);
    const graph = workingGraphs.get(operation.stream);
    if (target === undefined || graph === undefined) {
      return { kind: "refused", refusal: { action: "transact", refused_operation_index: operationIndex, refused_node: null, refused_link: null, refused_field: null, runtime_words: `no loaded stream is the stream asset ${operation.stream}` } };
    }
    const nodeNamed = (node: string) => {
      const name = nodeNamesByLabel.get(node) ?? graph.nodes.find((graphNode) => mockNodeIdOf(target.stream_id, graphNode.name) === node)?.name;
      const graphNode = graph.nodes.find((candidate) => candidate.name === name);
      if (graphNode === undefined) throw refusedNaming(`no node ${node} in the stream's graph`, { refused_node: node });
      return graphNode;
    };
    const linkEndNamed = (end: StreamGraphActionLinkEnd) => ({ node: nodeNamed(end.node), port: end.port });
    try {
      switch (operation.operation) {
        case "set_node_config": {
          const node = nodeNamed(operation.node);
          inverseOperations.unshift({ ...operation, config: structuredClone(node.config) });
          node.config = structuredClone(operation.config);
          applied.operations.push({ operation: "set_node_config", node: operation.node, to: operation.config, stream: target.stream_id });
          break;
        }
        case "set_pin_value": {
          const node = nodeNamed(operation.node);
          if (!node.input_ports.some((port) => port.name === operation.input)) {
            throw refusedNaming(`Processor '${node.name}' has no input port named '${operation.input}'`, { refused_node: operation.node, refused_field: operation.input });
          }
          const pins = node.pins ?? {};
          inverseOperations.unshift({ ...operation, value: pins[operation.input] ?? null });
          node.pins = { ...pins, [operation.input]: operation.value ?? null };
          if (operation.value === undefined || operation.value === null) delete node.pins[operation.input];
          applied.operations.push({ operation: "set_pin_value", node: operation.node, input: operation.input, to: operation.value ?? null, stream: target.stream_id });
          break;
        }
        case "rename_node": {
          const node = nodeNamed(operation.node);
          const name = operation.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
          if (graph.nodes.some((other) => other !== node && other.name === name)) {
            throw refusedNaming(`the node name \`${operation.name}\` casts to \`${name}\`, which node \`${name}\` in this graph already has`, { refused_node: operation.node });
          }
          inverseOperations.unshift({ ...operation, name: node.name });
          for (const link of graph.links) {
            if (link.source_node === node.name) link.source_node = name;
            if (link.target_node === node.name) link.target_node = name;
          }
          node.name = name;
          applied.operations.push({ operation: "rename_node", node: operation.node, to: name, stream: target.stream_id });
          break;
        }
        case "add_node": {
          const catalogEntry = MOCK_NODE_CATALOG_ENTRIES.find((entry) => entry.type === operation.type);
          if (catalogEntry === undefined) throw refusedNaming(`unknown node type \`${operation.type}\``, { refused_node: operation.as ?? operation.name ?? null });
          const shortName = operation.name ?? shortNameOfTheType(operation.type);
          const takenNames = new Set(graph.nodes.map((node) => node.name));
          let name = shortName;
          for (let suffix = 2; operation.name === undefined && takenNames.has(name); suffix += 1) name = `${shortName}-${suffix}`;
          if (takenNames.has(name)) throw refusedNaming(`node \`${name}\` in this graph already has that name`, { refused_node: operation.as ?? name });
          const portsOf = (ports: typeof catalogEntry.inputs) => ports.map((port) => ({ name: port.name, family: port.family, stream_facts: null, values_checked: port.family === "records" ? false : null }));
          graph.nodes.push({ name, type: operation.type, state: "Running", config: structuredClone(operation.config ?? {}), pins: structuredClone(operation.pins ?? {}), input_ports: portsOf(catalogEntry.inputs), output_ports: portsOf(catalogEntry.outputs) });
          if (operation.as !== undefined) nodeNamesByLabel.set(operation.as, name);
          const nodeId = mockNodeIdOf(target.stream_id, name);
          inverseOperations.unshift({ operation: "remove_node", stream: operation.stream, node: nodeId });
          applied.added_nodes.push({ stream: target.stream_id, node: nodeId, name, as: operation.as ?? null });
          applied.operations.push({ operation: "add_node", node: { id: nodeId, name, type: operation.type, config: operation.config ?? {} }, stream: target.stream_id });
          break;
        }
        case "remove_node": {
          const node = nodeNamed(operation.node);
          graph.nodes.splice(graph.nodes.indexOf(node), 1);
          graph.links = graph.links.filter((link) => link.source_node !== node.name && link.target_node !== node.name);
          inverseOperations.unshift({ operation: "add_node", stream: operation.stream, type: node.type, name: node.name, config: node.config });
          applied.operations.push({ operation: "remove_node", node: operation.node, stream: target.stream_id });
          break;
        }
        case "connect": {
          const source = linkEndNamed(operation.source);
          const targetEnd = linkEndNamed(operation.target);
          const sourcePort = source.node.output_ports.find((port) => port.name === source.port);
          const targetPort = targetEnd.node.input_ports.find((port) => port.name === targetEnd.port);
          const refusedLink = { source: operation.source, target: operation.target };
          if (sourcePort === undefined || targetPort === undefined) throw refusedNaming(`Invalid link: no port ${source.node.name}.${source.port} to ${targetEnd.node.name}.${targetEnd.port}`, { refused_link: refusedLink });
          if (sourcePort.family !== targetPort.family) {
            throw refusedNaming(`Invalid link: cannot link ${source.node.name}.${source.port} (${sourcePort.family}) to ${targetEnd.node.name}.${targetEnd.port} (${targetPort.family}): a link joins two ports of one family`, { refused_link: refusedLink });
          }
          if (graph.links.some((link) => link.target_node === targetEnd.node.name && link.target_port === targetEnd.port)) {
            throw refusedNaming(`Invalid link: ${targetEnd.node.name}.${targetEnd.port} is already linked`, { refused_link: refusedLink });
          }
          graph.links.push({ id: `Lmock${graph.links.length}${source.node.name}${targetEnd.node.name}`.slice(0, 26), source_node: source.node.name, source_port: source.port, target_node: targetEnd.node.name, target_port: targetEnd.port, state: "wired" });
          inverseOperations.unshift({ ...operation, operation: "disconnect" });
          applied.connected_links.push({ stream: target.stream_id, source: operation.source, target: operation.target, state: "wired", error_reason: null });
          applied.operations.push({ operation: "connect", link: { source: operation.source, target: operation.target }, stream: target.stream_id });
          break;
        }
        case "disconnect": {
          const source = linkEndNamed(operation.source);
          const targetEnd = linkEndNamed(operation.target);
          const linkCount = graph.links.length;
          graph.links = graph.links.filter(
            (link) => !(link.source_node === source.node.name && link.source_port === source.port && link.target_node === targetEnd.node.name && link.target_port === targetEnd.port),
          );
          if (graph.links.length === linkCount) throw refusedNaming("no such link in the stream's graph", { refused_link: { source: operation.source, target: operation.target } });
          inverseOperations.unshift({ ...operation, operation: "connect" });
          applied.operations.push({ operation: "disconnect", link: { source: operation.source, target: operation.target }, stream: target.stream_id });
          break;
        }
        default:
          throw refusedNaming(`the mock runtime does not apply \`${operation.operation}\``);
      }
    } catch (refused) {
      if (!(refused instanceof MockGraphActionRefused)) throw refused;
      return { kind: "refused", refusal: { action: "transact", refused_operation_index: operationIndex, ...refused.refusal } };
    }
  }
  for (const [streamAsset, workingGraph] of workingGraphs) {
    const target = targetsByStreamAsset.get(streamAsset);
    if (target !== undefined) Object.assign(target.graph, workingGraph);
  }
  return { kind: "applied", transaction: applied, inverse_operations: inverseOperations };
}
