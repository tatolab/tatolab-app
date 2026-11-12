// A node's config as form fields, from its type's config JSON Schema (draft 2020-12, as the runtime's
// node catalog serves it) and the config the graph renders. Both of the runtime's spellings of a
// nullable read the same: Rust's `"type": [T, "null"]` and Python's `anyOf` with `{"type": "null"}`;
// a `$ref` resolves under the document's own `$defs`.

import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A JSON object, as a config or a record in a config's list is. */
export type JsonObject = { [key: string]: JsonValue };

/** How a field shows its value: text, a number, on or off, one of a fixed set, or JSON for a value no plainer control holds. */
export type ConfigFormFieldControl =
  | { kind: "text" }
  | { kind: "number"; is_whole_number: boolean; minimum: number | null; maximum: number | null }
  | { kind: "toggle" }
  | { kind: "choice"; choices: JsonValue[] }
  | { kind: "project_asset"; media_it_takes: string[] | null }
  | { kind: "list_of_records"; item_schema: JsonObject; new_item: JsonObject }
  | { kind: "json" };

/** One field of a node's config form. */
export interface ConfigFormField {
  key: string;
  /** The schema's `description` of the key; `null` when it gives none. */
  description: string | null;
  control: ConfigFormFieldControl;
  /** The config's value, else the schema's `default`, else `null`. */
  value: JsonValue;
  /** Where the value comes from: the graph's config, the schema's default, or neither. */
  value_source: "config" | "default" | "unset";
  is_required: boolean;
  /** Whether `null` is a value the schema takes. */
  is_nullable: boolean;
}

/** A node's config form: its fields, or that its type takes no config. */
export type ConfigForm = { kind: "fields"; fields: ConfigFormField[] } | { kind: "takes_no_config" };

function isAJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `schema` with a `$ref` into the document's own `$defs` (or `definitions`) followed, its own keywords kept over the target's. */
function resolvedSchema(schema: JsonValue | undefined, documentRoot: JsonObject, depth = 0): JsonObject {
  if (!isAJsonObject(schema)) return {};
  const reference = schema["$ref"];
  if (typeof reference !== "string" || depth > 8) return schema;
  const [, definitionsKey, definitionName] = /^#\/(\$defs|definitions)\/(.+)$/.exec(reference) ?? [];
  if (definitionsKey === undefined || definitionName === undefined) return schema;
  const definitions = documentRoot[definitionsKey];
  const target = isAJsonObject(definitions) ? definitions[decodeURIComponent(definitionName)] : undefined;
  const { $ref: _followedReference, ...ownKeywords } = schema;
  return { ...resolvedSchema(target, documentRoot, depth + 1), ...ownKeywords };
}

/** The schema's types, `null` dropped and noted. */
function declaredTypes(schema: JsonObject): { types: string[]; isNullable: boolean } {
  const typeKeyword = schema["type"];
  const types = typeof typeKeyword === "string" ? [typeKeyword] : Array.isArray(typeKeyword) ? typeKeyword.filter((type): type is string => typeof type === "string") : [];
  return { types: types.filter((type) => type !== "null"), isNullable: types.includes("null") };
}

/** A schema that is a union with `null` read as its one other branch, nullable; any other schema as itself. */
function withNullUnionUnwrapped(schema: JsonObject, documentRoot: JsonObject): { schema: JsonObject; isNullable: boolean } {
  const branches = schema["anyOf"] ?? schema["oneOf"];
  if (!Array.isArray(branches)) return { schema, isNullable: false };
  const resolvedBranches = branches.map((branch) => resolvedSchema(branch, documentRoot));
  const nonNullBranches = resolvedBranches.filter((branch) => !(branch["type"] === "null" && Object.keys(branch).length === 1));
  if (nonNullBranches.length !== 1 || nonNullBranches.length === resolvedBranches.length) return { schema, isNullable: false };
  const { anyOf: _anyOf, oneOf: _oneOf, ...ownKeywords } = schema;
  return { schema: { ...nonNullBranches[0], ...ownKeywords }, isNullable: true };
}

// The keyword a string config key holding a project asset's UUID carries, as the runtime's
// `tatolab.stream.ProjectAssetUuid` writes it: `{"media": [...]}` names the `media_facts`
// members of which the asset holds one, and `{}` takes any asset of the project.
const PROJECT_ASSET_SCHEMA_KEYWORD = "x-tatolab-project-asset";

/** The media a project asset key takes, `null` for any asset, or `undefined` for a key that holds no project asset. */
function mediaAProjectAssetKeyTakes(schema: JsonObject): string[] | null | undefined {
  const keyword = schema[PROJECT_ASSET_SCHEMA_KEYWORD];
  if (!isAJsonObject(keyword)) return undefined;
  const media = keyword["media"];
  return Array.isArray(media) ? media.filter((medium): medium is string => typeof medium === "string") : null;
}

/** The bounds a number schema sets, each `null` where it sets none. */
function rangeOfTheSchema(schema: JsonObject): { minimum: number | null; maximum: number | null } {
  const minimum = schema["minimum"];
  const maximum = schema["maximum"];
  return { minimum: typeof minimum === "number" ? minimum : null, maximum: typeof maximum === "number" ? maximum : null };
}

/** An array schema whose items are objects with named properties, as the item's schema with the document's `$defs` carried along so it reads on its own. */
function recordItemSchemaOfAnArray(schema: JsonObject, documentRoot: JsonObject): JsonObject | null {
  const itemSchema = withNullUnionUnwrapped(resolvedSchema(schema["items"], documentRoot), documentRoot).schema;
  if (declaredTypes(itemSchema).types.join() !== "object" || !isAJsonObject(itemSchema["properties"])) return null;
  const carriedDefinitions = Object.fromEntries((["$defs", "definitions"] as const).flatMap((definitionsKey) => (documentRoot[definitionsKey] === undefined ? [] : [[definitionsKey, documentRoot[definitionsKey]]])));
  return { ...carriedDefinitions, ...itemSchema };
}

/** A record added to a list: empty, so it reads its type's defaults, but for each required property with a default, at that default. */
function newItemOfTheRecordSchema(itemSchema: JsonObject): JsonObject {
  const properties = isAJsonObject(itemSchema["properties"]) ? itemSchema["properties"] : {};
  const requiredKeys = Array.isArray(itemSchema["required"]) ? itemSchema["required"] : [];
  return Object.fromEntries(
    Object.entries(properties).flatMap(([key, propertySchema]) => {
      if (!requiredKeys.includes(key)) return [];
      const defaultValue = withNullUnionUnwrapped(resolvedSchema(propertySchema, itemSchema), itemSchema).schema["default"];
      return defaultValue === undefined ? [] : [[key, defaultValue]];
    }),
  );
}

function controlOfTheSchema(schema: JsonObject, documentRoot: JsonObject): { control: ConfigFormFieldControl; isNullable: boolean } {
  const choices = schema["enum"];
  const { types, isNullable } = declaredTypes(schema);
  if (Array.isArray(choices)) return { control: { kind: "choice", choices: choices.filter((choice) => choice !== null) }, isNullable: isNullable || choices.includes(null) };
  if ("const" in schema && schema["const"] !== undefined) return { control: { kind: "choice", choices: [schema["const"]] }, isNullable };
  if (types.length !== 1) return { control: { kind: "json" }, isNullable };
  switch (types[0]) {
    case "string": {
      const mediaItTakes = mediaAProjectAssetKeyTakes(schema);
      return { control: mediaItTakes === undefined ? { kind: "text" } : { kind: "project_asset", media_it_takes: mediaItTakes }, isNullable };
    }
    case "integer":
      return { control: { kind: "number", is_whole_number: true, ...rangeOfTheSchema(schema) }, isNullable };
    case "number":
      return { control: { kind: "number", is_whole_number: false, ...rangeOfTheSchema(schema) }, isNullable };
    case "boolean":
      return { control: { kind: "toggle" }, isNullable };
    case "array": {
      const itemSchema = recordItemSchemaOfAnArray(schema, documentRoot);
      return { control: itemSchema === null ? { kind: "json" } : { kind: "list_of_records", item_schema: itemSchema, new_item: newItemOfTheRecordSchema(itemSchema) }, isNullable };
    }
    default:
      return { control: { kind: "json" }, isNullable };
  }
}

/** The control a value with no schema shows in, from the value itself. */
function controlOfTheValue(value: JsonValue): ConfigFormFieldControl {
  if (typeof value === "string") return { kind: "text" };
  if (typeof value === "boolean") return { kind: "toggle" };
  if (typeof value === "number") return { kind: "number", is_whole_number: Number.isInteger(value), minimum: null, maximum: null };
  return { kind: "json" };
}

function fieldOfAKeyWithNoSchema(key: string, value: JsonValue): ConfigFormField {
  return { key, description: null, control: controlOfTheValue(value), value, value_source: "config", is_required: false, is_nullable: false };
}

/** The form for `config` under `configSchema`: a field per key the schema names, in its order, then one per key of `config` it does not. */
export function configFormOf(configSchema: JsonValue | null, config: { [key: string]: JsonValue }): ConfigForm {
  if (configSchema === null || typeof configSchema === "boolean") {
    const fields = Object.entries(config).map(([key, value]) => fieldOfAKeyWithNoSchema(key, value));
    return fields.length === 0 && configSchema === false ? { kind: "takes_no_config" } : { kind: "fields", fields };
  }
  if (!isAJsonObject(configSchema)) return { kind: "fields", fields: Object.entries(config).map(([key, value]) => fieldOfAKeyWithNoSchema(key, value)) };
  const documentRoot = configSchema;
  const rootSchema = resolvedSchema(configSchema, documentRoot);
  const properties = isAJsonObject(rootSchema["properties"]) ? rootSchema["properties"] : {};
  const requiredKeys = Array.isArray(rootSchema["required"]) ? rootSchema["required"].filter((key): key is string => typeof key === "string") : [];
  const fieldsTheSchemaNames = Object.entries(properties).map(([key, propertySchemaOnTheWire]): ConfigFormField => {
    const unwrapped = withNullUnionUnwrapped(resolvedSchema(propertySchemaOnTheWire, documentRoot), documentRoot);
    const { control, isNullable } = controlOfTheSchema(unwrapped.schema, documentRoot);
    const description = unwrapped.schema["description"];
    const configValue = config[key];
    const defaultValue = unwrapped.schema["default"];
    const valueSource = configValue !== undefined ? "config" : defaultValue !== undefined ? "default" : "unset";
    return {
      key,
      description: typeof description === "string" ? description : null,
      control,
      value: configValue ?? defaultValue ?? null,
      value_source: valueSource,
      is_required: requiredKeys.includes(key),
      is_nullable: unwrapped.isNullable || isNullable,
    };
  });
  const fieldsOfKeysTheSchemaDoesNotName = Object.entries(config)
    .filter(([key]) => !(key in properties))
    .map(([key, value]) => fieldOfAKeyWithNoSchema(key, value));
  const fields = [...fieldsTheSchemaNames, ...fieldsOfKeysTheSchemaDoesNotName];
  if (fields.length === 0 && rootSchema["additionalProperties"] === false) return { kind: "takes_no_config" };
  return { kind: "fields", fields };
}

/** The form of one entry of a list of records: its fields, a list nested in it shown as JSON. */
export function configFormOfAListEntry(itemSchema: JsonObject, record: JsonObject): ConfigForm {
  const entryForm = configFormOf(itemSchema, record);
  return entryForm.kind === "fields" ? { kind: "fields", fields: entryForm.fields.map((field) => (field.control.kind === "list_of_records" ? { ...field, control: { kind: "json" } } : field)) } : entryForm;
}

/** The records of a list field's value, an absent or malformed list read as none and a non-object entry as an empty record. */
export function recordsOfAListField(value: JsonValue): JsonObject[] {
  return Array.isArray(value) ? value.map((item) => (isAJsonObject(item) ? item : {})) : [];
}

/** A field's value in words: text as itself, `null` as nothing, anything else as compact JSON. */
export function configFormFieldValueWords(value: JsonValue): string {
  if (value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
