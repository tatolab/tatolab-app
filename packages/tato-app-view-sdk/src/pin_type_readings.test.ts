import { expect, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import { builtInPinTypeNameSchema, declaredPinTypeSchema, pinFlowSchema, pinTypeSchema, type BuiltInPinTypeName, type PinType } from "./pin_type_readings.js";

test("a_pin_type_reads_in_each_form_the_contract_gives_and_nested_types_are_checked_too", () => {
  const aBundleOfAListOfFloats = {
    type: "bundle",
    members: [{ name: "gains", member_type: { type: "list_of", element_type: { type: "float", exact_size: "float32" } }, meaning: null, default_value: [1, 2] }],
  };

  expect(pinTypeSchema.safeParse({ type: "texture", pixel_formats: ["rgba8_unorm", "nv12"] }).success).toBe(true);
  expect(pinTypeSchema.safeParse(aBundleOfAListOfFloats).success).toBe(true);
  expect(pinTypeSchema.safeParse({ type: "pin_type_choice", among: [{ type: "float" }, { type: "integer", exact_size: null }] }).success).toBe(true);
  expect(pinTypeSchema.safeParse({ type: "list_of", element_type: { type: "light_field" } }).success).toBe(false);
});

test("a_pin_type_the_contract_does_not_name_is_refused", () => {
  expect(pinTypeSchema.safeParse({ type: "light_field" }).success).toBe(false);
  expect(pinTypeSchema.safeParse({ type: "texture", pixel_formats: ["rgb565"] }).success).toBe(false);
  expect(pinTypeSchema.safeParse({ type: "float", unit: "Hz" }).success).toBe(false);
  expect(pinTypeSchema.safeParse("float").success).toBe(false);
});

test("a_declared_pin_type_of_a_kind_the_contract_does_not_name_is_refused", () => {
  expect(declaredPinTypeSchema.safeParse({ kind: "is", pin_type: { type: "texture" } }).success).toBe(true);
  expect(declaredPinTypeSchema.safeParse({ kind: "set_by_input", input_name: "format" }).success).toBe(true);
  expect(declaredPinTypeSchema.safeParse({ kind: "maybe", pin_type: { type: "texture" } }).success).toBe(false);
  expect(declaredPinTypeSchema.safeParse({ kind: "is", pin_type: { type: "light_field" } }).success).toBe(false);
});

test("a_flow_the_contract_does_not_name_is_refused", () => {
  expect(["value", "stream", "trigger"].map((flow) => pinFlowSchema.safeParse(flow).success)).toEqual([true, true, true]);
  expect(pinFlowSchema.safeParse("burst").success).toBe(false);
});

test("a_built_in_pin_type_name_reads_as_each_name_the_contract_gives_and_as_no_other", () => {
  expectTypeOf<z.infer<typeof builtInPinTypeNameSchema>>().toEqualTypeOf<BuiltInPinTypeName>();
  expectTypeOf<PinType["type"]>().toEqualTypeOf<BuiltInPinTypeName>();
  expect(builtInPinTypeNameSchema.safeParse("encoded_video").success).toBe(true);
  expect(builtInPinTypeNameSchema.safeParse("light_field").success).toBe(false);
});
