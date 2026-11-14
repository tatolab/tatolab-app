/** The pin sockets React Flow last measured on a card, as its internal node holds them: `target` the input sockets, `source` the output ones; `undefined` before the card's first measure. */
export type NodeGraphMeasuredPinSockets =
  | {
      source: readonly { id?: string | null }[] | null;
      target: readonly { id?: string | null }[] | null;
    }
  | undefined;

/** Whether React Flow holds no place for one of a card's pin sockets, by their handle ids; React Flow then draws no link to that pin and starts no wire from it, without a word, until the card is measured again. */
export function isAPinSocketOfTheCardUnmeasured(
  measuredPinSockets: NodeGraphMeasuredPinSockets,
  inputSocketIds: readonly string[],
  outputSocketIds: readonly string[],
): boolean {
  if (inputSocketIds.length === 0 && outputSocketIds.length === 0) return false;
  if (measuredPinSockets === undefined) return true;
  const measuredInputIds = new Set((measuredPinSockets.target ?? []).map((socket) => socket.id));
  const measuredOutputIds = new Set((measuredPinSockets.source ?? []).map((socket) => socket.id));
  return inputSocketIds.some((socketId) => !measuredInputIds.has(socketId)) || outputSocketIds.some((socketId) => !measuredOutputIds.has(socketId));
}
