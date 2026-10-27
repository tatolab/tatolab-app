import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { listedRelaysFromTheListRelaysToolResult, relayAdaptersFromTheRelayAdaptersAnswer, relayIdFromTheRelayToolResult } from "./relays_description.js";
import type { Result } from "./result.js";

/** A response body recorded from a real runtime's local API. */
const recordedResponseBody = (fixtureFileName: string) => readFile(new URL(`./test-fixtures/${fixtureFileName}`, import.meta.url), "utf8");

/** The text of the first content block of a recorded MCP tool response. */
async function recordedToolResultText(fixtureFileName: string): Promise<string> {
  const jsonRpcResponse: { result: { content: { text: string }[] } } = JSON.parse(await recordedResponseBody(fixtureFileName));
  return jsonRpcResponse.result.content[0]?.text ?? "";
}

function answerOf<T, F>(result: Result<T, F>): T {
  if (!result.ok) return expect.unreachable(JSON.stringify(result.failure));
  return result.value;
}

function failureOf<T, F>(result: Result<T, F>): F {
  if (result.ok) return expect.unreachable(`expected a failure, answered ${JSON.stringify(result.value)}`);
  return result.failure;
}

test("a_real_list_relays_result_lists_both_local_listeners_first_with_their_ports_joined", async () => {
  const relays = answerOf(listedRelaysFromTheListRelaysToolResult(await recordedToolResultText("local-api-list-relays-tool-result-of-a-test-root-runtime-at-start.json")));

  expect(relays).toEqual([
    { relay_id: "local-loopback", adapter: "local", built_in: true, settings: { port: 14443 }, secrets: {}, connection_state: { state: "joined" } },
    { relay_id: "local-every-interface", adapter: "local", built_in: true, settings: { port: 14445 }, secrets: {}, connection_state: { state: "joined" } },
  ]);
});

test("a_real_list_relays_result_names_each_secret_set_and_keeps_the_rest_of_the_settings", async () => {
  const relays = answerOf(
    listedRelaysFromTheListRelaysToolResult(await recordedToolResultText("local-api-list-relays-tool-result-with-a-secret-holder-and-a-joining-cloudflare-relay.json")),
  );

  expect(relays.map((relay) => relay.relay_id)).toEqual(["local-loopback", "local-every-interface", "test-secret-holder-1", "cloudflare-1"]);
  expect(relays[2]).toEqual({
    relay_id: "test-secret-holder-1",
    adapter: "test-secret-holder",
    built_in: false,
    settings: { label: "desk" },
    secrets: { token: "set" },
    connection_state: { state: "joined" },
  });
  expect(relays[3]?.secrets).toEqual({ relay_url: "set" });
  expect(relays[3]?.connection_state).toEqual({ state: "joining" });
});

test("each_connection_state_reads_with_its_reason_and_a_newer_one_is_kept_as_spelled", () => {
  const relayIn = (connectionState: unknown) =>
    JSON.stringify({ relays: [{ relay_id: "moqpro-1", adapter: "moqpro", built_in: false, settings: {}, secrets: {}, connection_state: connectionState }] });
  const connectionStateOf = (connectionState: unknown) => answerOf(listedRelaysFromTheListRelaysToolResult(relayIn(connectionState)))[0]?.connection_state;

  expect(connectionStateOf({ state: "not_joined" })).toEqual({ state: "not_joined", why: null });
  expect(connectionStateOf({ state: "not_joined", why: "no local relay runs" })).toEqual({ state: "not_joined", why: "no local relay runs" });
  expect(connectionStateOf({ state: "lost", why: "refused", rejoining_after_ms: 2000 })).toEqual({ state: "lost", why: "refused", rejoining_after_ms: 2000 });
  expect(connectionStateOf({ state: "paused_by_the_provider" })).toEqual({ state: "newer_than_this_app", spelled_as: "paused_by_the_provider" });
  expect(failureOf(listedRelaysFromTheListRelaysToolResult(relayIn({ state: "lost", why: "refused" })))).toContain("rejoining_after_ms");
});

test("a_secret_listed_as_anything_but_set_or_unset_is_refused_so_no_value_reaches_the_window", () => {
  const listed = JSON.stringify({
    relays: [{ relay_id: "cloudflare-1", adapter: "cloudflare", built_in: false, settings: {}, secrets: { relay_url: "https://relay.example/the-token" }, connection_state: { state: "joined" } }],
  });

  const failure = failureOf(listedRelaysFromTheListRelaysToolResult(listed));

  expect(failure).toContain("relay_url");
  expect(failure).not.toContain("the-token");
});

test("a_setting_that_is_not_text_a_number_true_false_or_null_is_refused_naming_it", () => {
  const listed = JSON.stringify({
    relays: [{ relay_id: "local-loopback", adapter: "local", built_in: true, settings: { tls: { certificate: "/tmp/c.pem" } }, secrets: {}, connection_state: { state: "joined" } }],
  });

  expect(failureOf(listedRelaysFromTheListRelaysToolResult(listed))).toContain("`tls`");
});

test("a_list_relays_result_without_relays_is_refused_naming_the_tool", () => {
  expect(failureOf(listedRelaysFromTheListRelaysToolResult("{}"))).toBe("the runtime's list_relays result could not be read: missing field `relays`");
});

test("the_real_relay_adapter_catalog_reads_each_adapter_with_its_settings_in_schema_order", async () => {
  const adapters = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(await recordedResponseBody("local-api-relay-adapters-answer-of-a-test-root-runtime.json")));

  expect(adapters.map((adapter) => adapter.kind)).toEqual(["local", "cloudflare", "moqpro", "test-secret-holder"]);
  expect(adapters[2]?.doc.startsWith("A moq.pro project, dialed at its path")).toBe(true);
  expect(adapters[2]?.setting_fields).toEqual([
    {
      name: "project_id",
      description: "The project's id as moq.pro names it: the root every token is minted under and the path the relay is dialed at.",
      is_required: true,
      is_secret: false,
      value_kind: { kind: "text" },
      accepts_null: false,
    },
    {
      name: "relay_url",
      description: "The relays the project is served at; absent, `https://cdn.moq.dev`.",
      is_required: false,
      is_secret: false,
      value_kind: { kind: "text" },
      accepts_null: true,
    },
    {
      name: "signing_key",
      description: "The project's signing key, the JWK moq.pro gave for it, as JSON or base64url JSON. It mints read and write for every broadcast of the project.",
      is_required: true,
      is_secret: true,
      value_kind: { kind: "text" },
      accepts_null: false,
    },
  ]);
});

test("the_real_relay_adapter_catalog_names_each_adapter_with_its_logo_as_a_data_image_uri", async () => {
  const adapters = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(await recordedResponseBody("local-api-relay-adapters-answer-of-a-test-root-runtime.json")));

  expect(adapters.map((adapter) => [adapter.kind, adapter.display_name])).toEqual([
    ["local", "Local relay"],
    ["cloudflare", "Cloudflare"],
    ["moqpro", "moq.pro"],
    ["test-secret-holder", "Secret-holding test relay"],
  ]);
  for (const adapter of adapters) expect(adapter.display_icon_data_uri?.startsWith("data:image/svg+xml;base64,")).toBe(true);
});

test("a_port_reads_as_a_whole_number_bounded_by_its_format", async () => {
  const adapters = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(await recordedResponseBody("local-api-relay-adapters-answer-of-a-test-root-runtime.json")));

  expect(adapters[0]?.setting_fields).toEqual([
    {
      name: "port",
      description: "The port the listener takes for QUIC and HTTP alike; absent, the listener's own default (4443 at loopback, 4445 at every interface).",
      is_required: false,
      is_secret: false,
      value_kind: { kind: "whole_number", minimum: 0, maximum: 65535 },
      accepts_null: true,
    },
  ]);
});

test("a_setting_whose_type_the_form_cannot_draw_is_kept_naming_its_type", () => {
  const catalog = JSON.stringify({
    adapters: [
      {
        kind: "red5",
        doc: "A Red5 relay.",
        settings_schema: { type: "object", properties: { regions: { type: "array", items: { type: "string" } }, region: { enum: ["us", "eu"] } } },
      },
    ],
  });

  const settingFields = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(catalog))[0]?.setting_fields;

  expect(settingFields?.map((settingField) => settingField.value_kind)).toEqual([
    { kind: "not_drawable", schema_type_words: "array" },
    { kind: "not_drawable", schema_type_words: "no type" },
  ]);
});

test("an_adapter_serving_its_name_and_icon_is_read_with_both", () => {
  const catalog = JSON.stringify({
    adapters: [
      {
        kind: "moqpro",
        display_name: "moq.pro",
        display_icon_data_uri: "data:image/svg+xml;base64,PHN2Zy8+",
        doc: "A moq.pro project.",
        settings_schema: { type: "object", properties: {} },
      },
    ],
  });

  const adapter = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(catalog))[0];

  expect(adapter?.display_name).toBe("moq.pro");
  expect(adapter?.display_icon_data_uri).toBe("data:image/svg+xml;base64,PHN2Zy8+");
});

test("an_adapter_serving_neither_its_name_nor_its_icon_reads_both_as_null_and_keeps_its_kind", () => {
  const catalog = JSON.stringify({ adapters: [{ kind: "moqpro", doc: "A moq.pro project.", settings_schema: { type: "object", properties: {} } }] });

  const adapter = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(catalog))[0];

  expect(adapter).toMatchObject({ kind: "moqpro", display_name: null, display_icon_data_uri: null });
});

test("an_icon_that_is_not_a_data_image_uri_is_dropped_and_the_adapter_kept", () => {
  const iconsNotDataImages = ["https://moq.pro/logo.svg", "data:text/html;base64,PHNjcmlwdD4=", "javascript:alert(1)", "DATA:IMAGE/PNG;base64,AA=="];
  const catalog = JSON.stringify({
    adapters: iconsNotDataImages.map((icon, iconIndex) => ({
      kind: `adapter-${iconIndex}`,
      display_name: "An adapter",
      display_icon_data_uri: icon,
      doc: "An adapter.",
      settings_schema: { type: "object", properties: {} },
    })),
  });

  const adapters = answerOf(relayAdaptersFromTheRelayAdaptersAnswer(catalog));

  expect(adapters.map((adapter) => adapter.display_icon_data_uri)).toEqual([null, null, null, null]);
  expect(adapters.map((adapter) => adapter.display_name)).toEqual(["An adapter", "An adapter", "An adapter", "An adapter"]);
});

test("a_display_name_or_icon_that_is_not_text_is_refused_naming_the_field", () => {
  const catalogWith = (fields: Record<string, unknown>) =>
    JSON.stringify({ adapters: [{ kind: "moqpro", ...fields, doc: "A moq.pro project.", settings_schema: { type: "object", properties: {} } }] });

  expect(failureOf(relayAdaptersFromTheRelayAdaptersAnswer(catalogWith({ display_name: 7 })))).toContain("`display_name`");
  expect(failureOf(relayAdaptersFromTheRelayAdaptersAnswer(catalogWith({ display_icon_data_uri: { svg: "<svg/>" } })))).toContain("`display_icon_data_uri`");
});

test("a_catalog_without_adapters_is_refused_naming_the_route", () => {
  expect(failureOf(relayAdaptersFromTheRelayAdaptersAnswer('{"kinds":[]}'))).toBe("the runtime's /api/relay-adapters answer could not be read: missing field `adapters`");
});

test("a_relay_tool_result_reads_the_relay_id_it_names", async () => {
  expect(answerOf(relayIdFromTheRelayToolResult("add_relay", await recordedToolResultText("local-api-add-relay-answer-for-a-test-secret-holder.json")))).toBe(
    "test-secret-holder-1",
  );
  expect(failureOf(relayIdFromTheRelayToolResult("remove_relay", "{}"))).toBe("the runtime's remove_relay result could not be read: missing field `relay_id`");
});
