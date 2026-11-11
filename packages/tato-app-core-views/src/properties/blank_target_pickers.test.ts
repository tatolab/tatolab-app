import { expect, test } from "vitest";
import { blankTargetPickerKeysOfThePort, NO_BLANK_TARGET_PICKERS, withABlankTargetPickerAdded, withoutTheBlankTargetPicker } from "./blank_target_pickers";

test("a blank picker belongs to the node it was added on, and only the latest added opens at first", () => {
  const onA = withABlankTargetPickerAdded(withABlankTargetPickerAdded(NO_BLANK_TARGET_PICKERS, "node-a", "video", "k1"), "node-a", "video", "k2");
  expect(blankTargetPickerKeysOfThePort(onA, "node-a", "video")).toEqual(["k1", "k2"]);
  expect(onA.justAddedKey).toBe("k2");
  expect(blankTargetPickerKeysOfThePort(onA, "node-b", "video")).toEqual([]);

  const onB = withABlankTargetPickerAdded(onA, "node-b", "level", "k3");
  expect(blankTargetPickerKeysOfThePort(onB, "node-a", "video")).toEqual([]);
  expect(blankTargetPickerKeysOfThePort(onB, "node-b", "level")).toEqual(["k3"]);
});

test("removing a port's last blank picker drops its entry and the just-added mark", () => {
  const added = withABlankTargetPickerAdded(NO_BLANK_TARGET_PICKERS, "node-a", "video", "k1");
  const removed = withoutTheBlankTargetPicker(added, "node-a", "video", "k1");
  expect(removed.keysByPort.size).toBe(0);
  expect(removed.justAddedKey).toBeNull();
  expect(withoutTheBlankTargetPicker(added, "node-b", "video", "k1")).toBe(added);
});
