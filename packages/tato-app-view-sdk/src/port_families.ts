import type { BuiltInPinTypeName, PinType } from "./pin_types.js";

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
 * The family whose messages carry a pin of each built-in type, which a typed port serves as its family, as the runtime's
 * `PortFamily::carrying` finds it; `null` for a type that takes no wire, a named type, whose bytes belong to no family,
 * and a List or a bundle, whose family follows what it holds: `familyCarryingAWholeValueOf` finds a whole bundle's family.
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

/** The heavy types, which a bundle holds by reference in a Bundle frame, as the runtime's `PinType::is_a_heavy_type` lists them. */
const HEAVY_PIN_TYPES: ReadonlySet<BuiltInPinTypeName> = new Set(["texture", "audio", "encoded_video", "encoded_audio"]);

/** The family of the one message a whole value of `bundle` travels as, as the runtime's `PinType::the_message_a_bundle_travels_as` and `BundleMessage::its_family` find it: none for a Bundle frame, Array for an Array frame of Tensors, Records for a Records map. */
function familyCarryingAWholeBundle(bundle: Extract<PinType, { type: "bundle" }>): PortFamily | null {
  if (bundle.members.some(({ member_type }) => HEAVY_PIN_TYPES.has(member_type.type))) return null;
  if (bundle.members.length > 0 && bundle.members.every(({ member_type }) => member_type.type === "tensor")) return "array";
  return "records";
}

/** The family one message of which carries a whole value of `pinType`, as the runtime's `PortFamily::carrying_a_whole_value_of` finds it: for a bundle the family of the one message it travels as, else the one `FAMILY_CARRYING_A_PIN_OF` names. */
export function familyCarryingAWholeValueOf(pinType: PinType): PortFamily | null {
  return pinType.type === "bundle" ? familyCarryingAWholeBundle(pinType) : FAMILY_CARRYING_A_PIN_OF[pinType.type];
}
