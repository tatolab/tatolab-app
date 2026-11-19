// The browser mock's `list_node_types` and `describe_node_types`: the runtime's answers for streamlib's
// sample that declares each kind of pin, replayed for the mock's pattern project, whose stream `main`
// is that sample's graph. With `?port_families=unserved` no described port names a family, as a
// runtime from before strict-port-families serves none.

import { MOCK_RECORDED_NODE_TYPES_DESCRIBED, MOCK_RECORDED_NODE_TYPES_LISTED } from "./mock_recordings";
import type { DescribeNodeTypesToolResult, ListNodeTypesToolResult, NodeTypeDescribedOrWhyNot, NodeTypeDescription } from "../src/shared/tatolab_backend_contract";

/** One node type as `list_node_types` lists it under a source. */
type NodeTypeListedUnderASource = ListNodeTypesToolResult["sources"][number]["node_types"][number];

/** A node type declared by a node file made from the runtime's node template, listed and described as the runtime does once the file is in the project. */
export interface MockNodeTypeFromTheTemplate {
  listed: NodeTypeListedUnderASource;
  described: NodeTypeDescription;
}

/** `nodeType`, declared at `pathInTheProject` by a file made from the runtime's node template: a process that reads Image frames on `video_in` and hands each on on `video_out`. */
export function mockNodeTypeFromTheTemplate(nodeType: string, pathInTheProject: string): MockNodeTypeFromTheTemplate {
  const documentation = "Hands on each frame it reads, unchanged.";
  return {
    listed: { node_type: nodeType, documentation, category: null, kind: "process", described_from: "interpreter" },
    described: {
      node_type: nodeType,
      source: "project",
      described_from: "interpreter",
      documentation,
      category: null,
      kind: "process",
      declared_at: { path: pathInTheProject, line: 5 },
      inputs: [{ name: "video_in", documentation: "The frames this node reads.", pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream", mode: "wire_only", lifetime: "kept" }],
      outputs: [{ name: "video_out", documentation: "Each frame read from `video_in`, unchanged.", pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" }],
    },
  };
}

/**
 * The node types the node files made from the runtime's node template declare, each taken as the project's own as the
 * runtime takes it once it reads the file: listed, described, and placed by `graphEditGrounds`.
 */
export class MockNodeTypesMadeFromTheTemplate {
  private readonly nodeTypesMade: MockNodeTypeFromTheTemplate[] = [];
  private readonly changedListeners = new Set<() => void>();

  constructor(private readonly graphEditGrounds: { nodeTypesDescribed: readonly NodeTypeDescription[] }) {}

  get made(): readonly MockNodeTypeFromTheTemplate[] {
    return this.nodeTypesMade;
  }

  /** Take `nodeType`, which a new node file at `pathInTheProject` declares, and tell each listener the project's node types changed. */
  take(nodeType: string, pathInTheProject: string): void {
    const madeFromTheTemplate = mockNodeTypeFromTheTemplate(nodeType, pathInTheProject);
    this.nodeTypesMade.push(madeFromTheTemplate);
    this.graphEditGrounds.nodeTypesDescribed = [...this.graphEditGrounds.nodeTypesDescribed, madeFromTheTemplate.described];
    for (const listener of this.changedListeners) listener();
  }

  onChanged(listener: () => void): () => void {
    this.changedListeners.add(listener);
    return () => this.changedListeners.delete(listener);
  }
}

/** The project folder the recordings answer for, under `streamsFolder`: the mock's pattern project. */
function projectFolderTheRecordingsAnswerFor(streamsFolder: string): string {
  return `${streamsFolder}/pattern`;
}

/** The node types the project in `projectDirectory` lists, as the runtime's `list_node_types` listed them; `null` for a folder holding no project. */
export function mockNodeTypesListed(projectDirectory: string, streamsFolder: string, madeFromTheTemplate: readonly MockNodeTypeFromTheTemplate[]): ListNodeTypesToolResult | null {
  if (projectDirectory !== projectFolderTheRecordingsAnswerFor(streamsFolder)) return null;
  const recorded = structuredClone(MOCK_RECORDED_NODE_TYPES_LISTED);
  const sources = recorded.sources.map((source) => (source.source === "project" ? { ...source, node_types: [...source.node_types, ...madeFromTheTemplate.map(({ listed }) => structuredClone(listed))] } : source));
  return { ...recorded, sources, project_directory: projectDirectory };
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
export function mockNodeTypesDescribed(
  projectDirectory: string,
  streamsFolder: string,
  nodeTypes: readonly string[],
  arePortFamiliesServed: boolean,
  madeFromTheTemplate: readonly MockNodeTypeFromTheTemplate[],
): DescribeNodeTypesToolResult | null {
  if (projectDirectory !== projectFolderTheRecordingsAnswerFor(streamsFolder)) return null;
  const recordedByType = new Map<string, NodeTypeDescribedOrWhyNot>([
    ...MOCK_RECORDED_NODE_TYPES_DESCRIBED.node_types.map((nodeType) => [nodeType.node_type, nodeType] as const),
    ...madeFromTheTemplate.map(({ described }) => [described.node_type, described] as const),
  ]);
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
