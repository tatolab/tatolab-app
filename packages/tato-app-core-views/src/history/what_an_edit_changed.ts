// What one edit changed, in words, from the operations the runtime recorded for it (`ProjectOperation` in streamlib's
// project repository, tagged by `operation`): a graph operation names its nodes by UUID, an asset operation its asset
// with the path it sits at.

import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The name each node has now, by its UUID. */
export type NodeNamesById = ReadonlyMap<string, string>;

/** What an edit changed: a sentence for its row, with the thing it is about named apart, and each operation in a line. */
export interface WhatAnEditChanged {
  readonly what: { readonly lead: string; readonly subject: string | null; readonly rest: string };
  readonly operation_lines: readonly string[];
}

type OperationFields = Readonly<Record<string, JsonValue>>;

function fieldsOf(value: JsonValue | undefined): OperationFields | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function wordsOfAValue(value: JsonValue | undefined): string {
  if (value === undefined) return "nothing";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function folderOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

function nodeTypeNameOf(nodeType: string): string {
  return nodeType.slice(nodeType.lastIndexOf(":") + 1);
}

function nameOfTheNode(node: JsonValue | undefined, nodeNames: NodeNamesById): string {
  const nodeFields = fieldsOf(node);
  const nodeId = textOf(node) ?? textOf(nodeFields?.["id"]);
  return (nodeId === null ? undefined : nodeNames.get(nodeId)) ?? textOf(nodeFields?.["name"]) ?? "a node";
}

function wordsOfALinkEnd(linkEnd: JsonValue | undefined, nodeNames: NodeNamesById): string {
  const endFields = fieldsOf(linkEnd);
  return `${nameOfTheNode(endFields?.["node"], nodeNames)}.${textOf(endFields?.["port"]) ?? "?"}`;
}

function wordsOfALink(link: JsonValue | undefined, nodeNames: NodeNamesById): string {
  const linkFields = fieldsOf(link);
  return `${wordsOfALinkEnd(linkFields?.["source"], nodeNames)} → ${wordsOfALinkEnd(linkFields?.["target"], nodeNames)}`;
}

/** The config keys whose values differ between `from` and `to`, each with both values. */
function configChangesOf(from: JsonValue | undefined, to: JsonValue | undefined): { key: string; from: JsonValue | undefined; to: JsonValue | undefined }[] {
  const fromFields = fieldsOf(from) ?? {};
  const toFields = fieldsOf(to) ?? {};
  return [...new Set([...Object.keys(fromFields), ...Object.keys(toFields)])]
    .filter((key) => JSON.stringify(fromFields[key]) !== JSON.stringify(toFields[key]))
    .map((key) => ({ key, from: fromFields[key], to: toFields[key] }));
}

function pathOfTheAsset(operation: OperationFields): string {
  return textOf(fieldsOf(operation["asset"])?.["path"]) ?? textOf(operation["path"]) ?? "an asset";
}

type WhatOneOperationChanged = { readonly sentence: WhatAnEditChanged["what"]; readonly line: string };

function whatOneOperationChanged(operation: OperationFields, nodeNames: NodeNamesById): WhatOneOperationChanged {
  const operationName = textOf(operation["operation"]) ?? "an operation";
  const nodeName = () => nameOfTheNode(operation["node"], nodeNames);
  switch (operationName) {
    case "add_node":
    case "remove_node": {
      const node = fieldsOf(operation["node"]);
      const links = Array.isArray(operation["links"]) ? operation["links"] : [];
      const linkWords = links.length === 0 ? "" : links.length === 1 ? "and its link" : `and its ${links.length} links`;
      return {
        sentence: { lead: operationName === "add_node" ? "Added" : "Removed", subject: nodeName(), rest: linkWords },
        line: `${operationName} ${nodeTypeNameOf(textOf(node?.["type"]) ?? "")}`.trimEnd(),
      };
    }
    case "connect":
    case "disconnect": {
      const linkWords = wordsOfALink(operation["link"], nodeNames);
      return { sentence: { lead: operationName === "connect" ? "Linked" : "Unlinked", subject: null, rest: linkWords }, line: `${operationName} ${linkWords}` };
    }
    case "rename_node": {
      const from = wordsOfAValue(operation["from"]);
      const to = wordsOfAValue(operation["to"]);
      return { sentence: { lead: "Renamed", subject: from, rest: `to ${to}` }, line: `rename_node ${from} → ${to}` };
    }
    case "set_node_config": {
      const changes = configChangesOf(operation["from"], operation["to"]);
      const [onlyChange] = changes;
      const changeWords = changes.map((change) => `${change.key} ${wordsOfAValue(change.from)} → ${wordsOfAValue(change.to)}`).join(", ");
      return {
        sentence: changes.length === 1 && onlyChange !== undefined ? { lead: "Set", subject: nodeName(), rest: `${onlyChange.key} to ${wordsOfAValue(onlyChange.to)}` } : { lead: "Changed the config of", subject: nodeName(), rest: "" },
        line: `set_node_config ${changeWords}`.trimEnd(),
      };
    }
    case "set_pin_value": {
      const input = textOf(operation["input"]) ?? "an input";
      return {
        sentence: { lead: "Set", subject: `${nodeName()}.${input}`, rest: `to ${wordsOfAValue(operation["to"])}` },
        line: `set_pin_value ${input} ${wordsOfAValue(operation["from"])} → ${wordsOfAValue(operation["to"])}`,
      };
    }
    case "set_studio_fields":
      return { sentence: { lead: "Arranged", subject: nodeName(), rest: "" }, line: `set_studio_fields ${nodeName()}` };
    case "set_exposed_config_fields":
      return { sentence: { lead: "Changed the fields", subject: nodeName(), rest: "shows" }, line: `set_exposed_config_fields ${nodeName()}` };
    case "refresh_fragment": {
      const fragmentType = textOf(fieldsOf(operation["to"])?.["type"]);
      const fragmentName = nodeNames.get(textOf(operation["node"]) ?? "") ?? (fragmentType === null ? "a fragment" : nodeTypeNameOf(fragmentType));
      return { sentence: { lead: "Refreshed", subject: fragmentName, rest: "from its code" }, line: `refresh_fragment ${fragmentName}` };
    }
    case "add_group": {
      const nodes = Array.isArray(operation["nodes"]) ? operation["nodes"].length : 0;
      return { sentence: { lead: "Grouped", subject: null, rest: `${nodes} ${nodes === 1 ? "node" : "nodes"}` }, line: "add_group" };
    }
    case "set_group_fields":
      return { sentence: { lead: "Changed a group", subject: null, rest: "" }, line: "set_group_fields" };
    case "remove_group":
      return { sentence: { lead: "Ungrouped", subject: null, rest: "a group" }, line: "remove_group" };
    case "import_asset":
    case "delete_asset": {
      const path = pathOfTheAsset(operation);
      return { sentence: { lead: operationName === "import_asset" ? "Imported" : "Deleted", subject: fileNameOf(path), rest: "" }, line: `${operationName} ${path}` };
    }
    case "relocate_asset": {
      const from = wordsOfAValue(operation["from"]);
      const to = wordsOfAValue(operation["to"]);
      const isARename = folderOf(from) === folderOf(to);
      return { sentence: { lead: isARename ? "Renamed" : "Moved", subject: fileNameOf(from), rest: `to ${isARename ? fileNameOf(to) : to}` }, line: `relocate_asset ${from} → ${to}` };
    }
    case "set_asset_settings": {
      const path = pathOfTheAsset(operation);
      return { sentence: { lead: "Changed the import settings of", subject: fileNameOf(path), rest: "" }, line: `set_asset_settings ${path}` };
    }
    case "place_import":
      return { sentence: { lead: "Placed an import", subject: null, rest: "" }, line: "place_import" };
    case "remove_import":
      return { sentence: { lead: "Removed an import", subject: null, rest: "" }, line: "remove_import" };
    case "replace_asset_content": {
      const path = pathOfTheAsset(operation);
      return { sentence: { lead: "Replaced the content of", subject: fileNameOf(path), rest: "" }, line: `replace_asset_content ${path}` };
    }
    case "create_stream_document":
    case "delete_stream_document": {
      const path = textOf(operation["path"]);
      const verb = operationName === "create_stream_document" ? "Created" : "Deleted";
      const sentence = path === null ? { lead: `${verb} a stream`, subject: null, rest: "" } : { lead: `${verb} the stream`, subject: fileNameOf(path), rest: "" };
      return { sentence, line: path === null ? operationName : `${operationName} ${path}` };
    }
    case "set_stream_display_name": {
      const to = textOf(operation["to"]);
      return {
        sentence: to === null ? { lead: "Showed a stream under its file name", subject: null, rest: "" } : { lead: "Named a stream", subject: to, rest: "" },
        line: `set_stream_display_name ${wordsOfAValue(operation["from"] ?? undefined)} → ${wordsOfAValue(operation["to"] ?? undefined)}`,
      };
    }
    case "write_project_file":
    case "remove_project_file": {
      const path = textOf(operation["path"]) ?? "a file";
      const lead = operationName === "remove_project_file" ? "Removed" : operation["replaced_a_file"] === true ? "Edited" : "Added";
      return { sentence: { lead, subject: fileNameOf(path), rest: "" }, line: `${operationName} ${path}` };
    }
    case "set_project_name": {
      const to = textOf(operation["to"]);
      return { sentence: { lead: "Renamed the project", subject: null, rest: to === null ? "" : `to ${to}` }, line: `set_project_name ${wordsOfAValue(operation["from"])} → ${wordsOfAValue(operation["to"])}` };
    }
    case "set_project_description":
      return {
        sentence: { lead: textOf(operation["to"]) === null ? "Removed the project's description" : "Described the project", subject: null, rest: "" },
        line: "set_project_description",
      };
    case "set_project_cover":
      return {
        sentence: { lead: textOf(operation["to"]) === null ? "Removed the project's cover" : "Set the project's cover", subject: null, rest: "" },
        line: `set_project_cover ${wordsOfAValue(operation["from"] ?? undefined)} → ${wordsOfAValue(operation["to"] ?? undefined)}`,
      };
    default:
      return { sentence: { lead: operationName, subject: null, rest: "" }, line: operationName };
  }
}

/** What the edit whose operations are `operations` changed, its nodes named as `nodeNames` names them. */
export function whatAnEditChanged(operations: readonly JsonValue[], nodeNames: NodeNamesById): WhatAnEditChanged {
  const changed = operations.flatMap((operation) => {
    const operationFields = fieldsOf(operation);
    return operationFields === null ? [] : [whatOneOperationChanged(operationFields, nodeNames)];
  });
  const [first] = changed;
  if (first === undefined) return { what: { lead: "Changed nothing", subject: null, rest: "" }, operation_lines: [] };
  const moreWords = changed.length === 1 ? "" : changed.length === 2 ? "and 1 more change" : `and ${changed.length - 1} more changes`;
  return {
    what: { ...first.sentence, rest: [first.sentence.rest, moreWords].filter((words) => words !== "").join(", ") },
    operation_lines: changed.map((operationChanged) => operationChanged.line),
  };
}
