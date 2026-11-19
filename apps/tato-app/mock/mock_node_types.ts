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

/** One node a module added from the Marketplace brings, as its catalog entry names it: its `<module>:<class>` and one line on what it does. */
export interface MockNodeOfAModuleAdded {
  import_path: string;
  summary: string;
}

/** The node types a module added from the Marketplace brings, as the runtime lists its installed distribution once its wheel is in the project's environment. */
interface MockModuleAdded {
  source: Extract<ListNodeTypesToolResult["sources"][number], { source: "installed_distribution" }>;
  described: NodeTypeDescription[];
}

/** `node`, brought by the distribution `distribution` at `version`: a source handing one Image frame on at a time on `video`. */
function mockDescriptionOfTheNodeAdded(node: MockNodeOfAModuleAdded, distribution: string, version: string): NodeTypeDescription {
  return {
    node_type: node.import_path,
    source: "installed_distribution",
    distribution,
    distribution_version: version,
    described_from: "interpreter",
    documentation: node.summary,
    category: null,
    kind: "process",
    inputs: [],
    outputs: [{ name: "video", documentation: "The frames it hands on.", pin_type: { kind: "is", pin_type: { type: "texture" } }, flow: "stream" }],
  };
}

/**
 * The node types the project gains while the mock runs, each taken as the runtime takes it once it reads them: those the node
 * files made from the runtime's node template declare, as the project's own, and those each module added from the Marketplace
 * brings, as its installed distribution; listed, described, and placed by `graphEditGrounds`.
 */
export class MockNodeTypesTheProjectGains {
  private readonly nodeTypesMade: MockNodeTypeFromTheTemplate[] = [];
  private readonly modulesAdded: MockModuleAdded[] = [];
  private readonly groupsTheProjectFiles = new Map<string, string>();
  private readonly changedListeners = new Set<() => void>();

  constructor(private readonly graphEditGrounds: { nodeTypesDescribed: readonly NodeTypeDescription[] }) {}

  get made(): readonly MockNodeTypeFromTheTemplate[] {
    return this.nodeTypesMade;
  }

  /** The sources the modules added bring, in the order they were added. */
  get sourcesOfTheModulesAdded(): ListNodeTypesToolResult["sources"] {
    return this.modulesAdded.map(({ source }) => source);
  }

  /** Every node type the project gained, described. */
  get described(): readonly NodeTypeDescription[] {
    return [...this.nodeTypesMade.map(({ described }) => described), ...this.modulesAdded.flatMap(({ described }) => described)];
  }

  /** Take `nodeType`, which a new node file at `pathInTheProject` declares, and tell each listener the project's node types changed. */
  take(nodeType: string, pathInTheProject: string): void {
    const madeFromTheTemplate = mockNodeTypeFromTheTemplate(nodeType, pathInTheProject);
    this.nodeTypesMade.push(madeFromTheTemplate);
    this.gain([madeFromTheTemplate.described]);
  }

  /** Take each of `nodes`, which the distribution `distribution` at `version` brings once its module is added, and tell each listener the project's node types changed. */
  takeTheModule(distribution: string, version: string, nodes: readonly MockNodeOfAModuleAdded[]): void {
    const described = nodes.map((node) => mockDescriptionOfTheNodeAdded(node, distribution, version));
    this.modulesAdded.push({
      source: {
        source: "installed_distribution",
        distribution,
        distribution_version: version,
        node_types: described.map(({ node_type, documentation, category, kind }) => ({ node_type, documentation, category, kind, described_from: "interpreter" })),
        graph_generators: [],
        unreadable_modules: [],
      },
      described,
    });
    this.gain(described);
  }

  /** The group the project files `nodeType` under, as `set_node_type_group` filed it; `undefined` while nothing of the project's own files it. */
  groupTheProjectFiles(nodeType: string): string | undefined {
    return this.groupsTheProjectFiles.get(nodeType);
  }

  /** File `nodeType` under `group`, or with `null` take the project's own filing away, and tell each listener the project's node types changed. */
  fileUnderAGroup(nodeType: string, group: string | null): void {
    if (group === null) this.groupsTheProjectFiles.delete(nodeType);
    else this.groupsTheProjectFiles.set(nodeType, group);
    this.tellEachListener();
  }

  private gain(described: readonly NodeTypeDescription[]): void {
    this.graphEditGrounds.nodeTypesDescribed = [...this.graphEditGrounds.nodeTypesDescribed, ...described];
    this.tellEachListener();
  }

  private tellEachListener(): void {
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

/** `listed`, under the group the project files it in when it files it, served with `category_from` as the runtime serves it. */
function filedAsTheProjectFilesIt(listed: NodeTypeListedUnderASource, gained: MockNodeTypesTheProjectGains): NodeTypeListedUnderASource {
  const group = gained.groupTheProjectFiles(listed.node_type);
  return group === undefined ? listed : { ...listed, category: group, category_from: "project" };
}

/** The node types the project in `projectDirectory` lists, as the runtime's `list_node_types` listed them; `null` for a folder holding no project. */
export function mockNodeTypesListed(projectDirectory: string, streamsFolder: string, gained: MockNodeTypesTheProjectGains): ListNodeTypesToolResult | null {
  if (projectDirectory !== projectFolderTheRecordingsAnswerFor(streamsFolder)) return null;
  const recorded = structuredClone(MOCK_RECORDED_NODE_TYPES_LISTED);
  const sources = recorded.sources
    .map((source) => (source.source === "project" ? { ...source, node_types: [...source.node_types, ...gained.made.map(({ listed }) => structuredClone(listed))] } : source))
    .map((source) => ({ ...source, node_types: source.node_types.map((listed) => filedAsTheProjectFilesIt(listed, gained)) }));
  const builtInSourceIndex = sources.findIndex((source) => source.source === "built_in");
  const sourcesBeforeTheBuiltIns = builtInSourceIndex === -1 ? sources : sources.slice(0, builtInSourceIndex);
  const builtInSources = builtInSourceIndex === -1 ? [] : sources.slice(builtInSourceIndex);
  return { ...recorded, sources: [...sourcesBeforeTheBuiltIns, ...structuredClone(gained.sourcesOfTheModulesAdded), ...builtInSources], project_directory: projectDirectory };
}

/**
 * `nodeType` filed under `group` in the project in `projectDirectory`, or with `null` put back, as the runtime's `set_node_type_group`
 * files it; the words it refuses in for a node type the project does not list or a group with a blank name in it, else `null`.
 */
export function mockSetTheNodeTypeGroup(projectDirectory: string, streamsFolder: string, gained: MockNodeTypesTheProjectGains, nodeType: string, group: string | null): string | null {
  const listed = mockNodeTypesListed(projectDirectory, streamsFolder, gained);
  if (listed === null) return `set_node_type_group failed: ${projectDirectory} holds no project: it has no tatolab-project.json`;
  if (group !== null && group.split("/").some((name) => name.trim() === "")) {
    return `set_node_type_group failed: ${JSON.stringify(group)} cannot file \`${nodeType}\`: a group is one or more names split by \`/\`, none of them blank, as \`Effects/Stylize\``;
  }
  const isListed = listed.sources.some((source) => source.node_types.some((listedType) => listedType.node_type === nodeType));
  if (group !== null && !isListed) {
    return `set_node_type_group failed: neither the project \`${MOCK_RECORDED_NODE_TYPES_LISTED.project_name}\` nor the runtime offers a node type \`${nodeType}\`; \`list_node_types\` lists the ones they do`;
  }
  gained.fileUnderAGroup(nodeType, group);
  return null;
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
  gained: MockNodeTypesTheProjectGains,
): DescribeNodeTypesToolResult | null {
  if (projectDirectory !== projectFolderTheRecordingsAnswerFor(streamsFolder)) return null;
  const recordedByType = new Map<string, NodeTypeDescribedOrWhyNot>([
    ...MOCK_RECORDED_NODE_TYPES_DESCRIBED.node_types.map((nodeType) => [nodeType.node_type, nodeType] as const),
    ...gained.described.map((described) => [described.node_type, described] as const),
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
