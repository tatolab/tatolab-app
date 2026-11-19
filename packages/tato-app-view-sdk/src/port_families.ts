import type { BuiltInPinTypeName } from "./pin_types.js";

/** The five families a runtime port carries, each one engine-owned memory layout, as streamlib's plan names them. */
export const PORT_FAMILIES = ["image", "array", "channels", "packets", "records"] as const;

/** One of the five port families. */
export type PortFamily = (typeof PORT_FAMILIES)[number];

const PORT_FAMILY_WORDS: Record<PortFamily, string> = { image: "Image", array: "Array", channels: "Channels", packets: "Packets", records: "Records" };

/** A family's name as Properties and the Library write it beside a port. */
export function portFamilyWords(family: PortFamily): string {
  return PORT_FAMILY_WORDS[family];
}

/**
 * The family whose messages carry a pin of each built-in type, as the runtime finds it for a typed port; `null` for a type
 * no family's message carries alone: a List, a bundle, a named type, a node reference and a pin type choice.
 */
export const FAMILY_CARRYING_A_PIN_OF: Readonly<Record<BuiltInPinTypeName, PortFamily | null>> = {
  boolean: "channels",
  integer: "channels",
  float: "channels",
  color: "channels",
  vector: "channels",
  rectangle: "channels",
  transform: "channels",
  audio: "channels",
  texture: "image",
  encoded_video: "packets",
  encoded_audio: "packets",
  tensor: "array",
  string: "records",
  menu: "records",
  asset: "records",
  trigger: "records",
  list_of: null,
  bundle: null,
  named: null,
  node_reference: null,
  pin_type_choice: null,
};
