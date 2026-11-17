// A pin's type and flow as a view reads them, in the forms the runtime's control contract gives
// them: a pin type tagged by `type`, a declared pin type tagged by `kind`, and a flow. Studio's main
// process checks that these types and the contract's own are each assignable to the other, so a
// contract that changes them fails Studio's build.

import { z } from "zod";

/** An Integer's exact size. */
export const integerSizeSchema = z.enum(["int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64"]);
/** A Float's exact size. */
export const floatSizeSchema = z.enum(["float32", "float64"]);
/** How many components a Vector holds. */
export const vectorComponentCountSchema = z.enum(["two", "three", "four"]);
/** A pixel format a Texture may carry. */
export const texturePixelFormatSchema = z.enum(["rgba8_unorm", "rgba8_unorm_srgb", "bgra8_unorm", "bgra8_unorm_srgb", "rgba16_float", "rgba32_float", "nv12"]);
/** A kind of asset an Asset pin may name. */
export const projectAssetMediaSchema = z.enum(["image", "video", "audio", "lut", "scene", "stream"]);

/** One member of a bundle: its name, its type, what it means and its default value. */
export interface BundleMember {
  name: string;
  member_type: PinType;
  meaning?: string | null;
  default_value?: unknown;
}

/** What a port carries, as the contract names it; a named type and a bundle are how a project adds its own. */
export type PinType =
  | { type: "boolean" }
  | { type: "integer"; exact_size?: z.infer<typeof integerSizeSchema> | null }
  | { type: "float"; exact_size?: z.infer<typeof floatSizeSchema> | null }
  | { type: "string" }
  | { type: "menu"; option_names: string[] }
  | { type: "color" }
  | { type: "vector"; component_count: z.infer<typeof vectorComponentCountSchema> }
  | { type: "rectangle" }
  | { type: "transform" }
  | { type: "texture"; pixel_formats?: z.infer<typeof texturePixelFormatSchema>[] }
  | { type: "audio" }
  | { type: "encoded_video"; codecs?: string[] }
  | { type: "encoded_audio"; codecs?: string[] }
  | { type: "tensor" }
  | { type: "asset"; media?: z.infer<typeof projectAssetMediaSchema>[] }
  | { type: "trigger" }
  | { type: "list_of"; element_type: PinType }
  | { type: "bundle"; members: BundleMember[] }
  | { type: "named"; named_pin_type: string }
  | { type: "node_reference"; referenced_node_type?: string | null; one_referrer_per_referenced_node?: boolean }
  | { type: "pin_type_choice"; among?: PinType[] };

/** One member of a bundle. */
export const bundleMemberSchema: z.ZodType<BundleMember> = z.strictObject({
  name: z.string(),
  get member_type() {
    return pinTypeSchema;
  },
  meaning: z.string().nullable().optional(),
  default_value: z.unknown().optional(),
});

/** What a port carries, tagged by `type`; a key the contract does not name is refused. */
export const pinTypeSchema: z.ZodType<PinType> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("boolean") }),
  z.strictObject({ type: z.literal("integer"), exact_size: integerSizeSchema.nullable().optional() }),
  z.strictObject({ type: z.literal("float"), exact_size: floatSizeSchema.nullable().optional() }),
  z.strictObject({ type: z.literal("string") }),
  z.strictObject({ type: z.literal("menu"), option_names: z.array(z.string()) }),
  z.strictObject({ type: z.literal("color") }),
  z.strictObject({ type: z.literal("vector"), component_count: vectorComponentCountSchema }),
  z.strictObject({ type: z.literal("rectangle") }),
  z.strictObject({ type: z.literal("transform") }),
  z.strictObject({ type: z.literal("texture"), pixel_formats: z.array(texturePixelFormatSchema).optional() }),
  z.strictObject({ type: z.literal("audio") }),
  z.strictObject({ type: z.literal("encoded_video"), codecs: z.array(z.string()).optional() }),
  z.strictObject({ type: z.literal("encoded_audio"), codecs: z.array(z.string()).optional() }),
  z.strictObject({ type: z.literal("tensor") }),
  z.strictObject({ type: z.literal("asset"), media: z.array(projectAssetMediaSchema).optional() }),
  z.strictObject({ type: z.literal("trigger") }),
  z.strictObject({
    type: z.literal("list_of"),
    get element_type() {
      return pinTypeSchema;
    },
  }),
  z.strictObject({ type: z.literal("bundle"), members: z.array(bundleMemberSchema) }),
  z.strictObject({ type: z.literal("named"), named_pin_type: z.string() }),
  z.strictObject({ type: z.literal("node_reference"), referenced_node_type: z.string().nullable().optional(), one_referrer_per_referenced_node: z.boolean().optional() }),
  z.strictObject({
    type: z.literal("pin_type_choice"),
    get among() {
      return z.array(pinTypeSchema).optional();
    },
  }),
]);

/** How a node type declares a port's type: a type, one of several, any, the type of another input port, or one a setting chooses. */
export const declaredPinTypeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("is"), pin_type: pinTypeSchema }),
  z.strictObject({ kind: z.literal("one_of"), pin_types: z.array(pinTypeSchema) }),
  z.strictObject({ kind: z.literal("any") }),
  z.strictObject({ kind: z.literal("same_as_input"), input_port_name: z.string() }),
  z.strictObject({ kind: z.literal("set_by_input"), input_name: z.string() }),
]);
/** How a node type declares a port's type. */
export type DeclaredPinType = z.infer<typeof declaredPinTypeSchema>;

/** How a pin's messages are read: one value at a time, as a stream, or as events. */
export const pinFlowSchema = z.enum(["value", "stream", "trigger"]);
/** How a pin's messages are read. */
export type PinFlow = z.infer<typeof pinFlowSchema>;
