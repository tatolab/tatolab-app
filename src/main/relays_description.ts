// The runtime's relays as the window reads them: `list_relays`' instances, and the relay-adapter
// catalog `GET /api/relay-adapters` serves, each adapter's settings schema (JSON Schema, as
// `schemars` derives it from the adapter's settings type) read narrowly into the settings its
// form draws. A secret setting is `writeOnly` in the schema and listed by `list_relays` only as
// `set` or `unset`.

import type {
  ListedRelay,
  RelayAdapter,
  RelayConnectionState,
  RelaySettingField,
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
export function relayIdFromTheRelayToolResult(toolName: string, toolResultText: string): Result<string, string> {
  const parsedToolResult = parseJsonOnTheWire(toolResultText);
  const toolResult = parsedToolResult.ok ? jsonObject(parsedToolResult.value, `the ${toolName} result`) : parsedToolResult;
  const relayId = toolResult.ok ? requiredText(toolResult.value, "relay_id") : toolResult;
  return relayId.ok ? relayId : failedWith(`the runtime's ${toolName} result could not be read: ${relayId.failure}`);
}

function requiredArray(jsonObjectOnTheWire: JsonObjectOnTheWire, key: string): Result<readonly unknown[], string> {
  const value = jsonObjectOnTheWire[key];
  if (value === undefined) return failedWith(`missing field \`${key}\``);
  return Array.isArray(value) ? succeeded(value) : failedWith(`\`${key}\` is not an array`);
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

function relaySettingsOnTheWire(listedRelay: JsonObjectOnTheWire): Result<Record<string, RelaySettingValue>, string> {
  const settingsOnTheWire = objectOrEmpty(listedRelay, "settings");
  if (!settingsOnTheWire.ok) return settingsOnTheWire;
  const settings: Record<string, RelaySettingValue> = {};
  for (const [settingName, settingValue] of Object.entries(settingsOnTheWire.value)) {
    if (settingValue !== null && typeof settingValue !== "string" && typeof settingValue !== "number" && typeof settingValue !== "boolean") {
      return failedWith(`the setting \`${settingName}\` is not text, a number, true or false, or null`);
    }
    settings[settingName] = settingValue;
  }
  return succeeded(settings);
}

/** Each secret's presence; a value that is not `set` or `unset` is refused by the setting's name alone, so no secret is ever carried on. */
function relaySecretPresencesOnTheWire(listedRelay: JsonObjectOnTheWire): Result<Record<string, "set" | "unset">, string> {
  const secretsOnTheWire = objectOrEmpty(listedRelay, "secrets");
  if (!secretsOnTheWire.ok) return secretsOnTheWire;
  const secrets: Record<string, "set" | "unset"> = {};
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
    const schemaTypes = schemaTypesOf(propertySchemaValue);
    return succeeded({
      name: settingName,
      description: description.value,
      is_required: requiredSettingNames.has(settingName),
      is_secret: propertySchemaValue["writeOnly"] === true,
      value_kind: relaySettingValueKindOf(propertySchemaValue, schemaTypes.filter((schemaType) => schemaType !== "null")),
      accepts_null: schemaTypes.includes("null"),
    });
  });
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
  if (onlyType === "string") return { kind: "text" };
  if (onlyType !== "integer") return { kind: "not_drawable", schema_type_words: onlyType };
  const format = propertySchema["format"];
  const maximum = propertySchema["maximum"];
  return {
    kind: "whole_number",
    minimum: typeof propertySchema["minimum"] === "number" ? propertySchema["minimum"] : null,
    maximum: typeof maximum === "number" ? maximum : typeof format === "string" ? (LARGEST_VALUE_OF_EACH_UNSIGNED_INTEGER_FORMAT[format] ?? null) : null,
  };
}
