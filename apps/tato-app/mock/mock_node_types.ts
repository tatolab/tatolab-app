// The browser mock's `list_node_types` and `describe_node_types`: the runtime's answers for streamlib's
// sample that declares each kind of pin, replayed for the mock's pattern project, whose stream `main`
// is that sample's graph. With `?port_families=unserved` no described port names a family, as a
// runtime from before strict-port-families serves none.

import { MOCK_RECORDED_NODE_TYPES_DESCRIBED, MOCK_RECORDED_NODE_TYPES_LISTED } from "./mock_recordings";
import type { DescribeNodeTypesToolResult, ListNodeTypesToolResult, NodeTypeDescribedOrWhyNot } from "../src/shared/tatolab_backend_contract";

/** The project folder the recordings answer for, under `streamsFolder`: the mock's pattern project. */
function projectFolderTheRecordingsAnswerFor(streamsFolder: string): string {
  return `${streamsFolder}/pattern`;
}

/** The node types the project in `projectDirectory` lists, as the runtime's `list_node_types` listed them; `null` for a folder holding no project. */
export function mockNodeTypesListed(projectDirectory: string, streamsFolder: string): ListNodeTypesToolResult | null {
  if (projectDirectory !== projectFolderTheRecordingsAnswerFor(streamsFolder)) return null;
  return { ...structuredClone(MOCK_RECORDED_NODE_TYPES_LISTED), project_directory: projectDirectory };
}

function withoutPortFamilies(nodeType: NodeTypeDescribedOrWhyNot): NodeTypeDescribedOrWhyNot {
  if ("not_described_because" in nodeType) return nodeType;
  const withoutFamily = <Port extends { family?: unknown }>({ family: _family, ...port }: Port): Omit<Port, "family"> => port;
  return { ...nodeType, inputs: nodeType.inputs.map(withoutFamily), outputs: nodeType.outputs.map(withoutFamily) };
}

/**
 * Each of `nodeTypes` the project in `projectDirectory` lists, as the runtime's `describe_node_types` described it; `null` for a
 * folder holding no project. A node type the recording does not describe is refused in the runtime's words, the whole call with it.
 */
export function mockNodeTypesDescribed(projectDirectory: string, streamsFolder: string, nodeTypes: readonly string[], arePortFamiliesServed: boolean): DescribeNodeTypesToolResult | null {
  if (projectDirectory !== projectFolderTheRecordingsAnswerFor(streamsFolder)) return null;
  const recordedByType = new Map(MOCK_RECORDED_NODE_TYPES_DESCRIBED.node_types.map((nodeType) => [nodeType.node_type, nodeType] as const));
  return {
    node_types: nodeTypes.map((nodeType) => {
      const recorded = recordedByType.get(nodeType);
      if (recorded === undefined) {
        throw `describe_node_types failed: neither the project \`${MOCK_RECORDED_NODE_TYPES_LISTED.project_name}\` nor the runtime offers a node type \`${nodeType}\`; \`list_node_types\` lists the ones they do`;
      }
      return arePortFamiliesServed ? structuredClone(recorded) : withoutPortFamilies(recorded);
    }),
  };
}
