// A node's names as the studio writes them: its type in words, as Blender titles a node by its type, and its
// own name where its stream's code gave it one. The runtime names a node its code left unnamed by its class's
// short name cast to lowercase URL-safe characters (`TestPatternSource` → `testpatternsource`), and a second
// one of that class `testpatternsource-2`.

/** Short words written in capitals wherever a name holds them. */
const WORDS_WRITTEN_IN_CAPITALS = new Set(["id", "fps", "url", "uri", "gpu", "cpu", "rgb", "rgba", "hdr", "ip", "ui", "mp4", "midi", "osc", "ndi"]);

/** The class a node type names, the part after its module: `TestPatternSource` of `tatolab.stream:TestPatternSource`. */
export function nodeTypeClassName(nodeType: string): string {
  return nodeType.slice(Math.max(nodeType.lastIndexOf(":"), nodeType.lastIndexOf(".")) + 1);
}

/** A class name or a snake-case key in words, each capitalised: `TestPatternSource` → `Test Pattern Source`, `device_id` → `Device ID`. */
export function nameInWords(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter((word) => word !== "");
  return words.map((word) => (WORDS_WRITTEN_IN_CAPITALS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
}

/** The runtime's cast of a name into the name a node takes: lowercase, every other character a `-`. */
export function castAsTheRuntimeNamesAnUnnamedNode(className: string): string {
  return className
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\-._~]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The ordinal the runtime gave `nodeName` as one of its type's unnamed nodes, 1 for the first; `null` when its code named it. */
function ordinalAsAnUnnamedNode(nodeName: string, nodeType: string): number | null {
  const defaultName = castAsTheRuntimeNamesAnUnnamedNode(nodeTypeClassName(nodeType));
  if (nodeName === defaultName) return 1;
  const [, namePrefix, ordinalDigits] = /^(.*)-(\d+)$/.exec(nodeName) ?? [];
  if (namePrefix === undefined || ordinalDigits === undefined || !defaultName.startsWith(namePrefix)) return null;
  return Number(ordinalDigits);
}

/** Whether the stream's code gave the node `nodeName` of `nodeType` a name of its own. */
export function isANameTheCodeGave(nodeName: string, nodeType: string): boolean {
  return ordinalAsAnUnnamedNode(nodeName, nodeType) === null;
}

/** What a node's card is titled: its own name where the code gave one, else its type in words, numbered past the first. */
export function nodeTitle(nodeName: string, nodeType: string): string {
  const ordinal = ordinalAsAnUnnamedNode(nodeName, nodeType);
  if (ordinal === null) return nodeName;
  const typeInWords = nameInWords(nodeTypeClassName(nodeType));
  return ordinal === 1 ? typeInWords : `${typeInWords} ${ordinal}`;
}

/** What Properties says for several nodes selected together: how many, and each one's title where `graphNodes` holds it, else its name. */
export function wordsForTheSeveralSelectedNodes(nodeNames: readonly string[], graphNodes: readonly { name: string; type: string }[]): { title: string; explanation: string } {
  const nodeTitles = nodeNames.map((nodeName) => {
    const graphNode = graphNodes.find((candidate) => candidate.name === nodeName);
    return graphNode === undefined ? nodeName : nodeTitle(graphNode.name, graphNode.type);
  });
  return { title: `${nodeNames.length} nodes selected`, explanation: `${nodeTitles.join(", ")}. Select one node to edit its config.` };
}
