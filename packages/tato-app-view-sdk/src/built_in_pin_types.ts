// Every built-in pin type as the runtime's control contract lists it, generated into the runtime
// client: its name, the words a person reads it as, and what a pin of it may state. A control that
// offers types names each from this list, so it holds no list of its own, and offers the types a
// Pin type choice offers from here, as the runtime decides what the choice takes.

import { BUILT_IN_PIN_TYPES } from "@tatolab/runtime-client/pin_types";
import type { BuiltInPinTypeName, PinType } from "@tatolab/runtime-client/pin_types";
import { jsonTextOf } from "./json_text.js";
import { pinTypeWords, wordsOfTheBundleMembers } from "./pin_model/pin_type_words.js";

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

/** An input's declared type when it chooses a pin type. */
export type PinTypeChoice = Extract<PinType, { type: "pin_type_choice" }>;

/**
 * The pin types a Pin type choice offers, each once: every built-in type written by its name alone while it lists none, the
 * entries of its `among` list, or, when it chooses among the bundles its stream declares, the bundles the runtime lists in
 * `among` for the placed node, which are none while the stream declares none.
 */
export interface PinTypesTheChoiceOffers {
  readonly offers: "any_type" | "one_of_its_list" | "the_bundles_its_stream_declares";
  readonly entries: readonly PinType[];
}

/** The pin types `choice` offers, each once. */
export function pinTypesTheChoiceOffers(choice: PinTypeChoice): PinTypesTheChoiceOffers {
  const among = choice.among ?? [];
  const eachOnce = among.filter((pinType, index) => among.findIndex((earlier) => jsonTextOf(earlier) === jsonTextOf(pinType)) === index);
  if (choice.among_the_bundles_its_stream_declares === true) return { offers: "the_bundles_its_stream_declares", entries: eachOnce };
  return among.length === 0 ? { offers: "any_type", entries: PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS } : { offers: "one_of_its_list", entries: eachOnce };
}

/** Whether `held` and `offered` are bundles whose members have the same names and types, in order; a member's default and meaning do not count. */
function hasTheMembersOfTheBundle(held: PinType, offered: PinType): boolean {
  if (held.type !== "bundle" || offered.type !== "bundle" || held.members.length !== offered.members.length) return false;
  return held.members.every((member, index) => member.name === offered.members[index]?.name && jsonTextOf(member.member_type) === jsonTextOf(offered.members[index]?.member_type));
}

/**
 * The pin type a choice offering `offered` takes `held` as, as the runtime checks it; `undefined` for one it does not take.
 * Among a stream's bundles it is the listed bundle of the same members and name, a bundle naming none, as one saved before
 * bundles were named, taken as the listed bundle of its members.
 */
export function pinTypeTheChoiceTakes(offered: PinTypesTheChoiceOffers, held: PinType): PinType | undefined {
  switch (offered.offers) {
    case "any_type":
      return offered.entries.some((entry) => entry.type === held.type) ? held : undefined;
    case "one_of_its_list":
      return offered.entries.find((entry) => jsonTextOf(entry) === jsonTextOf(held));
    case "the_bundles_its_stream_declares":
      return offered.entries.find((entry) => entry.type === "bundle" && held.type === "bundle" && (held.name === null || held.name === undefined || held.name === entry.name) && hasTheMembersOfTheBundle(held, entry));
  }
}

/** The words a person picks `offered`, a type a choice offers, by: a bundle by the class that declares it, any other type as the built-in type list names it. */
export function wordsOfAnOfferedPinType(offered: PinType): string {
  if (offered.type === "bundle") return offered.name === null || offered.name === undefined ? pinTypeWords(offered) : offered.name;
  return BUILT_IN_PIN_TYPES.find((builtInPinType) => builtInPinType.name === offered.type)?.label ?? offered.type;
}

/** The members of `offered`, a type a choice offers, in words, as its entry's tooltip shows them; `undefined` for a type that is no bundle. */
export function membersOfAnOfferedPinTypeInWords(offered: PinType): string | undefined {
  return offered.type === "bundle" ? wordsOfTheBundleMembers(offered) : undefined;
}
