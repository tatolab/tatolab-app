// The words a person types into a Graph Input's field, read as the value `write_graph_input` takes,
// or refused before anything is written.

import { jsonValueSchema, type JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The words typed into a field, read as a value or refused with why. */
export type GraphInputWordsTyped = { kind: "value"; value: JsonValue } | { kind: "not_a_value"; because: string };

/** `words` read as a finite number. */
export function numberFromTheWordsTyped(words: string): GraphInputWordsTyped {
  const typed = Number(words.trim());
  return words.trim() !== "" && Number.isFinite(typed) ? { kind: "value", value: typed } : { kind: "not_a_value", because: `“${words}” isn't a number.` };
}

/** `words` read as JSON. */
export function jsonFromTheWordsTyped(words: string): GraphInputWordsTyped {
  const parsed = jsonValueSchema.safeParse(textParsedAsJson(words));
  return parsed.success ? { kind: "value", value: parsed.data } : { kind: "not_a_value", because: `“${words}” isn't JSON.` };
}

/** `words` parsed as JSON, `undefined` where they don't parse. */
function textParsedAsJson(words: string): unknown {
  try {
    return JSON.parse(words);
  } catch {
    return undefined;
  }
}
