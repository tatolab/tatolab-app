import { expect, test } from "vitest";
import { configFormFieldValueWords, configFormOf, recordsOfAListField } from "./config_form_fields";

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
      { key: "width", description: null, control: { kind: "number", is_whole_number: true, minimum: 0, maximum: null }, value: 1280, value_source: "default", is_required: true, is_nullable: false },
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
    fields: [{ key: "fps", description: "Frames a second.", control: { kind: "number", is_whole_number: false, minimum: null, maximum: null }, value: 30, value_source: "config", is_required: false, is_nullable: true }],
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
    ["frames", { kind: "number", is_whole_number: true, minimum: null, maximum: null }],
  ]);
});

test("a_schema_that_closes_an_object_with_no_properties_takes_no_config", () => {
  expect(configFormOf({ type: "object", additionalProperties: false }, {})).toEqual({ kind: "takes_no_config" });
  expect(configFormOf({ type: "object" }, {})).toEqual({ kind: "fields", fields: [] });
});

test("a_value_is_shown_in_words", () => {
  expect(configFormFieldValueWords(null)).toBe("");
  expect(configFormFieldValueWords("fit")).toBe("fit");
  expect(configFormFieldValueWords(12)).toBe("12");
  expect(configFormFieldValueWords({ a: [true] })).toBe('{"a":[true]}');
});

const PYTHON_DERIVED_ALPHA_OVER_SCHEMA = {
  type: "object",
  properties: {
    width: { type: "integer", default: 1920 },
    layers: {
      type: "array",
      items: {
        type: "object",
        properties: { x: { type: "integer", default: 0 }, y: { type: "integer", default: 0 }, opacity: { type: "number", default: 1.0 } },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

test("a_list_of_records_reads_as_its_entries_each_with_its_own_fields_and_a_new_entry_at_the_item_defaults", () => {
  const form = configFormOf(PYTHON_DERIVED_ALPHA_OVER_SCHEMA, { layers: [{}, { x: 640, y: 360, opacity: 0.5 }] });
  const layers = form.kind === "fields" ? form.fields.find((field) => field.key === "layers") : undefined;
  if (layers?.control.kind !== "list_of_records") return expect.unreachable("layers is not a list of records");
  expect(layers.control.new_item).toEqual({ x: 0, y: 0, opacity: 1.0 });
  expect(recordsOfAListField(layers.value)).toEqual([{}, { x: 640, y: 360, opacity: 0.5 }]);

  const secondEntry = configFormOf(layers.control.item_schema, { x: 640, y: 360, opacity: 0.5 });
  expect(secondEntry.kind === "fields" && secondEntry.fields.map((field) => [field.key, field.control.kind, field.value, field.value_source])).toEqual([
    ["x", "number", 640, "config"],
    ["y", "number", 360, "config"],
    ["opacity", "number", 0.5, "config"],
  ]);
  const firstEntry = configFormOf(layers.control.item_schema, {});
  expect(firstEntry.kind === "fields" && firstEntry.fields.map((field) => [field.key, field.value, field.value_source])).toEqual([
    ["x", 0, "default"],
    ["y", 0, "default"],
    ["opacity", 1.0, "default"],
  ]);
});

test("a_list_item_named_by_a_ref_keeps_the_documents_defs_and_a_list_of_plain_values_stays_json", () => {
  const form = configFormOf(
    {
      type: "object",
      properties: { cues: { type: "array", items: { $ref: "#/$defs/Cue" } }, tags: { type: "array", items: { type: "string" } } },
      $defs: { Cue: { type: "object", properties: { fade: { $ref: "#/$defs/Fade" } } }, Fade: { type: "string", enum: ["cut", "dissolve"] } },
    },
    { cues: [{ fade: "cut" }] },
  );
  const [cues, tags] = form.kind === "fields" ? form.fields : [];
  expect(tags?.control.kind).toBe("json");
  if (cues?.control.kind !== "list_of_records") return expect.unreachable("cues is not a list of records");
  const cueForm = configFormOf(cues.control.item_schema, { fade: "cut" });
  expect(cueForm.kind === "fields" && cueForm.fields[0]?.control).toEqual({ kind: "choice", choices: ["cut", "dissolve"] });
  expect(recordsOfAListField(null)).toEqual([]);
});
