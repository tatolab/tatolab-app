// The node catalog as the window reads it, from `GET /api/registry?stream=<stream>`: each node type
// the stream can add under the `type` a graph node carries, with its description, the category it is
// filed under (`category`, absent for a type that declares none), its config's JSON Schema
// (`config_schema`, absent for a type described without one) and its ports by name and description.
// Every other key the runtime renders is ignored.

import type { JsonValue, NodeCatalog, NodeCatalogEntry, NodeCatalogPort } from "../shared/tatolab_backend_contract.js";
import { arrayOrEmpty, everyOneRead, isAJsonValue, jsonObject, type JsonObjectOnTheWire, optionalText, parseJsonOnTheWire, requiredArray, requiredText, textOrDefault } from "./json_on_the_wire.js";
import { portFamilyOnTheWire } from "./port_family_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The request target of the node catalog of the loaded stream `stream`. */
export function nodeCatalogRequestTarget(stream: string): string {
  return `/api/registry?stream=${encodeURIComponent(stream)}`;
}

/** The node catalog of `stream` that `GET /api/registry?stream=` answered with `registryAnswerText`. */
export function nodeCatalogFromTheRegistryAnswer(stream: string, registryAnswerText: string): Result<NodeCatalog, string> {
  const nodeTypes = nodeTypesFromTheParsedRegistryAnswer(parseJsonOnTheWire(registryAnswerText));
  if (!nodeTypes.ok) return failedWith(`the runtime's node catalog of \`${stream}\` could not be read: ${nodeTypes.failure}`);
  return succeeded({ stream, node_types: nodeTypes.value });
}

function nodeTypesFromTheParsedRegistryAnswer(parsedAnswer: Result<unknown, string>): Result<NodeCatalogEntry[], string> {
  if (!parsedAnswer.ok) return parsedAnswer;
  const registryAnswer = jsonObject(parsedAnswer.value, "the node catalog");
  if (!registryAnswer.ok) return registryAnswer;
  const nodeTypesOnTheWire = requiredArray(registryAnswer.value, "nodes");
  if (!nodeTypesOnTheWire.ok) return nodeTypesOnTheWire;
  return everyOneRead(nodeTypesOnTheWire.value, nodeCatalogEntryOnTheWire);
}

function nodeCatalogEntryOnTheWire(nodeTypeOnTheWire: unknown): Result<NodeCatalogEntry, string> {
  const nodeType = jsonObject(nodeTypeOnTheWire, "a node type");
  if (!nodeType.ok) return nodeType;
  const typeName = requiredText(nodeType.value, "type");
  if (!typeName.ok) return typeName;
  const description = textOrDefault(nodeType.value, "description", "");
  if (!description.ok) return description;
  const category = optionalText(nodeType.value, "category");
  if (!category.ok) return category;
  const configSchema = nodeType.value["config_schema"];
  const inputs = catalogPortsUnder(nodeType.value, "inputs");
  if (!inputs.ok) return inputs;
  const outputs = catalogPortsUnder(nodeType.value, "outputs");
  if (!outputs.ok) return outputs;
  return succeeded({
    type: typeName.value,
    description: description.value,
    category: category.value,
    config_schema: configSchemaOnTheWire(configSchema),
    inputs: inputs.value,
    outputs: outputs.value,
  });
}

/** A config schema is a JSON object or `true`/`false` in 2020-12; anything else, or none, reads as a type described without one. */
function configSchemaOnTheWire(configSchema: unknown): JsonValue | null {
  if (configSchema === undefined || configSchema === null || !isAJsonValue(configSchema)) return null;
  return typeof configSchema === "boolean" || (typeof configSchema === "object" && !Array.isArray(configSchema)) ? configSchema : null;
}

function catalogPortsUnder(nodeType: JsonObjectOnTheWire, direction: "inputs" | "outputs"): Result<NodeCatalogPort[], string> {
  const portsOnTheWire = arrayOrEmpty(nodeType, direction);
  if (!portsOnTheWire.ok) return portsOnTheWire;
  return everyOneRead(portsOnTheWire.value, (portOnTheWire) => {
    const port = jsonObject(portOnTheWire, "a port");
    if (!port.ok) return port;
    const name = requiredText(port.value, "name");
    if (!name.ok) return name;
    const description = textOrDefault(port.value, "description", "");
    if (!description.ok) return description;
    return succeeded({ name: name.value, description: description.value, family: portFamilyOnTheWire(port.value) });
  });
}
