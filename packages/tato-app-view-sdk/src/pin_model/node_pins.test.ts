import { expect, test } from "vitest";
import { nodePinRowKey, nodePinsShown, openBundlesOfTheMetadata, openBundlesWith, pinEndOfTheRowKey, rowKeyOfTheLinkEnd, type NodePin } from "./node_pins.js";

function aPin(name: string, member: string | null, bundle: NodePin["bundle"] = null): NodePin {
  return { name, member, pin: null, family: null, description: null, annotations: {}, stream_facts_words: [], value_address: null, setting: null, takes_a_wire: true, wire: null, link: null, bundle, slot: null };
}

const LEFT = aPin("levels", "left");
const RIGHT = aPin("levels", "right");
const levels = (isOpen: boolean) => aPin("levels", null, { members: [LEFT, RIGHT], is_open: isOpen });

test("an open bundle is followed by a row for each of its members, in the order it declares them, and a closed one by none", () => {
  const gain = aPin("gain", null);
  expect(nodePinsShown([gain, levels(true)])).toEqual([gain, levels(true), LEFT, RIGHT]);
  expect(nodePinsShown([gain, levels(false)])).toEqual([gain, levels(false)]);
});

test("a row's key is its port's name, with its member's after a slash on a member, and reads back as the port and the member", () => {
  expect(nodePinRowKey(levels(true))).toBe("levels");
  expect(nodePinRowKey(LEFT)).toBe("levels/left");
  expect(pinEndOfTheRowKey("levels/left")).toEqual({ name: "levels", member: "left" });
  expect(pinEndOfTheRowKey("levels")).toEqual({ name: "levels", member: null });
});

test("a link to a member is drawn to the member's row while its bundle is open, and to the bundle's row while it is closed", () => {
  expect(rowKeyOfTheLinkEnd([levels(true)], "levels", "right")).toBe("levels/right");
  expect(rowKeyOfTheLinkEnd([levels(false)], "levels", "right")).toBe("levels");
  expect(rowKeyOfTheLinkEnd([levels(true)], "levels", null)).toBe("levels");
  expect(rowKeyOfTheLinkEnd([], "levels", "right")).toBe("levels");
});

test("the bundles a node keeps open are read from its metadata by side, a list of another shape read as none, and one opened or closed is written sorted", () => {
  expect(openBundlesOfTheMetadata({ open_bundles: { inputs: ["levels", 3], outputs: ["meters"] } })).toEqual({ inputs: ["levels"], outputs: ["meters"] });
  expect(openBundlesOfTheMetadata({ open_bundles: "levels" })).toEqual({ inputs: [], outputs: [] });
  expect(openBundlesOfTheMetadata({})).toEqual({ inputs: [], outputs: [] });
  const opened = openBundlesWith({ inputs: ["tone"], outputs: [] }, "input", "levels", true);
  expect(opened).toEqual({ inputs: ["levels", "tone"], outputs: [] });
  expect(openBundlesWith(opened, "input", "tone", false)).toEqual({ inputs: ["levels"], outputs: [] });
});
