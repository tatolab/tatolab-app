// What the mock runtime announces of a transaction that sets input values: for each input it set in
// a stream the window follows, what that input reads now, as `input_value_changed` carries it.

import { inputValueReadOfThePort, memberValueReadsOfThePort, type StreamGraph, type StreamGraphAction, type StreamGraphInputValueChange } from "../src/shared/tatolab_backend_contract";
import type { MockStreamGraphTarget } from "./mock_graph_transactions";

/** A change of what one input reads, in the stream `stream_id`. */
export interface MockInputValueChanged {
  readonly stream_id: string;
  readonly change: StreamGraphInputValueChange;
}

/** What each input, or member of a bundle input, `actions` set reads now, in the graph `followedGraphOf` renders of each followed stream a target of the open project names; nothing for a stream not followed. */
export function inputValuesChangedBy(actions: readonly StreamGraphAction[], graphTargets: ReadonlyMap<string, MockStreamGraphTarget>, followedGraphOf: (streamId: string) => StreamGraph | null): MockInputValueChanged[] {
  return actions.flatMap((action) => {
    if (action.operation !== "set_node_input_value") return [];
    const streamId = graphTargets.get(action.stream)?.stream_id;
    const graph = streamId === undefined ? null : followedGraphOf(streamId);
    const node = graph?.nodes.find((candidate) => candidate.id === action.node || candidate.name === action.node);
    const port = node?.ports.inputs.find((input) => input.name === action.input);
    const member = action.member ?? null;
    const valueRead = port === undefined ? null : member === null ? inputValueReadOfThePort(port) : (memberValueReadsOfThePort(port).find((row) => row.member === member)?.value_read ?? null);
    return streamId === undefined || node === undefined || valueRead === null ? [] : [{ stream_id: streamId, change: { node: node.id, input: action.input, member, value_read: valueRead } }];
  });
}
