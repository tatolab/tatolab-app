// The node UI elements the Studio lists, as a view's frame reads them off its port: the listing its
// control table picks each input's control from, checked against the form the SDK states for it.

import { z } from "zod";
import type { NodeUiElementsReading } from "./node_ui/node_ui_elements_listing.js";
import { builtInPinTypeNameSchema } from "./pin_type_readings.js";

/** Every node UI element the Studio lists for the open project, its imports and the Studio itself, as each panel's control table reads them. */
export const nodeUiElementsReadingSchema: z.ZodType<NodeUiElementsReading> = z.object({
  elements: z.array(
    z.object({
      module: z.string(),
      brought_by: z.enum(["studio", "project"]),
      script: z.string(),
      folder_version: z.string(),
      registration: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("control"), type: builtInPinTypeNameSchema, control: z.string().nullable() }),
        z.object({ kind: z.literal("node_body"), node_type: z.string() }),
      ]),
      script_serving: z.discriminatedUnion("kind", [z.object({ kind: z.literal("served"), script_url: z.string() }), z.object({ kind: z.literal("blocked"), findings: z.array(z.string()) })]),
    }),
  ),
});
