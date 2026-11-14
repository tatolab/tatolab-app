/** The blank target pickers + added to the shown node's ports, which exist only in the window until a port is chosen in one, and the one just added, whose list opens as it appears. */
export interface BlankTargetPickersOfTheNode {
  nodeId: string;
  /** Each port's blank pickers' keys, in the order they were added; a port with none has no entry. */
  keysByPort: ReadonlyMap<string, readonly string[]>;
  justAddedKey: string | null;
}

/** No blank target picker on any node. */
export const NO_BLANK_TARGET_PICKERS: BlankTargetPickersOfTheNode = { nodeId: "", keysByPort: new Map(), justAddedKey: null };

/** The keys of the blank pickers of `nodeId`'s `port`; none once another node is shown. */
export function blankTargetPickerKeysOfThePort(blankPickers: BlankTargetPickersOfTheNode, nodeId: string, port: string): readonly string[] {
  return blankPickers.nodeId === nodeId ? (blankPickers.keysByPort.get(port) ?? []) : [];
}

/** The blank pickers a port shows: an input takes one link, so once the graph links it, a picker left blank by an edit that did not apply is gone. */
export function blankTargetPickerKeysShownOnThePort(direction: "input" | "output", linkedEndCount: number, blankPickerKeys: readonly string[]): readonly string[] {
  return direction === "input" && linkedEndCount > 0 ? [] : blankPickerKeys;
}

/** `blankPickers` with a blank picker `key` added to `nodeId`'s `port`, the pickers of any other node dropped. */
export function withABlankTargetPickerAdded(blankPickers: BlankTargetPickersOfTheNode, nodeId: string, port: string, key: string): BlankTargetPickersOfTheNode {
  const keysByPort = new Map(blankPickers.nodeId === nodeId ? blankPickers.keysByPort : []);
  keysByPort.set(port, [...(keysByPort.get(port) ?? []), key]);
  return { nodeId, keysByPort, justAddedKey: key };
}

/** `blankPickers` without the blank picker `key` of `nodeId`'s `port`. */
export function withoutTheBlankTargetPicker(blankPickers: BlankTargetPickersOfTheNode, nodeId: string, port: string, key: string): BlankTargetPickersOfTheNode {
  if (blankPickers.nodeId !== nodeId) return blankPickers;
  const keysByPort = new Map(blankPickers.keysByPort);
  const keysLeft = (keysByPort.get(port) ?? []).filter((keyOfThePort) => keyOfThePort !== key);
  if (keysLeft.length === 0) keysByPort.delete(port);
  else keysByPort.set(port, keysLeft);
  return { nodeId, keysByPort, justAddedKey: blankPickers.justAddedKey === key ? null : blankPickers.justAddedKey };
}
