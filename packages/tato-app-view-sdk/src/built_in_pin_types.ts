// Every built-in pin type as the runtime's control contract lists it, generated into the runtime
// client: its name, the words a person reads it as, and what a pin of it may state. A control that
// offers types names each from this list, so it holds no list of its own, and offers the types a
// Pin type choice offers, named as a person picks them, from here.

import { BUILT_IN_PIN_TYPES } from "@tatolab/runtime-client/pin_types";

export { BUILT_IN_PIN_TYPES };
export type { PinTypeDescription } from "@tatolab/runtime-client/pin_types";
export { entryTheChoiceHolds, isTheEntryHeld, isTheSamePinType, PIN_TYPES_A_CHOICE_OF_ANY_TYPE_OFFERS, pinTypesTheChoiceOffers, type PinTypesTheChoiceOffers } from "./pin_model/pin_type_choice.js";
export { membersOfAnOfferedPinTypeInWords, wordsOfAnOfferedPinType } from "./pin_model/pin_type_words.js";
