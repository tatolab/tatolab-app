// A pin's type and flow as a person reads them off the pin itself: the key that picks its socket's
// colour, the plain words its tooltip names it by, and the words for how its messages are read.

import type { PinFlow, PinType } from "../pin_type_readings.js";
import type { StreamGraphPortPin } from "../studio_readings.js";

/** Every key a socket's colour is picked by, `untyped` for a pin with no exact type. */
export const PIN_TYPE_KEYS = [
  "boolean",
  "integer",
  "float",
  "string",
  "menu",
  "color",
  "vector",
  "rectangle",
  "transform",
  "texture",
  "audio",
  "encoded_video",
  "encoded_audio",
  "tensor",
  "asset",
  "trigger",
  "bundle",
  "named",
  "node_reference",
  "pin_type_choice",
  "untyped",
] as const;

/** The key a socket's colour is picked by. */
export type PinTypeKey = (typeof PIN_TYPE_KEYS)[number];

/** The key of `pinType`: its own tag, a List taking its element's. */
function keyOfThePinType(pinType: PinType): Exclude<PinTypeKey, "untyped"> {
  return pinType.type === "list_of" ? keyOfThePinType(pinType.element_type) : pinType.type;
}

/** The key that picks the colour of the socket of `pin`; `untyped` for a pin with no exact type. */
export function pinTypeKey(pin: StreamGraphPortPin | null): PinTypeKey {
  return pin === null ? "untyped" : keyOfThePinType(pin.pin_type);
}

const INTEGER_SIZE_WORDS: Record<NonNullable<Extract<PinType, { type: "integer" }>["exact_size"]>, string> = {
  int8: "8-bit",
  int16: "16-bit",
  int32: "32-bit",
  int64: "64-bit",
  uint8: "unsigned 8-bit",
  uint16: "unsigned 16-bit",
  uint32: "unsigned 32-bit",
  uint64: "unsigned 64-bit",
};

const FLOAT_SIZE_WORDS: Record<NonNullable<Extract<PinType, { type: "float" }>["exact_size"]>, string> = { float32: "32-bit", float64: "64-bit" };

const VECTOR_COMPONENT_WORDS: Record<Extract<PinType, { type: "vector" }>["component_count"], string> = { two: "2 components", three: "3 components", four: "4 components" };

/** A codec as people write it, for the spellings the runtime is known to use; any other as it is spelled. */
const CODEC_WORDS: Readonly<Record<string, string>> = { h264: "H.264", h265: "H.265", hevc: "H.265", av1: "AV1", vp8: "VP8", vp9: "VP9", opus: "Opus", aac: "AAC", flac: "FLAC" };

/** `words`, then `qualifier` after a middle dot when there is one. */
const qualified = (words: string, qualifier: string | null): string => (qualifier === null || qualifier === "" ? words : `${words} · ${qualifier}`);

/** `codecs` in words, joined by "or"; `null` for none, which takes any. */
function codecWords(codecs: readonly string[] | undefined): string | null {
  if (codecs === undefined || codecs.length === 0) return null;
  return codecs.map((codec) => CODEC_WORDS[codec.toLowerCase()] ?? codec).join(" or ");
}

/** `pinType` in plain words, as a pin's tooltip names it: "Texture", "List of Rectangle", "Encoded video · H.264". */
export function pinTypeWords(pinType: PinType): string {
  switch (pinType.type) {
    case "boolean":
      return "Boolean";
    case "integer":
      return qualified("Integer", pinType.exact_size === null || pinType.exact_size === undefined ? null : INTEGER_SIZE_WORDS[pinType.exact_size]);
    case "float":
      return qualified("Float", pinType.exact_size === null || pinType.exact_size === undefined ? null : FLOAT_SIZE_WORDS[pinType.exact_size]);
    case "string":
      return "String";
    case "menu":
      return qualified("Menu", pinType.option_names.join(", "));
    case "color":
      return "Color";
    case "vector":
      return qualified("Vector", VECTOR_COMPONENT_WORDS[pinType.component_count]);
    case "rectangle":
      return "Rectangle";
    case "transform":
      return "Transform";
    case "texture":
      return "Texture";
    case "audio":
      return "Audio";
    case "encoded_video":
      return qualified("Encoded video", codecWords(pinType.codecs));
    case "encoded_audio":
      return qualified("Encoded audio", codecWords(pinType.codecs));
    case "tensor":
      return "Tensor";
    case "asset":
      return qualified("Asset", pinType.media === undefined ? null : pinType.media.join(" or "));
    case "trigger":
      return "Trigger";
    case "list_of":
      return `List of ${pinTypeWords(pinType.element_type)}`;
    case "bundle":
      return qualified("Bundle", pinType.members.map((member) => member.name).join(", "));
    case "named":
      return pinType.named_pin_type;
    case "node_reference":
      return qualified("Node reference", pinType.referenced_node_type ?? null);
    case "pin_type_choice":
      return "Pin type";
  }
}

const PIN_FLOW_WORDS: Record<PinFlow, string> = { value: "one value at a time", stream: "a stream", trigger: "fires" };

/** What a pin is in words: its type and how its messages are read, as "Float, one value at a time"; "No exact type" for a pin with none. */
export function pinWords(pin: StreamGraphPortPin | null): string {
  if (pin === null) return "No exact type";
  if (pin.flow === "trigger" && pin.pin_type.type === "trigger") return pinTypeWords(pin.pin_type);
  return `${pinTypeWords(pin.pin_type)}, ${PIN_FLOW_WORDS[pin.flow]}`;
}
