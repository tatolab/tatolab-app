// Every built-in pin type as the runtime's control contract lists it, generated into the runtime
// client: its name, the words a person reads it as, and what a pin of it may state. A control that
// offers types names each from this list, so it holds no list of its own, and offers the types a
// choice of any type offers from here.

import { BUILT_IN_PIN_TYPES } from "@tatolab/runtime-client/pin_types";
import type { BuiltInPinTypeName, PinType } from "@tatolab/runtime-client/pin_types";

export { BUILT_IN_PIN_TYPES };
export type { PinTypeDescription } from "@tatolab/runtime-client/pin_types";

/** The type `typeName` names when written with nothing else, `null` for one that states more, as a Menu its options; a type choice chooses the type of pins that carry messages, so it never offers itself. */
function pinTypeOfItsNameAlone(typeName: BuiltInPinTypeName): PinType | null {
  switch (typeName) {
    case "boolean":
    case "integer":
    case "float":
    case "string":
    case "color":
    case "rectangle":
    case "transform":
    case "texture":
    case "audio":
    case "encoded_video":
    case "encoded_audio":
    case "tensor":
    case "asset":
    case "trigger":
    case "node_reference":
      return { type: typeName };
    case "menu":
    case "vector":
    case "list_of":
    case "bundle":
    case "named":
    case "connection":
    case "pin_type_choice":
      return null;
  }
}

/** Every type a Pin type choice with an empty `among` list offers: each built-in type written by its name alone, in the contract's order. */
export const PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS: readonly PinType[] = BUILT_IN_PIN_TYPES.flatMap((builtInPinType) => pinTypeOfItsNameAlone(builtInPinType.name) ?? []);
