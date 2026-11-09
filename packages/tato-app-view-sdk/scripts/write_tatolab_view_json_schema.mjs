// Writes tatolab_view.schema.json from the Zod schema in src/tatolab_view_manifest.ts. The SDK's
// tests fail while the committed file differs from what this writes.
//
// Usage: node scripts/write_tatolab_view_json_schema.mjs
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const viewSdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleServer = await createServer({ root: viewSdkRoot, configFile: false, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
try {
  const { tatolabViewJsonSchemaText } = await moduleServer.ssrLoadModule("/src/tatolab_view_json_schema_text.ts");
  await writeFile(path.join(viewSdkRoot, "tatolab_view.schema.json"), tatolabViewJsonSchemaText());
} finally {
  await moduleServer.close();
}
