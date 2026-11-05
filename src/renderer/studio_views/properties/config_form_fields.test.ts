import { expect, test } from "vitest";
import { MOCK_NODE_CATALOG_ENTRIES } from "../../backend/mock_node_catalog";
import { configFormFieldValueWords, configFormOf } from "./config_form_fields";

const RUST_SPELLED_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "DisplayWindowConfig",
  type: "object",
  properties: {
    title: { description: "The window's title.", type: ["string", "null"] },
    width: { type: "integer", format: "uint32", minimum: 0, default: 1280 },
    scaling: { $ref: "#/$defs/Scaling", description: "How a frame fits the window." },
  },
  required: ["width"],
  $defs: { Scaling: { type: "string", enum: ["fit", "fill", "stretch"] } },
};

test("a_rust_spelled_schema_reads_its_nullable_its_default_and_its_referenced_choices", () => {
  const form = configFormOf(RUST_SPELLED_SCHEMA, { scaling: "fill" });
  expect(form).toEqual({
    kind: "fields",
    fields: [
      { key: "title", description: "The window's title.", control: { kind: "text" }, value: null, value_source: "unset", is_required: false, is_nullable: true },
      { key: "width", description: null, control: { kind: "number", is_whole_number: true }, value: 1280, value_source: "default", is_required: true, is_nullable: false },
      { key: "scaling", description: "How a frame fits the window.", control: { kind: "choice", choices: ["fit", "fill", "stretch"] }, value: "fill", value_source: "config", is_required: false, is_nullable: false },
    ],
  });
});

test("a_python_spelled_nullable_reads_as_its_one_other_branch", () => {
  const form = configFormOf(
    { type: "object", properties: { fps: { anyOf: [{ type: "number" }, { type: "null" }], default: null, description: "Frames a second." } } },
    { fps: 30 },
  );
  expect(form).toEqual({
    kind: "fields",
    fields: [{ key: "fps", description: "Frames a second.", control: { kind: "number", is_whole_number: false }, value: 30, value_source: "config", is_required: false, is_nullable: true }],
  });
});

test("a_config_key_the_schema_does_not_name_is_shown_after_the_ones_it_does", () => {
  const form = configFormOf({ type: "object", properties: { on: { type: "boolean" } } }, { on: true, extra: { nested: [1] } });
  expect(form.kind === "fields" && form.fields.map((field) => [field.key, field.control.kind, field.value_source])).toEqual([
    ["on", "toggle", "config"],
    ["extra", "json", "config"],
  ]);
});

test("a_node_type_with_no_schema_shows_its_config_as_the_graph_renders_it", () => {
  const form = configFormOf(null, { path: "/tmp/out.mp4", frames: 12 });
  expect(form.kind === "fields" && form.fields.map((field) => [field.key, field.control])).toEqual([
    ["path", { kind: "text" }],
    ["frames", { kind: "number", is_whole_number: true }],
  ]);
});

test("a_schema_that_closes_an_object_with_no_properties_takes_no_config", () => {
  expect(configFormOf({ type: "object", additionalProperties: false }, {})).toEqual({ kind: "takes_no_config" });
  expect(configFormOf({ type: "object" }, {})).toEqual({ kind: "fields", fields: [] });
});

test("every_mock_catalog_schema_reads_without_a_json_fallback_for_a_declared_key", () => {
  for (const entry of MOCK_NODE_CATALOG_ENTRIES) {
    const form = configFormOf(entry.config_schema, {});
    if (form.kind === "fields") for (const field of form.fields) expect([entry.type, field.key, field.control.kind]).not.toContain("json");
  }
});

test("a_value_is_shown_in_words", () => {
  expect(configFormFieldValueWords(null)).toBe("");
  expect(configFormFieldValueWords("fit")).toBe("fit");
  expect(configFormFieldValueWords(12)).toBe("12");
  expect(configFormFieldValueWords({ a: [true] })).toBe('{"a":[true]}');
});
