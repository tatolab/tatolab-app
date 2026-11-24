import { describe, expect, it } from "vitest";
import type { PinType } from "../pin_types";
import { emblemOfThePinType } from "./port_placeholder";

const bundleOf = (...memberTypes: PinType[]): PinType => ({ type: "bundle", members: memberTypes.map((member_type, index) => ({ name: `m${index}`, member_type })) });

describe("the emblem a port's placeholder draws for its pin type", () => {
  it("is a frame, waves, a grid, units or rows by the type's kind", () => {
    const drawnFor = (pinTypes: PinType[]) => pinTypes.map(emblemOfThePinType);
    expect(drawnFor([{ type: "texture" }])).toEqual(["frame"]);
    expect(drawnFor([{ type: "tensor" }])).toEqual(["grid"]);
    expect(drawnFor([{ type: "encoded_video" }, { type: "encoded_audio" }])).toEqual(["units", "units"]);
    expect(
      drawnFor([{ type: "boolean" }, { type: "integer" }, { type: "float" }, { type: "color" }, { type: "vector", component_count: 3 }, { type: "rectangle" }, { type: "transform" }, { type: "audio" }]),
    ).toEqual(Array(8).fill("waves"));
    expect(drawnFor([{ type: "string" }, { type: "menu", option_names: ["a"] }, { type: "asset" }, { type: "trigger" }])).toEqual(Array(4).fill("rows"));
  });

  it("is a bundle's by what it holds: none for a picture among its members, the grid for tensors alone, else rows", () => {
    expect(emblemOfThePinType(bundleOf({ type: "texture" }, { type: "float" }))).toBeNull();
    expect(emblemOfThePinType(bundleOf({ type: "tensor" }, { type: "tensor" }))).toBe("grid");
    expect(emblemOfThePinType(bundleOf({ type: "float" }, { type: "string" }))).toBe("rows");
  });

  it("is the neutral emblem for no pin type, and for a type no one emblem stands for", () => {
    const neutral: (PinType | null)[] = [
      null,
      { type: "list_of", element_type: { type: "float" } },
      { type: "named", named_pin_type: "nodes.shapes:Shape" },
      { type: "connection", connection_type: "nodes.mixer:Bus" },
      { type: "node_reference" },
      { type: "pin_type_choice" },
    ];
    expect(neutral.map(emblemOfThePinType)).toEqual(Array(6).fill(null));
  });
});
