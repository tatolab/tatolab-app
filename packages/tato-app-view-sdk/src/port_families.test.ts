import { describe, expect, it } from "vitest";
import { familyCarryingAWholeValueOf } from "./port_families.js";
import type { PinType } from "./pin_types.js";

const bundleOf = (...memberTypes: PinType[]): PinType => ({ type: "bundle", members: memberTypes.map((member_type, place) => ({ name: `member_${place}`, member_type })) });

describe("familyCarryingAWholeValueOf", () => {
  it("finds a type that is no bundle on the family its pin's messages belong to", () => {
    expect(familyCarryingAWholeValueOf({ type: "float" })).toBe("channels");
    expect(familyCarryingAWholeValueOf({ type: "texture" })).toBe("image");
    expect(familyCarryingAWholeValueOf({ type: "list_of", element_type: { type: "float" } })).toBeNull();
  });

  it("finds a bundle holding no heavy member, nor Tensors alone, on Records, as the runtime packs it as one map of its members", () => {
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "float" }, { type: "integer" }))).toBe("records");
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "string" }, { type: "list_of", element_type: { type: "float" } }))).toBe("records");
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "float" }, bundleOf({ type: "float" })))).toBe("records");
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "trigger" }, { type: "named", named_pin_type: "nodes.sweep:Sweep" }))).toBe("records");
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "list_of", element_type: { type: "texture" } }))).toBe("records");
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "tensor" }, { type: "float" }))).toBe("records");
    expect(familyCarryingAWholeValueOf(bundleOf())).toBe("records");
  });

  it("finds a bundle of only Tensors on Array, as the runtime packs it as one frame of an attribute for each member", () => {
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "tensor" }))).toBe("array");
    expect(familyCarryingAWholeValueOf(bundleOf({ type: "tensor" }, { type: "tensor" }))).toBe("array");
  });

  it("finds a bundle holding a Texture, Audio or encoded member on no family, as it travels as a Bundle frame", () => {
    for (const heavy of [{ type: "texture" }, { type: "audio" }, { type: "encoded_video" }, { type: "encoded_audio" }] as const) {
      expect(familyCarryingAWholeValueOf(bundleOf({ type: "float" }, heavy))).toBeNull();
      expect(familyCarryingAWholeValueOf(bundleOf({ type: "tensor" }, heavy))).toBeNull();
    }
  });
});
