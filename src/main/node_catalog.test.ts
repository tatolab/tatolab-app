import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { nodeCatalogFromTheRegistryAnswer, nodeCatalogRequestTarget } from "./node_catalog.js";

/**
 * What a real runtime with no stream loaded answered `GET /api/registry` with: its one native node type under `nodes`,
 * each entry spelled as a one-stream answer spells it, and no `streams`.
 */
const aRealRegistryAnswer = () => readFile(new URL("./test-fixtures/local-api-registry-answer-of-a-test-root-runtime-naming-no-stream.json", import.meta.url), "utf8");

test("a_real_registry_answer_reads_as_each_node_types_description_config_schema_and_ports", async () => {
  const nodeCatalog = nodeCatalogFromTheRegistryAnswer("main", await aRealRegistryAnswer());

  expect(nodeCatalog.ok).toBe(true);
  if (!nodeCatalog.ok) return;
  const [relayTrackSource] = nodeCatalog.value.node_types;
  expect(relayTrackSource?.type).toBe("tatolab.stream:RelayTrackSource");
  expect(relayTrackSource?.description.startsWith("Reads one track at a MoQ relay into the graph")).toBe(true);
  expect(relayTrackSource?.inputs).toEqual([]);
  expect(relayTrackSource?.outputs).toEqual([{ name: "track", description: "Each object of the track, as the relay delivered it" }]);
  expect(relayTrackSource?.config_schema).toMatchObject({
    title: "RelayTrackSourceConfig",
    type: "object",
    required: ["broadcast", "track"],
    properties: { max_age: { type: "integer", default: 100 }, relay_url: { type: "string", default: "http://127.0.0.1:4443" } },
    additionalProperties: false,
  });
});

test("a_node_type_described_without_a_config_schema_reads_as_none", () => {
  const registryAnswer = JSON.stringify({ nodes: [{ type: "nodes.x:X", description: "", inputs: [{ name: "a", description: "" }], outputs: [] }] });

  expect(nodeCatalogFromTheRegistryAnswer("main", registryAnswer)).toEqual({
    ok: true,
    value: { stream: "main", node_types: [{ type: "nodes.x:X", description: "", config_schema: null, inputs: [{ name: "a", description: "" }], outputs: [] }] },
  });
});

test("a_registry_answer_without_nodes_is_refused_naming_the_stream", () => {
  const nodeCatalog = nodeCatalogFromTheRegistryAnswer("main", JSON.stringify({ streams: [] }));

  expect(nodeCatalog.ok).toBe(false);
  if (!nodeCatalog.ok) expect(nodeCatalog.failure).toContain("node catalog of `main`");
});

test("the_stream_is_named_in_the_query_as_a_uri_component", () => {
  expect(nodeCatalogRequestTarget("a stream/with&marks")).toBe("/api/registry?stream=a%20stream%2Fwith%26marks");
});
