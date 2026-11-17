// A pin's type and flow as a view reads them, checked against the forms the runtime's control
// contract gives them. The types are the generated ones `./pin_types` re-exports. Each schema's
// output is inferred from the schema itself, so Studio's main process can check that what it
// decodes and the generated type are each assignable to the other.

import { z } from "zod";
import type { BundleMember, DeclaredPinType, PinFlow, PinType } from "./pin_types.js";

export type { BundleMember, DeclaredPinType, PinFlow, PinType };

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

/** One member of a bundle. */
export const bundleMemberSchema: z.ZodType<BundleMember> = z.strictObject({
  name: z.string(),
  get member_type(): z.ZodType<PinType> {
    return pinTypeSchema;
  },
  meaning: z.string().nullable().optional(),
  default_value: z.unknown().optional(),
});

/** What a port carries, tagged by `type`; a key the contract does not name is refused. */
export const pinTypeSchema = z.discriminatedUnion("type", [
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
    get element_type(): z.ZodType<PinType> {
      return pinTypeSchema;
    },
  }),
  z.strictObject({ type: z.literal("bundle"), members: z.array(bundleMemberSchema) }),
  z.strictObject({ type: z.literal("named"), named_pin_type: z.string() }),
  z.strictObject({ type: z.literal("node_reference"), referenced_node_type: z.string().nullable().optional(), one_referrer_per_referenced_node: z.boolean().optional() }),
  z.strictObject({
    type: z.literal("pin_type_choice"),
    get among(): z.ZodOptional<z.ZodArray<z.ZodType<PinType>>> {
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

/** How a pin's messages are read: one value at a time, as a stream, or as events. */
export const pinFlowSchema = z.enum(["value", "stream", "trigger"]);
