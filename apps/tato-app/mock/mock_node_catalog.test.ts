import { configFormOf } from "@tatolab/tato-app-core-views/config_form_fields";
import { expect, test } from "vitest";
import { MOCK_NODE_CATALOG_ENTRIES } from "./mock_node_catalog";

test("every_mock_catalog_schema_reads_without_a_json_fallback_for_a_declared_key", () => {
  for (const entry of MOCK_NODE_CATALOG_ENTRIES) {
    const form = configFormOf(entry.config_schema, {});
    if (form.kind === "fields") for (const field of form.fields) expect([entry.type, field.key, field.control.kind]).not.toContain("json");
  }
});
