import { expect, test } from "vitest";
import { configFormFieldValueWords, doesTheSettingTakeNull, fieldsOfAListEntry, listOfRecordsOfTheSetting, recordsOfAListField, type JsonObject } from "./config_form_fields";

/** The schema of one record of a list, as the runtime's Rust spells one: a nullable, a default and a choice named by a `$ref`. */
const RUST_SPELLED_RECORD: JsonObject = {
  type: "object",
  properties: {
    title: { description: "The window's title.", type: ["string", "null"] },
    width: { type: "integer", format: "uint32", minimum: 0, default: 1280 },
    scaling: { $ref: "#/$defs/Scaling", description: "How a frame fits the window." },
  },
  required: ["width"],
  $defs: { Scaling: { type: "string", enum: ["fit", "fill", "stretch"] } },
};

test("an_entrys_rust_spelled_schema_reads_its_nullable_its_default_and_its_referenced_choices", () => {
  expect(fieldsOfAListEntry(RUST_SPELLED_RECORD, { scaling: "fill" })).toEqual([
    { key: "title", description: "The window's title.", control: { kind: "text" }, value: null, value_source: "unset", is_required: false, is_nullable: true },
    { key: "width", description: null, control: { kind: "number", is_whole_number: true, minimum: 0, maximum: null }, value: 1280, value_source: "default", is_required: true, is_nullable: false },
    { key: "scaling", description: "How a frame fits the window.", control: { kind: "choice", choices: ["fit", "fill", "stretch"] }, value: "fill", value_source: "config", is_required: false, is_nullable: false },
  ]);
});

test("an_entrys_python_spelled_nullable_reads_as_its_one_other_branch", () => {
  expect(fieldsOfAListEntry({ type: "object", properties: { fps: { anyOf: [{ type: "number" }, { type: "null" }], default: null, description: "Frames a second." } } }, { fps: 30 })).toEqual([
    { key: "fps", description: "Frames a second.", control: { kind: "number", is_whole_number: false, minimum: null, maximum: null }, value: 30, value_source: "config", is_required: false, is_nullable: true },
  ]);
});

test("an_entrys_key_the_schema_does_not_name_is_shown_after_the_ones_it_does_and_a_key_with_no_type_takes_its_control_from_its_value", () => {
  expect(fieldsOfAListEntry({ type: "object", properties: { on: { type: "boolean" }, every: { default: 30 } } }, { on: true, extra: { nested: [1] } }).map((field) => [field.key, field.control.kind, field.value_source])).toEqual([
    ["on", "toggle", "config"],
    ["every", "number", "default"],
    ["extra", "json", "config"],
  ]);
});

test("a_value_is_shown_in_words", () => {
  expect(configFormFieldValueWords(null)).toBe("");
  expect(configFormFieldValueWords("fit")).toBe("fit");
  expect(configFormFieldValueWords(12)).toBe("12");
  expect(configFormFieldValueWords({ a: [true] })).toBe('{"a":[true]}');
});

/** The schema a value set on Alpha Over's `layers` satisfies, as the runtime's Python derives it. */
const PYTHON_DERIVED_LAYERS = {
  type: "array",
  items: {
    type: "object",
    properties: { x: { type: "integer", default: 0 }, y: { type: "integer", default: 0 }, opacity: { type: "number", default: 1.0 } },
    additionalProperties: false,
  },
};

test("a_setting_holding_a_list_of_records_reads_as_its_entries_each_with_its_own_fields_and_a_new_entry_at_the_item_defaults", () => {
  const layers = listOfRecordsOfTheSetting(PYTHON_DERIVED_LAYERS);
  if (layers === null) return expect.unreachable("layers is not a list of records");
  expect(layers.new_item).toEqual({});
  expect(recordsOfAListField([{}, { x: 640, y: 360, opacity: 0.5 }, 3])).toEqual([{}, { x: 640, y: 360, opacity: 0.5 }, {}]);
  expect(fieldsOfAListEntry(layers.item_schema, { x: 640, y: 360, opacity: 0.5 }).map((field) => [field.key, field.control.kind, field.value, field.value_source])).toEqual([
    ["x", "number", 640, "config"],
    ["y", "number", 360, "config"],
    ["opacity", "number", 0.5, "config"],
  ]);
  expect(fieldsOfAListEntry(layers.item_schema, {}).map((field) => [field.key, field.value, field.value_source])).toEqual([
    ["x", 0, "default"],
    ["y", 0, "default"],
    ["opacity", 1.0, "default"],
  ]);
});

test("a_list_item_named_by_a_ref_keeps_the_documents_defs_and_a_setting_holding_anything_else_is_no_list_of_records", () => {
  const cues = listOfRecordsOfTheSetting({ type: "array", items: { $ref: "#/$defs/Cue" }, $defs: { Cue: { type: "object", properties: { fade: { $ref: "#/$defs/Fade" } } }, Fade: { type: "string", enum: ["cut", "dissolve"] } } });
  if (cues === null) return expect.unreachable("cues is not a list of records");
  expect(fieldsOfAListEntry(cues.item_schema, { fade: "cut" })[0]?.control).toEqual({ kind: "choice", choices: ["cut", "dissolve"] });
  expect(listOfRecordsOfTheSetting({ type: "array", items: { type: "string" } })).toBeNull();
  expect(listOfRecordsOfTheSetting({ type: "integer" })).toBeNull();
  expect(listOfRecordsOfTheSetting(undefined)).toBeNull();
  expect(recordsOfAListField(null)).toEqual([]);
});

test("a_new_entry_holds_only_the_required_keys_defaults_and_a_list_nested_in_an_entry_shows_as_json", () => {
  const cues = listOfRecordsOfTheSetting({
    type: "array",
    items: { type: "object", properties: { at: { type: "number", default: 0 }, fade: { type: "string", default: "cut" }, points: { type: "array", items: { type: "object", properties: { x: { type: "number" } } } } }, required: ["fade"] },
  });
  if (cues === null) return expect.unreachable("cues is not a list of records");
  expect(cues.new_item).toEqual({ fade: "cut" });
  expect(fieldsOfAListEntry(cues.item_schema, { fade: "cut" }).map((field) => [field.key, field.control.kind])).toEqual([
    ["at", "number"],
    ["fade", "text"],
    ["points", "json"],
  ]);
});

test("an_entrys_string_key_the_runtime_marks_as_a_project_asset_reads_as_an_asset_picker_of_the_media_it_takes", () => {
  const fields = fieldsOfAListEntry(
    {
      type: "object",
      properties: {
        asset: { type: "string", default: "", "x-tatolab-project-asset": { media: ["image"] } },
        backdrop: { anyOf: [{ type: "string" }, { type: "null" }], default: null, "x-tatolab-project-asset": {} },
        label: { type: "string", default: "" },
      },
      additionalProperties: false,
    },
    { asset: "38ab4435-5f49-4cd1-b60e-f03acf54db34" },
  );
  expect(fields.map((field) => [field.key, field.control, field.is_nullable])).toEqual([
    ["asset", { kind: "project_asset", media_it_takes: ["image"] }, false],
    ["backdrop", { kind: "project_asset", media_it_takes: null }, true],
    ["label", { kind: "text" }, false],
  ]);
});

test("a_setting_takes_null_where_its_schema_spells_a_nullable_either_way", () => {
  expect(doesTheSettingTakeNull({ type: ["string", "null"] })).toBe(true);
  expect(doesTheSettingTakeNull({ anyOf: [{ type: "string" }, { type: "null" }] })).toBe(true);
  expect(doesTheSettingTakeNull({ type: "string" })).toBe(false);
  expect(doesTheSettingTakeNull(undefined)).toBe(false);
});
