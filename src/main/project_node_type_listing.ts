// A project's node types as the runtime's `list_project_node_types` tool lists them, read from
// source without running it: one entry under `sources` per origin, its `source` key flat beside
// `node_types`, `graph_generators` and `unreadable_modules`. Every other key is ignored.

import type {
  ProjectGraphGenerator,
  ProjectGraphGeneratorPromotedSetting,
  ProjectNodeModuleNotReadable,
  ProjectNodeType,
  ProjectNodeTypeListing,
  ProjectNodeTypePort,
  ProjectNodeTypeSource,
  ProjectNodeTypeSourceOrigin,
} from "../shared/tatolab_backend_contract.js";
import {
  everyOneRead,
  jsonObject,
  type JsonObjectOnTheWire,
  optionalText,
  optionalUnsignedInteger,
  parseJsonOnTheWire,
  requiredArray,
  requiredText,
  requiredUnsignedInteger,
  textOrDefault,
} from "./json_on_the_wire.js";
import { portFamilyOnTheWire } from "./port_family_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The listing `list_project_node_types` answered with `toolResultText`, or why it could not be read. */
export function projectNodeTypeListingFromTheToolResult(toolResultText: string): Result<ProjectNodeTypeListing, string> {
  const listing = listingFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return listing.ok ? listing : failedWith(`the runtime's list_project_node_types result could not be read: ${listing.failure}`);
}

function listingFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ProjectNodeTypeListing, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the listing");
  if (!toolResult.ok) return toolResult;
  const projectDirectory = requiredText(toolResult.value, "project_directory");
  if (!projectDirectory.ok) return projectDirectory;
  const project = requiredText(toolResult.value, "project");
  if (!project.ok) return project;
  const projectName = requiredText(toolResult.value, "project_name");
  if (!projectName.ok) return projectName;
  const sourcesOnTheWire = requiredArray(toolResult.value, "sources");
  if (!sourcesOnTheWire.ok) return sourcesOnTheWire;
  const sources = everyOneRead(sourcesOnTheWire.value, sourceOnTheWire);
  if (!sources.ok) return sources;
  return succeeded({ project_directory: projectDirectory.value, project: project.value, project_name: projectName.value, sources: sources.value });
}

function sourceOnTheWire(sourceValue: unknown): Result<ProjectNodeTypeSource, string> {
  const source = jsonObject(sourceValue, "a source");
  if (!source.ok) return source;
  const origin = originOnTheWire(source.value);
  if (!origin.ok) return origin;
  const nodeTypes = everyOneUnder(source.value, "node_types", nodeTypeOnTheWire);
  if (!nodeTypes.ok) return nodeTypes;
  const graphGenerators = everyOneUnder(source.value, "graph_generators", graphGeneratorOnTheWire);
  if (!graphGenerators.ok) return graphGenerators;
  const unreadableModules = everyOneUnder(source.value, "unreadable_modules", unreadableModuleOnTheWire);
  if (!unreadableModules.ok) return unreadableModules;
  return succeeded({ origin: origin.value, node_types: nodeTypes.value, graph_generators: graphGenerators.value, unreadable_modules: unreadableModules.value });
}

function everyOneUnder<ReadValue>(jsonObjectOnTheWire: JsonObjectOnTheWire, key: string, readOne: (value: unknown) => Result<ReadValue, string>): Result<ReadValue[], string> {
  const values = requiredArray(jsonObjectOnTheWire, key);
  return values.ok ? everyOneRead(values.value, readOne) : values;
}

function originOnTheWire(source: JsonObjectOnTheWire): Result<ProjectNodeTypeSourceOrigin, string> {
  const sourceName = requiredText(source, "source");
  if (!sourceName.ok) return sourceName;
  switch (sourceName.value) {
    case "project":
      return succeeded({ source: "project" });
    case "dependency": {
      const project = requiredText(source, "project");
      if (!project.ok) return project;
      const revision = requiredText(source, "revision");
      if (!revision.ok) return revision;
      return succeeded({ source: "dependency", project: project.value, revision: revision.value });
    }
    case "installed_distribution": {
      const distribution = requiredText(source, "distribution");
      if (!distribution.ok) return distribution;
      const distributionVersion = requiredText(source, "distribution_version");
      if (!distributionVersion.ok) return distributionVersion;
      return succeeded({ source: "installed_distribution", distribution: distribution.value, distribution_version: distributionVersion.value });
    }
    default:
      return succeeded({ source: "newer_than_this_app", source_name: sourceName.value });
  }
}

function nodeTypeOnTheWire(nodeTypeValue: unknown): Result<ProjectNodeType, string> {
  const nodeType = jsonObject(nodeTypeValue, "a node type");
  if (!nodeType.ok) return nodeType;
  const typeName = requiredText(nodeType.value, "type");
  if (!typeName.ok) return typeName;
  const kind = optionalText(nodeType.value, "kind");
  if (!kind.ok) return kind;
  const description = textOrDefault(nodeType.value, "description", "");
  if (!description.ok) return description;
  const category = requiredText(nodeType.value, "category");
  if (!category.ok) return category;
  const inputs = portsOrNullUnder(nodeType.value, "inputs");
  if (!inputs.ok) return inputs;
  const outputs = portsOrNullUnder(nodeType.value, "outputs");
  if (!outputs.ok) return outputs;
  const path = optionalText(nodeType.value, "path");
  if (!path.ok) return path;
  const line = optionalUnsignedInteger(nodeType.value, "line");
  if (!line.ok) return line;
  return succeeded({
    type: typeName.value,
    kind: kind.value,
    description: description.value,
    category: category.value,
    inputs: inputs.value,
    outputs: outputs.value,
    path: path.value,
    line: line.value,
  });
}

/** The ports under `direction`, or `null` where the runtime lists none because only the node's native half states them. */
function portsOrNullUnder(nodeType: JsonObjectOnTheWire, direction: "inputs" | "outputs"): Result<ProjectNodeTypePort[] | null, string> {
  const portsOnTheWire = nodeType[direction];
  if (portsOnTheWire === undefined || portsOnTheWire === null) return succeeded(null);
  if (!Array.isArray(portsOnTheWire)) return failedWith(`\`${direction}\` is not an array`);
  return everyOneRead(portsOnTheWire, (portValue) => {
    const port = jsonObject(portValue, "a port");
    if (!port.ok) return port;
    const name = requiredText(port.value, "name");
    if (!name.ok) return name;
    const description = textOrDefault(port.value, "description", "");
    if (!description.ok) return description;
    const annotation = optionalText(port.value, "annotation");
    if (!annotation.ok) return annotation;
    return succeeded({ name: name.value, description: description.value, family: portFamilyOnTheWire(port.value), annotation: annotation.value });
  });
}

function graphGeneratorOnTheWire(graphGeneratorValue: unknown): Result<ProjectGraphGenerator, string> {
  const graphGenerator = jsonObject(graphGeneratorValue, "a graph generator");
  if (!graphGenerator.ok) return graphGenerator;
  const generator = requiredText(graphGenerator.value, "generator");
  if (!generator.ok) return generator;
  const description = textOrDefault(graphGenerator.value, "description", "");
  if (!description.ok) return description;
  const promotedConfig = everyOneUnder(graphGenerator.value, "promoted_config", promotedSettingOnTheWire);
  if (!promotedConfig.ok) return promotedConfig;
  const path = requiredText(graphGenerator.value, "path");
  if (!path.ok) return path;
  const line = requiredUnsignedInteger(graphGenerator.value, "line");
  if (!line.ok) return line;
  return succeeded({ generator: generator.value, description: description.value, promoted_config: promotedConfig.value, path: path.value, line: line.value });
}

function promotedSettingOnTheWire(settingValue: unknown): Result<ProjectGraphGeneratorPromotedSetting, string> {
  const setting = jsonObject(settingValue, "a promoted setting");
  if (!setting.ok) return setting;
  const name = requiredText(setting.value, "name");
  if (!name.ok) return name;
  const annotation = optionalText(setting.value, "annotation");
  if (!annotation.ok) return annotation;
  return succeeded({ name: name.value, annotation: annotation.value });
}

function unreadableModuleOnTheWire(moduleValue: unknown): Result<ProjectNodeModuleNotReadable, string> {
  const unreadableModule = jsonObject(moduleValue, "an unreadable module");
  if (!unreadableModule.ok) return unreadableModule;
  const moduleName = requiredText(unreadableModule.value, "module");
  if (!moduleName.ok) return moduleName;
  const path = requiredText(unreadableModule.value, "path");
  if (!path.ok) return path;
  const line = optionalUnsignedInteger(unreadableModule.value, "line");
  if (!line.ok) return line;
  const column = optionalUnsignedInteger(unreadableModule.value, "column");
  if (!column.ok) return column;
  const why = requiredText(unreadableModule.value, "why");
  if (!why.ok) return why;
  return succeeded({ module: moduleName.value, path: path.value, line: line.value, column: column.value, why: why.value });
}
