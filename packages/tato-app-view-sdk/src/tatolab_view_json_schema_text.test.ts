import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { tatolabViewJsonSchemaText } from "./tatolab_view_json_schema_text.js";

test("the shipped tatolab_view.schema.json is exactly what the Zod schema writes (node scripts/write_tatolab_view_json_schema.mjs)", async () => {
  const shippedText = await readFile(new URL("../tatolab_view.schema.json", import.meta.url), "utf8");
  expect(shippedText).toBe(tatolabViewJsonSchemaText());
});
