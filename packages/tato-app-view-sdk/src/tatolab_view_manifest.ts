// `tatolab_view.json`, view contract 1.0: what every panel declares, built in or brought by a
// project. This schema is the source of truth; `tatolab_view.schema.json` is written from it, less
// the checks only code can make (a path that stays inside the view's folder), which Studio still
// enforces.

import { z } from "zod";
import { PORT_FAMILIES } from "./port_families.js";
import { jsonValueSchema } from "./studio_readings.js";

/** The view contract this SDK speaks; a manifest built for a later minor, or another major, is refused by name. */
export const VIEW_CONTRACT_SERVED = { major: 1, minor: 0 } as const;

/** Every part of the view contract a sandboxed view may ask for beyond what every view gets; a full-access view has them all. */
export const VIEW_CAPABILITIES = [
  "read.selection",
  "write.selection",
  "read.stream_graph",
  "read.project_assets",
  "write.project_assets",
  "edit.stream_graph",
  "gpu",
  "camera",
  "microphone",
] as const;

/** A part of the view contract a manifest asks for. */
export type ViewCapability = (typeof VIEW_CAPABILITIES)[number];

/** A path inside the view's own folder: relative, with no `..` step, no scheme and no backslash. */
export function isAPathInsideTheViewsFolder(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return path.split("/").every((step) => step !== "" && step !== "." && step !== "..");
}

const pathInsideTheViewsFolderSchema = z
  .string()
  .min(1)
  .refine(isAPathInsideTheViewsFolder, { message: "it is a path inside the view's folder, with no `..` step, scheme or backslash" });

const contractSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/, { message: 'it names the view contract the view was built for, as "1.0"' })
  .refine(
    (contract) => {
      const [major, minor] = contract.split(".").map(Number);
      return major === VIEW_CONTRACT_SERVED.major && minor !== undefined && minor <= VIEW_CONTRACT_SERVED.minor;
    },
    { message: `this Tato Studio serves view contract ${VIEW_CONTRACT_SERVED.major}.${VIEW_CONTRACT_SERVED.minor}` },
  );

const portNameSchema = z.string().regex(/^[a-z_][a-z0-9_]*$/, { message: "a port name is lower-case letters, digits and underscores" });

/** An input or output a `node` view declares, as a node declares a port. */
export const viewDeclaredPortSchema = z.object({
  name: portNameSchema,
  family: z.enum(PORT_FAMILIES),
  description: z.string().optional(),
  /** The lowest and highest value an Array port carries, for a control such as a fader. */
  range: z.tuple([z.number(), z.number()]).refine(([lowest, highest]) => lowest < highest, { message: "a range is [lowest, highest], lowest first" }).optional(),
});
/** An input or output a `node` view declares. */
export type ViewDeclaredPort = z.infer<typeof viewDeclaredPortSchema>;

function portsNamedOnce(ports: readonly ViewDeclaredPort[], context: z.RefinementCtx): void {
  const namesSeen = new Set<string>();
  ports.forEach((port, index) => {
    if (namesSeen.has(port.name)) context.addIssue({ code: "custom", message: `\`${port.name}\` is named twice`, path: [index, "name"] });
    namesSeen.add(port.name);
    if (port.range !== undefined && port.family !== "array") context.addIssue({ code: "custom", message: "only an Array port carries a range", path: [index, "range"] });
  });
}

const declaredPortsSchema = z.array(viewDeclaredPortSchema).superRefine(portsNamedOnce);

const fileExtensionSchema = z.string().regex(/^\.[a-z0-9]+$/, { message: 'an extension is lower case with its dot, as ".glb"' });

const NETWORK_HOST_PATTERN = /^(?=.{1,253}(:|$))[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$/;
const networkHostSchema = z.string().regex(NETWORK_HOST_PATTERN, { message: "a host is a lower-case name, with a port if it needs one, and no scheme or wildcard" });

/** The JSON Schema of what a view's area remembers: an object whose every property gives its `default`. */
export const viewSettingsDeclarationSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.looseObject({ default: jsonValueSchema })),
  additionalProperties: z.boolean().optional(),
});
/** The JSON Schema of what a view's area remembers. */
export type ViewSettingsDeclaration = z.infer<typeof viewSettingsDeclarationSchema>;

/** What `tatolab_view.json` declares, for view contract 1.0. A view's id is never written here: a built-in's is its folder's name, a project's view's its project's name and its folder's. */
export const tatolabViewManifestSchema = z
  .strictObject({
    contract: contractSchema,
    title: z.string().trim().min(1, { message: "it is the name the view-type menu lists" }),
    description: z.string().optional(),
    /** An SVG or PNG inside the view's folder; left out, Studio shows its view icon. */
    icon: pathInsideTheViewsFolderSchema.optional(),
    /** A picture of the view inside its folder, for a listing of views. */
    preview: pathInsideTheViewsFolderSchema.optional(),
    /** The HTML file the view's frame opens on, inside its folder. */
    entry: pathInsideTheViewsFolderSchema,
    /** `area`: a panel with no node, opened from any area. `node`: a panel shown on a node of its type, reading that node's inputs and writing its outputs. */
    placement: z.enum(["area", "node"]),
    inputs: declaredPortsSchema.default([]),
    outputs: declaredPortsSchema.default([]),
    accepts: z.strictObject({ files: z.array(fileExtensionSchema).default([]) }).default({ files: [] }),
    settings: viewSettingsDeclarationSchema.optional(),
    /** `true` runs the view on an opaque origin, served only its `capabilities` and `network`; left out, it runs with full access. */
    sandbox: z.boolean().default(false),
    capabilities: z.array(z.enum(VIEW_CAPABILITIES)).default([]),
    /** The hosts a sandboxed view may reach, which become its frame's `connect-src`. */
    network: z.array(networkHostSchema).default([]),
  })
  .superRefine((manifest, context) => {
    if (manifest.placement === "area" && (manifest.inputs.length > 0 || manifest.outputs.length > 0)) {
      context.addIssue({ code: "custom", message: "an `area` view has no node, so it declares no inputs or outputs; a view with ports has `node` placement", path: ["placement"] });
    }
  });

/** What `tatolab_view.json` declares, defaults filled in. */
export type TatolabViewManifest = z.output<typeof tatolabViewManifestSchema>;

/** A view's manifest as read, or why it cannot open, in words naming the field. */
export type TatolabViewManifestReading = { kind: "read"; manifest: TatolabViewManifest } | { kind: "not_read"; because: string };

function fieldPathWords(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "`tatolab_view.json`";
  return `\`${path.map((step, index) => (typeof step === "number" ? `[${step}]` : `${index === 0 ? "" : "."}${String(step)}`)).join("")}\``;
}

/** `manifestJson`, a view's `tatolab_view.json` as parsed, read against the contract this SDK speaks. */
export function readTatolabViewManifest(manifestJson: unknown): TatolabViewManifestReading {
  const parsed = tatolabViewManifestSchema.safeParse(manifestJson);
  if (parsed.success) return { kind: "read", manifest: { ...parsed.data, capabilities: [...new Set(parsed.data.capabilities)] } };
  const because = parsed.error.issues.map((issue) => `${fieldPathWords(issue.path)}: ${issue.message}.`).join(" ");
  return { kind: "not_read", because };
}

/** The JSON Schema authors' editors check `tatolab_view.json` against, written from the Zod schema. */
export function tatolabViewJsonSchema(): Record<string, unknown> {
  return {
    title: "tatolab_view.json, view contract 1.0",
    ...z.toJSONSchema(tatolabViewManifestSchema, { target: "draft-2020-12", io: "input", unrepresentable: "any" }),
  };
}
