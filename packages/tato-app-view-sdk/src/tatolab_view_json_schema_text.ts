import { tatolabViewJsonSchema } from "./tatolab_view_manifest.js";

/** `tatolab_view.schema.json`'s text, exactly as the SDK ships it. */
export function tatolabViewJsonSchemaText(): string {
  return `${JSON.stringify(tatolabViewJsonSchema(), null, 2)}\n`;
}
