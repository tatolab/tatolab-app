// Every Schema on the Studio's side decodes to a type the SDK's public side declares, and is held to
// it here, so the two are one description that cannot drift.

import type { Schema } from "effect";

/** Every key of any member of `Type`. */
type KeysOfAnyMember<Type> = Type extends unknown ? keyof Type : never;

/** The type at `Key` of any member of `Type` that has it, `undefined` aside. */
type TypeAtKey<Type, Key extends PropertyKey> = Exclude<Type extends unknown ? (Key extends keyof Type ? Type[Key] : never) : never, undefined>;

/** The members of `Type` that hold named keys: objects that are not arrays. */
type ObjectMembers<Type> = Exclude<Extract<Type, object>, ReadonlyArray<unknown>>;

/** The elements of the members of `Type` that are arrays. */
type ArrayElements<Type> = Type extends ReadonlyArray<infer Element> ? Element : never;

/** How many levels deep keys are compared: deeper than any reading, and short of where a recursive type such as JSON would loop. */
type DepthsCompared = [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];

/**
 * `true` when `Decoded` and `Public` name the same keys, member by member and level by level, inside arrays too,
 * optional keys included, which assignability alone lets differ. An index signature ends the comparison, as a record
 * names no keys.
 */
type NamesTheSameKeys<Decoded, Public, Depth extends unknown[] = []> = Depth extends DepthsCompared
  ? true
  : [ArrayElements<Decoded>] extends [never]
    ? ObjectsNameTheSameKeys<Decoded, Public, Depth>
    : [ArrayElements<Public>] extends [never]
      ? false
      : NamesTheSameKeys<ArrayElements<Decoded>, ArrayElements<Public>, [...Depth, unknown]> extends true
        ? ObjectsNameTheSameKeys<Decoded, Public, Depth>
        : false;

/** `true` when the object members of `Decoded` and `Public` name the same keys, and each key's types do in turn. */
type ObjectsNameTheSameKeys<Decoded, Public, Depth extends unknown[]> = [ObjectMembers<Decoded>] extends [never]
  ? true
  : string extends KeysOfAnyMember<ObjectMembers<Public>>
    ? true
    : [Exclude<KeysOfAnyMember<ObjectMembers<Decoded>>, KeysOfAnyMember<ObjectMembers<Public>>> | Exclude<KeysOfAnyMember<ObjectMembers<Public>>, KeysOfAnyMember<ObjectMembers<Decoded>>>] extends [never]
      ? false extends { [Key in KeysOfAnyMember<ObjectMembers<Decoded>>]: NamesTheSameKeys<TypeAtKey<ObjectMembers<Decoded>, Key>, TypeAtKey<ObjectMembers<Public>, Key>, [...Depth, unknown]> }[KeysOfAnyMember<ObjectMembers<Decoded>>]
        ? false
        : true
      : false;

/** `true` when `Decoded` and `Public` are each assignable to the other and name the same keys. */
export type DecodesExactly<Decoded, Public> = [Decoded] extends [Public] ? ([Public] extends [Decoded] ? NamesTheSameKeys<Decoded, Public> : false) : false;

/**
 * `schema`, held to decode to exactly `Public`: a member the Schema or the public type adds, drops or types otherwise
 * makes the call a compile error.
 */
export function schemaOfThePublicType<Public>() {
  return <DecodingSchema extends Schema.Decoder<Public>>(schema: DecodingSchema & (DecodesExactly<DecodingSchema["Type"], Public> extends true ? unknown : never)): DecodingSchema => schema;
}
