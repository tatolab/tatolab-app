import { expect, test } from "vitest";
import { valueAddressOfTheInput, valueAddressOfTheMember, type GraphAddress } from "./node_inputs.js";

const MAIN: GraphAddress = { project_folder: "/projects/demo", stream_asset: "11111111-2222-3333-4444-555555555555", level: [] };

test("an input is set where it holds a value of its own, and an unlinked Trigger, which holds none, where it is fired", () => {
  expect(valueAddressOfTheInput(MAIN, "BEAT-ID", { name: "gain", flow: "value", value: 0.5, value_comes_from: "saved" })).toEqual({ graph: MAIN, node_id: "BEAT-ID", input: "gain", member: null });
  expect(valueAddressOfTheInput(MAIN, "FLASH-ID", { name: "flash", flow: "trigger" })).toEqual({ graph: MAIN, node_id: "FLASH-ID", input: "flash", member: null });
});

test("an input a link feeds, one that takes no stored value and is no Trigger, and any outside a known stream's graph are set nowhere", () => {
  expect(valueAddressOfTheInput(MAIN, "BEAT-ID", { name: "gain", flow: "value", value_comes_from: "wire" })).toBeNull();
  expect(valueAddressOfTheInput(MAIN, "FLASH-ID", { name: "flash", flow: "trigger", value_comes_from: "wire" })).toBeNull();
  expect(valueAddressOfTheInput(MAIN, "GLOW-ID", { name: "image", flow: "stream" })).toBeNull();
  expect(valueAddressOfTheInput(null, "FLASH-ID", { name: "flash", flow: "trigger" })).toBeNull();
});

test("a member of a bundle input is set at its own address where it holds a value of its own, nowhere where a link feeds it or nothing reads it, and outside a known stream's graph nowhere", () => {
  expect(valueAddressOfTheMember(MAIN, "MIX-ID", "levels", "left", { value: 0.25, comes_from: "saved" })).toEqual({ graph: MAIN, node_id: "MIX-ID", input: "levels", member: "left" });
  expect(valueAddressOfTheMember(MAIN, "MIX-ID", "levels", "left", { value: null, comes_from: "wire" })).toBeNull();
  expect(valueAddressOfTheMember(MAIN, "MIX-ID", "levels", "left", null)).toBeNull();
  expect(valueAddressOfTheMember(null, "MIX-ID", "levels", "left", { value: 0.25, comes_from: "saved" })).toBeNull();
});
