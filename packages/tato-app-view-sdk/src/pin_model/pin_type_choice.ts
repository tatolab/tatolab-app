// What a Pin type choice offers, which entry of it a held type is, and the type it stores for a held
// one: every built-in type written by its name alone while its `among` list is empty, each entry of
// that list, or the bundles its stream declares, which the runtime lists for a placed node and which
// may be none. Two types are compared with their absent or null fields left out and in any key order.

import { BUILT_IN_PIN_TYPES } from "@tatolab/runtime-client/pin_types";
import type { BuiltInPinTypeName, PinType } from "@tatolab/runtime-client/pin_types";
import { jsonTextOf } from "../json_text.js";

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

/** The entries a Pin type choice offers, each once, and which of the three kinds of choice it is. */
export interface PinTypesTheChoiceOffers {
  readonly offers: "any_type" | "one_of_its_list" | "the_bundles_its_stream_declares";
  readonly entries: readonly PinType[];
}

/** `value` with each absent or null field of an object left out and its keys sorted, so two writings of one type read the same. */
function normalised(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalised);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== null && field !== undefined)
      .sort(([key], [otherKey]) => (key < otherKey ? -1 : key > otherKey ? 1 : 0))
      .map(([key, field]) => [key, normalised(field)]),
  );
}

/** Whether `pinType` and `other` are one type, their absent and null fields left out and their keys in any order. */
export function isTheSamePinType(pinType: PinType, other: PinType): boolean {
  return jsonTextOf(normalised(pinType)) === jsonTextOf(normalised(other));
}

/** The entries `choice` offers, each once. */
export function pinTypesTheChoiceOffers(choice: PinTypeChoice): PinTypesTheChoiceOffers {
  const among = choice.among ?? [];
  const eachOnce = among.filter((pinType, index) => among.findIndex((earlier) => isTheSamePinType(earlier, pinType)) === index);
  if (choice.among_the_bundles_its_stream_declares === true) return { offers: "the_bundles_its_stream_declares", entries: eachOnce };
  return among.length === 0 ? { offers: "any_type", entries: PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS } : { offers: "one_of_its_list", entries: eachOnce };
}

/** Whether `held` is the bundle `offered`: the same member names and types in order, and the same name unless `held` names none; a member's default and meaning do not count. */
function isTheBundleOffered(held: PinType, offered: PinType): boolean {
  if (held.type !== "bundle" || offered.type !== "bundle" || held.members.length !== offered.members.length) return false;
  if (held.name !== null && held.name !== undefined && held.name !== offered.name) return false;
  return held.members.every((member, index) => {
    const offeredMember = offered.members[index];
    return offeredMember !== undefined && member.name === offeredMember.name && isTheSamePinType(member.member_type, offeredMember.member_type);
  });
}

/** Each entry of `offered` that `held` is: the one of its tag for a choice of any type, else each entry it is the same type or bundle as. */
function entriesTheHeldTypeIs(offered: PinTypesTheChoiceOffers, held: PinType): readonly PinType[] {
  switch (offered.offers) {
    case "any_type":
      return offered.entries.filter((entry) => entry.type === held.type);
    case "one_of_its_list":
      return offered.entries.filter((entry) => isTheSamePinType(entry, held));
    case "the_bundles_its_stream_declares":
      return offered.entries.filter((entry) => isTheBundleOffered(held, entry));
  }
}

/** The one entry of `offered` that `held` is; `undefined` for a type it does not offer, or an unnamed bundle that has the members of several. */
export function entryTheChoiceHolds(offered: PinTypesTheChoiceOffers, held: PinType): PinType | undefined {
  const entries = entriesTheHeldTypeIs(offered, held);
  return entries.length === 1 ? entries[0] : undefined;
}

/** Whether `entry`, one `offered` offers, is the entry `held` is. */
export function isTheEntryHeld(offered: PinTypesTheChoiceOffers, entry: PinType, held: PinType | null): boolean {
  const entryHeld = held === null ? undefined : entryTheChoiceHolds(offered, held);
  return entryHeld !== undefined && isTheSamePinType(entryHeld, entry);
}

/** The type a choice offering `offered` stores for `held`: a choice of any type `held` as the menu offers its tag, else the one entry it is, or an unnamed bundle of several entries' members as it is; `undefined` for a type it does not take. */
export function pinTypeTheChoiceTakes(offered: PinTypesTheChoiceOffers, held: PinType): PinType | undefined {
  const entries = entriesTheHeldTypeIs(offered, held);
  if (entries.length === 0) return undefined;
  return offered.offers === "any_type" || entries.length > 1 ? held : entries[0];
}
