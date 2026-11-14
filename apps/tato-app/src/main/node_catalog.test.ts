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
  expect(relayTrackSource?.outputs).toEqual([{ name: "track", description: "Each object of the track, as the relay delivered it", family: null }]);
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
    value: { stream: "main", node_types: [{ type: "nodes.x:X", description: "", category: null, config_schema: null, inputs: [{ name: "a", description: "", family: null }], outputs: [] }] },
  });
});

test("a_node_type_reads_with_the_category_the_runtime_serves_and_with_none_where_it_serves_none", () => {
  const registryAnswer = JSON.stringify({
    nodes: [
      { type: "core_nodes.color:Posterize", description: "", category: "Effects/Stylize", inputs: [], outputs: [] },
      { type: "tatolab.stream:CameraSource", description: "", inputs: [], outputs: [] },
      { type: "nodes.x:X", description: "", category: null, inputs: [], outputs: [] },
    ],
  });

  const nodeCatalog = nodeCatalogFromTheRegistryAnswer("main", registryAnswer);

  expect(nodeCatalog.ok).toBe(true);
  if (!nodeCatalog.ok) return;
  expect(nodeCatalog.value.node_types.map((nodeType) => nodeType.category)).toEqual(["Effects/Stylize", null, null]);
});

test("a_node_type_whose_category_is_not_text_is_refused_naming_the_field", () => {
  const nodeCatalog = nodeCatalogFromTheRegistryAnswer("main", JSON.stringify({ nodes: [{ type: "nodes.x:X", category: 7 }] }));

  expect(nodeCatalog.ok).toBe(false);
  if (!nodeCatalog.ok) expect(nodeCatalog.failure).toContain("`category` is not a string");
});

test("a_registry_answer_without_nodes_is_refused_naming_the_stream", () => {
  const nodeCatalog = nodeCatalogFromTheRegistryAnswer("main", JSON.stringify({ streams: [] }));

  expect(nodeCatalog.ok).toBe(false);
  if (!nodeCatalog.ok) expect(nodeCatalog.failure).toContain("node catalog of `main`");
});

test("the_stream_is_named_in_the_query_as_a_uri_component", () => {
  expect(nodeCatalogRequestTarget("a stream/with&marks")).toBe("/api/registry?stream=a%20stream%2Fwith%26marks");
});

test("a_port_naming_one_of_the_five_families_reads_as_it_in_any_case_and_any_other_as_none", () => {
  const registryAnswer = JSON.stringify({
    nodes: [
      {
        type: "nodes.x:X",
        description: "",
        inputs: [
          { name: "frames", description: "", family: "Image" },
          { name: "levels", description: "", family: "channels" },
        ],
        outputs: [{ name: "mystery", description: "", family: "Volume" }],
      },
    ],
  });
  const catalog = nodeCatalogFromTheRegistryAnswer("main", registryAnswer);
  expect(catalog.ok && catalog.value.node_types[0]?.inputs.map((port) => port.family)).toEqual(["image", "channels"]);
  expect(catalog.ok && catalog.value.node_types[0]?.outputs.map((port) => port.family)).toEqual([null]);
});
