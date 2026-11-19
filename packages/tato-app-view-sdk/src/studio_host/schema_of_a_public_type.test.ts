import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vitest";
import type { JsonValue, StudioSelection } from "../studio_readings.js";
import type { DecodesExactly } from "./schema_of_a_public_type.js";
import { jsonValueSchema, studioSelectionSchema } from "./studio_reading_schemas.js";

const portSchema = Schema.Struct({ name: Schema.String, range: Schema.optional(Schema.mutable(Schema.Tuple([Schema.Number, Schema.Number]))) });
type Port = typeof portSchema.Type;

describe("a Studio Schema held to the public type it decodes to", () => {
  it("holds when the two name the same members of the same types", () => {
    expectTypeOf<DecodesExactly<Port, { name: string; range?: [number, number] | undefined }>>().toEqualTypeOf<true>();
    expectTypeOf<DecodesExactly<typeof studioSelectionSchema.Type, StudioSelection>>().toEqualTypeOf<true>();
    expectTypeOf<DecodesExactly<typeof jsonValueSchema.Type, JsonValue>>().toEqualTypeOf<true>();
  });

  it("fails when either side adds a member, even an optional one, at any depth", () => {
    expectTypeOf<DecodesExactly<Port, { name: string; range?: [number, number] | undefined; description?: string }>>().toEqualTypeOf<false>();
    expectTypeOf<DecodesExactly<Port, { name: string }>>().toEqualTypeOf<false>();
    expectTypeOf<DecodesExactly<{ ports: Port[] }, { ports: { name: string; range?: [number, number]; description?: string }[] }>>().toEqualTypeOf<false>();
    expectTypeOf<DecodesExactly<{ kind: "a" } | { kind: "b"; note?: string }, { kind: "a" } | { kind: "b" }>>().toEqualTypeOf<false>();
  });

  it("fails when a member is typed otherwise, or an array is read-only where the public type's is not", () => {
    expectTypeOf<DecodesExactly<{ kind: "a" }, { kind: "a" | "b" }>>().toEqualTypeOf<false>();
    expectTypeOf<DecodesExactly<{ names: readonly string[] }, { names: string[] }>>().toEqualTypeOf<false>();
  });
});
