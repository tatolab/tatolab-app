import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { tatolabViewJsonSchemaText } from "./tatolab_view_json_schema_text.js";

test("the shipped tatolab_view.schema.json is exactly what the manifest Schema writes (node scripts/write_tatolab_view_json_schema.mjs)", async () => {
  const shippedText = await readFile(new URL("../../tatolab_view.schema.json", import.meta.url), "utf8");
  expect(shippedText).toBe(tatolabViewJsonSchemaText());
});

test("the JSON Schema offers a declared port's `pin_type`, as the contract's own `PinType`, which it carries", () => {
  const jsonSchema = JSON.parse(tatolabViewJsonSchemaText());
  expect(jsonSchema.properties.inputs.items.properties.pin_type).toEqual({ type: "object", allOf: [{ $ref: "#/$defs/PinType" }] });
  expect(jsonSchema.properties.outputs.items.properties.pin_type).toEqual({ type: "object", allOf: [{ $ref: "#/$defs/PinType" }] });
  expect(jsonSchema.$defs.PinType.oneOf.map((alternative: { properties: { type: { const: string } } }) => alternative.properties.type.const)).toContain("texture");
});
