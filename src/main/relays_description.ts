// The runtime's relays as the window reads them: `list_relays`' instances, and the relay-adapter
// catalog `GET /api/relay-adapters` serves, each adapter's settings schema (JSON Schema, as
// `schemars` derives it from the adapter's settings type) read narrowly into the settings its
// form draws. A secret setting is `writeOnly` in the schema and listed by `list_relays` only as
// `set` or `unset`.

import type {
  ListedRelay,
  RelayAdapter,
  RelayConnectionState,
  RelaySecretPresence,
  RelaySettingField,
  RelaySettingsByName,
  RelaySettingValue,
  RelaySettingValueKind,
} from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  jsonObject,
  type JsonObjectOnTheWire,
  objectOrEmpty,
  optionalText,
  parseJsonOnTheWire,
  requiredArray,
  requiredText,
  requiredTrueOrFalse,
  requiredUnsignedInteger,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The largest value of each unsigned integer `format` schemars writes for a Rust integer type, which states no `maximum`. */
const LARGEST_VALUE_OF_EACH_UNSIGNED_INTEGER_FORMAT: Readonly<Record<string, number>> = {
  uint8: 255,
  uint16: 65_535,
  uint32: 4_294_967_295,
};

/** A tool of the runtime that changes a relay, each answering the `relay_id` it changed. */
export type RelayChangeToolName = "add_relay" | "configure_relay" | "remove_relay";

/** Whether `value` is a relay setting's value: text, a finite number, true or false, a list of texts, or `null`, which JSON carries as itself. */
function isARelaySettingValue(value: unknown): value is RelaySettingValue {
  if (Array.isArray(value)) return value.every((listedText) => typeof listedText === "string");
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

/** Each of `settingsObject`'s settings by name, or the refusal `refusalNamingTheSetting` words for the first that is no relay setting's value. */
export function relaySettingsByNameFrom(settingsObject: JsonObjectOnTheWire, refusalNamingTheSetting: (settingName: string) => string): Result<RelaySettingsByName, string> {
  const settings: RelaySettingsByName = {};
  for (const [settingName, settingValue] of Object.entries(settingsObject)) {
    if (!isARelaySettingValue(settingValue)) return failedWith(refusalNamingTheSetting(settingName));
    settings[settingName] = settingValue;
  }
  return succeeded(settings);
}

/** Every relay a `list_relays` tool result lists, in its order; unknown fields are ignored. */
export function listedRelaysFromTheListRelaysToolResult(toolResultText: string): Result<ListedRelay[], string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, "the list_relays result") : parsedToolResult;
  const relaysOnTheWire = toolResult.ok ? requiredArray(toolResult.value, "relays") : toolResult;
  const listedRelays = relaysOnTheWire.ok ? everyOneRead(relaysOnTheWire.value, listedRelayOnTheWire) : relaysOnTheWire;
  return listedRelays.ok ? listedRelays : failedWith(`the runtime's list_relays result could not be read: ${listedRelays.failure}`);
}

/** Every adapter `GET /api/relay-adapters` answers, in its order. */
export function relayAdaptersFromTheRelayAdaptersAnswer(answerText: string): Result<RelayAdapter[], string> {
  const parsedAnswer = parseJsonOnTheWire(answerText);
  const answer = parsedAnswer.ok ? jsonObject(parsedAnswer.value, "the relay-adapter catalog") : parsedAnswer;
  const adaptersOnTheWire = answer.ok ? requiredArray(answer.value, "adapters") : answer;
  const adapters = adaptersOnTheWire.ok ? everyOneRead(adaptersOnTheWire.value, relayAdapterOnTheWire) : adaptersOnTheWire;
  return adapters.ok ? adapters : failedWith(`the runtime's /api/relay-adapters answer could not be read: ${adapters.failure}`);
}

/** The `relay_id` that the `add_relay`, `configure_relay` or `remove_relay` tool result `toolName` answered names. */
export function relayIdFromTheRelayToolResult(toolName: RelayChangeToolName, toolResultText: string): Result<string, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, `the ${toolName} result`) : parsedToolResult;
  const relayId = toolResult.ok ? requiredText(toolResult.value, "relay_id") : toolResult;
  return relayId.ok ? relayId : failedWith(`the runtime's ${toolName} result could not be read: ${relayId.failure}`);
}

function listedRelayOnTheWire(listedRelayValue: unknown): Result<ListedRelay, string> {
  const listedRelay = jsonObject(listedRelayValue, "a relay");
  if (!listedRelay.ok) return listedRelay;
  const relayId = requiredText(listedRelay.value, "relay_id");
  if (!relayId.ok) return relayId;
  const adapter = requiredText(listedRelay.value, "adapter");
  if (!adapter.ok) return adapter;
  const builtIn = requiredTrueOrFalse(listedRelay.value, "built_in");
  if (!builtIn.ok) return builtIn;
  const settings = relaySettingsOnTheWire(listedRelay.value);
  if (!settings.ok) return settings;
  const secrets = relaySecretPresencesOnTheWire(listedRelay.value);
  if (!secrets.ok) return secrets;
  const connectionStateOnTheWire = jsonObject(listedRelay.value["connection_state"], "`connection_state`");
  if (!connectionStateOnTheWire.ok) return connectionStateOnTheWire;
  const connectionState = relayConnectionStateOnTheWire(connectionStateOnTheWire.value);
  if (!connectionState.ok) return connectionState;
  return succeeded({
    relay_id: relayId.value,
    adapter: adapter.value,
    built_in: builtIn.value,
    settings: settings.value,
    secrets: secrets.value,
    connection_state: connectionState.value,
  });
}

function relaySettingsOnTheWire(listedRelay: JsonObjectOnTheWire): Result<RelaySettingsByName, string> {
  const settingsOnTheWire = objectOrEmpty(listedRelay, "settings");
  if (!settingsOnTheWire.ok) return settingsOnTheWire;
  return relaySettingsByNameFrom(settingsOnTheWire.value, (settingName) => `the setting \`${settingName}\` is not text, a number, true or false, a list of texts, or null`);
}

/** Each secret's presence; a value that is not `set` or `unset` is refused by the setting's name alone, so no secret is ever carried on. */
function relaySecretPresencesOnTheWire(listedRelay: JsonObjectOnTheWire): Result<Record<string, RelaySecretPresence>, string> {
  const secretsOnTheWire = objectOrEmpty(listedRelay, "secrets");
  if (!secretsOnTheWire.ok) return secretsOnTheWire;
  const secrets: Record<string, RelaySecretPresence> = {};
  for (const [secretName, presence] of Object.entries(secretsOnTheWire.value)) {
    if (presence !== "set" && presence !== "unset") return failedWith(`the secret \`${secretName}\` is listed as neither set nor unset`);
    secrets[secretName] = presence;
  }
  return succeeded(secrets);
}

function relayConnectionStateOnTheWire(connectionState: JsonObjectOnTheWire): Result<RelayConnectionState, string> {
  const state = requiredText(connectionState, "state");
  if (!state.ok) return state;
  switch (state.value) {
    case "not_joined": {
      const why = optionalText(connectionState, "why");
      return why.ok ? succeeded({ state: "not_joined", why: why.value }) : why;
    }
    case "joining":
      return succeeded({ state: "joining" });
    case "joined":
      return succeeded({ state: "joined" });
    case "lost": {
      const why = requiredText(connectionState, "why");
      if (!why.ok) return why;
      const rejoiningAfterMs = requiredUnsignedInteger(connectionState, "rejoining_after_ms");
      return rejoiningAfterMs.ok ? succeeded({ state: "lost", why: why.value, rejoining_after_ms: rejoiningAfterMs.value }) : rejoiningAfterMs;
    }
    default:
      return succeeded({ state: "newer_than_this_app", spelled_as: state.value });
  }
}

function relayAdapterOnTheWire(adapterValue: unknown): Result<RelayAdapter, string> {
  const adapter = jsonObject(adapterValue, "an adapter");
  if (!adapter.ok) return adapter;
  const kind = requiredText(adapter.value, "kind");
  if (!kind.ok) return kind;
  const doc = requiredText(adapter.value, "doc");
  if (!doc.ok) return doc;
  const settingsSchema = jsonObject(adapter.value["settings_schema"], `the settings schema of \`${kind.value}\``);
  if (!settingsSchema.ok) return settingsSchema;
  const settingFields = relaySettingFieldsOfTheSchema(settingsSchema.value);
  if (!settingFields.ok) return failedWith(`the settings schema of \`${kind.value}\`: ${settingFields.failure}`);
  return succeeded({ kind: kind.value, doc: doc.value, setting_fields: settingFields.value });
}

function relaySettingFieldsOfTheSchema(settingsSchema: JsonObjectOnTheWire): Result<RelaySettingField[], string> {
  const properties = objectOrEmpty(settingsSchema, "properties");
  if (!properties.ok) return properties;
  const required = arrayOrEmpty(settingsSchema, "required");
  if (!required.ok) return required;
  const requiredSettingNames = new Set(required.value.filter((settingName): settingName is string => typeof settingName === "string"));
  return everyOneRead(Object.entries(properties.value), ([settingName, propertySchemaValue]) => {
    if (!isAJsonObject(propertySchemaValue)) return failedWith(`the setting \`${settingName}\` has no schema`);
    const description = optionalText(propertySchemaValue, "description");
    if (!description.ok) return description;
    const { valueKind, acceptsNull } = relaySettingTypeOf(propertySchemaValue, settingsSchema, SCHEMA_REFERENCES_FOLLOWED_AT_MOST);
    return succeeded({
      name: settingName,
      description: description.value,
      is_required: requiredSettingNames.has(settingName),
      is_secret: propertySchemaValue["writeOnly"] === true,
      value_kind: valueKind,
      accepts_null: acceptsNull,
    });
  });
}

/** How many `$ref`s deep a setting's schema is followed into its definitions, so a schema that refers to itself ends. */
const SCHEMA_REFERENCES_FOLLOWED_AT_MOST = 4;

/** The definition `reference` names, `#/definitions/<name>` or `#/$defs/<name>`, under `settingsSchema`. */
function schemaDefinitionNamed(reference: string, settingsSchema: JsonObjectOnTheWire): JsonObjectOnTheWire | null {
  const match = /^#\/(definitions|\$defs)\/([^/]+)$/.exec(reference);
  if (match === null) return null;
  const definitions = settingsSchema[match[1] ?? ""];
  const definition = isAJsonObject(definitions) ? definitions[match[2] ?? ""] : undefined;
  return isAJsonObject(definition) ? definition : null;
}

function isTheNullSchema(schema: unknown): boolean {
  return isAJsonObject(schema) && schema["type"] === "null";
}

/** The texts a schema allows as its whole set of values: its `enum`, its `const`, or each branch's of its `oneOf`; `null` when it allows any value of its type. */
function choicesTheSchemaAllows(propertySchema: JsonObjectOnTheWire): { choices: string[]; allowsNull: boolean } | null {
  const enumeration = propertySchema["enum"];
  if (Array.isArray(enumeration)) {
    const choices = enumeration.filter((choice): choice is string => typeof choice === "string");
    const allowsNull = enumeration.includes(null);
    return choices.length + (allowsNull ? 1 : 0) === enumeration.length ? { choices, allowsNull } : null;
  }
  const constant = propertySchema["const"];
  if (typeof constant === "string") return { choices: [constant], allowsNull: false };
  const branches = propertySchema["oneOf"];
  if (!Array.isArray(branches) || branches.length === 0) return null;
  const choices: string[] = [];
  let allowsNull = false;
  for (const branch of branches) {
    if (isTheNullSchema(branch)) {
      allowsNull = true;
      continue;
    }
    const branchChoices = isAJsonObject(branch) ? choicesTheSchemaAllows(branch) : null;
    if (branchChoices === null) return null;
    choices.push(...branchChoices.choices);
    allowsNull ||= branchChoices.allowsNull;
  }
  return { choices, allowsNull };
}

/**
 * What one setting's schema, as `schemars` 0.8 writes it, says it holds and whether `null` is among its values: a `$ref`,
 * or the one-branch `allOf` a documented field of a referenced type is written as, followed into the schema's
 * definitions; an `anyOf`/`oneOf` with a `null` branch read as its other branch; and a set of texts read as a choice.
 */
function relaySettingTypeOf(
  propertySchema: JsonObjectOnTheWire,
  settingsSchema: JsonObjectOnTheWire,
  referencesStillFollowed: number,
): { valueKind: RelaySettingValueKind; acceptsNull: boolean } {
  const allOfBranches = propertySchema["allOf"];
  const [onlyAllOfBranch] = Array.isArray(allOfBranches) ? allOfBranches : [];
  const referencedSchema = Array.isArray(allOfBranches) && allOfBranches.length === 1 && isAJsonObject(onlyAllOfBranch) ? onlyAllOfBranch : propertySchema;
  const reference = referencedSchema["$ref"];
  if (typeof reference === "string") {
    const definition = referencesStillFollowed > 0 ? schemaDefinitionNamed(reference, settingsSchema) : null;
    return definition === null
      ? { valueKind: { kind: "not_drawable", schema_type_words: reference }, acceptsNull: false }
      : relaySettingTypeOf(definition, settingsSchema, referencesStillFollowed - 1);
  }
  for (const unionKey of ["anyOf", "oneOf"] as const) {
    const branches = propertySchema[unionKey];
    if (!Array.isArray(branches) || !branches.some(isTheNullSchema)) continue;
    const otherBranches = branches.filter((branch) => !isTheNullSchema(branch));
    const [onlyOtherBranch] = otherBranches;
    if (otherBranches.length === 1 && isAJsonObject(onlyOtherBranch)) {
      return { valueKind: relaySettingTypeOf(onlyOtherBranch, settingsSchema, referencesStillFollowed).valueKind, acceptsNull: true };
    }
  }
  const schemaTypes = schemaTypesOf(propertySchema);
  const acceptsNullByItsType = schemaTypes.includes("null");
  const choices = choicesTheSchemaAllows(propertySchema);
  if (choices !== null) {
    return {
      valueKind: choices.choices.length === 0 ? { kind: "not_drawable", schema_type_words: "a choice of nothing" } : { kind: "one_of", choices: choices.choices },
      acceptsNull: choices.allowsNull || acceptsNullByItsType,
    };
  }
  return {
    valueKind: relaySettingValueKindOf(
      propertySchema,
      schemaTypes.filter((schemaType) => schemaType !== "null"),
    ),
    acceptsNull: acceptsNullByItsType,
  };
}

/** The schema's `type`, one name or several; none when it states none. */
function schemaTypesOf(propertySchema: JsonObjectOnTheWire): string[] {
  const schemaType = propertySchema["type"];
  if (typeof schemaType === "string") return [schemaType];
  return Array.isArray(schemaType) ? schemaType.filter((typeName): typeName is string => typeof typeName === "string") : [];
}

function relaySettingValueKindOf(propertySchema: JsonObjectOnTheWire, typesOtherThanNull: readonly string[]): RelaySettingValueKind {
  const [onlyType, ...otherTypes] = typesOtherThanNull;
  if (onlyType === undefined) return { kind: "not_drawable", schema_type_words: "no type" };
  if (otherTypes.length > 0) return { kind: "not_drawable", schema_type_words: typesOtherThanNull.join(" or ") };
  switch (onlyType) {
    case "string":
      return { kind: "text" };
    case "boolean": {
      const defaultValue = propertySchema["default"];
      return { kind: "true_or_false", default_is_on: typeof defaultValue === "boolean" ? defaultValue : null };
    }
    case "array": {
      const items = propertySchema["items"];
      if (!isAJsonObject(items)) return { kind: "not_drawable", schema_type_words: "array" };
      if (choicesTheSchemaAllows(items) !== null) return { kind: "not_drawable", schema_type_words: "array of choices" };
      const itemTypes = schemaTypesOf(items);
      if (itemTypes.length === 1 && itemTypes[0] === "string") return { kind: "text_list" };
      return { kind: "not_drawable", schema_type_words: itemTypes.length === 0 ? "array" : `array of ${itemTypes.join(" or ")}` };
    }
    case "integer": {
      const format = propertySchema["format"];
      const minimum = propertySchema["minimum"];
      const maximum = propertySchema["maximum"];
      return {
        kind: "whole_number",
        minimum: typeof minimum === "number" ? minimum : null,
        maximum: typeof maximum === "number" ? maximum : typeof format === "string" ? (LARGEST_VALUE_OF_EACH_UNSIGNED_INTEGER_FORMAT[format] ?? null) : null,
      };
    }
    default:
      return { kind: "not_drawable", schema_type_words: onlyType };
  }
}
