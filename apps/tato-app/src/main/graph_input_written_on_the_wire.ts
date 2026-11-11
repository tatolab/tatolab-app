// What the runtime's `write_graph_input` answers once a stream's top-level `GraphInput` took a value:
// `{ stream, input, family }`, the family as the runtime spells it (`array`, `channels` or `records`).
// Every other key is ignored.

import { jsonObject, parseJsonOnTheWire, requiredText } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The Input `write_graph_input` handed a value to: the stream's id, the Input's name and the family it carries. */
export interface GraphInputWritten {
  stream: string;
  input: string;
  family: string;
}

/** The Input `write_graph_input` answered with `toolResultText`, or why it could not be read. */
export function graphInputWrittenFromTheWriteGraphInputToolResult(toolResultText: string): Result<GraphInputWritten, string> {
  const written = graphInputWrittenFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return written.ok ? written : failedWith(`the runtime's write_graph_input result could not be read: ${written.failure}`);
}

function graphInputWrittenFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<GraphInputWritten, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the Input written");
  if (!toolResult.ok) return toolResult;
  const stream = requiredText(toolResult.value, "stream");
  if (!stream.ok) return stream;
  const input = requiredText(toolResult.value, "input");
  if (!input.ok) return input;
  const family = requiredText(toolResult.value, "family");
  if (!family.ok) return family;
  return succeeded({ stream: stream.value, input: input.value, family: family.value });
}
