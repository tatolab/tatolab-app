/** A value of the graph document as Inspect's tree shows it: a number keeps the digits the runtime wrote, which a float would round past 2^53. */
export type GraphDocumentValue =
  | { kind: "object"; entries: [string, GraphDocumentValue][] }
  | { kind: "array"; items: GraphDocumentValue[] }
  | { kind: "string"; text: string }
  | { kind: "number"; literal: string }
  | { kind: "literal"; literal: "true" | "false" | "null" };

/** A number as `JSON.parse` met it, kept by its source text. */
class NumberAsTheRuntimeWroteIt {
  constructor(readonly literal: string) {}
}

/** The source text `JSON.parse` hands a reviver beside a primitive, in engines that pass it (Chromium, Node 22). */
interface JsonParseSourceContext {
  source?: string;
}

function graphDocumentValueOf(parsedValue: unknown): GraphDocumentValue {
  if (parsedValue instanceof NumberAsTheRuntimeWroteIt) return { kind: "number", literal: parsedValue.literal };
  if (Array.isArray(parsedValue)) return { kind: "array", items: parsedValue.map(graphDocumentValueOf) };
  if (typeof parsedValue === "string") return { kind: "string", text: parsedValue };
  if (parsedValue === null) return { kind: "literal", literal: "null" };
  if (typeof parsedValue === "boolean") return { kind: "literal", literal: parsedValue ? "true" : "false" };
  if (typeof parsedValue === "object") return { kind: "object", entries: Object.entries(parsedValue).map(([key, value]) => [key, graphDocumentValueOf(value)]) };
  return { kind: "literal", literal: "null" };
}

/** The `graph` document `graphDocumentText` as a tree; `null` when the text is not JSON. */
export function readTheGraphDocument(graphDocumentText: string): GraphDocumentValue | null {
  try {
    const parsedDocument: unknown = JSON.parse(graphDocumentText, (_key: string, value: unknown, context?: JsonParseSourceContext) =>
      typeof value === "number" ? new NumberAsTheRuntimeWroteIt(context?.source ?? String(value)) : value,
    );
    return graphDocumentValueOf(parsedDocument);
  } catch {
    return null;
  }
}

/** One top-level key of the graph document as Inspect's outline lists it. */
export interface GraphDocumentOutlineEntry {
  key: string;
  /** A string's text, a number's digits, a list's count, an object's key count. */
  summary: string;
}

/** The graph document's top-level keys, in its order, each with what it holds in a word. */
export function outlineOfTheGraphDocument(graphDocument: GraphDocumentValue): GraphDocumentOutlineEntry[] {
  if (graphDocument.kind !== "object") return [];
  return graphDocument.entries.map(([key, value]) => {
    switch (value.kind) {
      case "array":
        return { key, summary: String(value.items.length) };
      case "object":
        return { key, summary: String(value.entries.length) };
      case "string":
        return { key, summary: value.text };
      case "number":
      case "literal":
        return { key, summary: value.literal };
    }
  });
}

/** What a run of a JSON line is, which decides its colour. */
export type JsonSyntaxKind = "key" | "string" | "number" | "literal" | "punctuation";

/** A run of one JSON line. */
export interface JsonSyntaxPart {
  text: string;
  kind: JsonSyntaxKind;
}

const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;

/** One line of pretty-printed JSON in its runs; a string followed by a colon is a key. */
export function syntaxPartsOfAJsonLine(jsonLine: string): JsonSyntaxPart[] {
  const parts: JsonSyntaxPart[] = [];
  const addPunctuation = (text: string) => {
    if (text === "") return;
    const previousPart = parts.at(-1);
    if (previousPart?.kind === "punctuation") previousPart.text += text;
    else parts.push({ text, kind: "punctuation" });
  };
  let readUpTo = 0;
  for (const tokenMatch of jsonLine.matchAll(JSON_TOKEN)) {
    const tokenText = tokenMatch[0];
    const tokenStart = tokenMatch.index;
    addPunctuation(jsonLine.slice(readUpTo, tokenStart));
    const isAKey = tokenText.startsWith('"') && /^\s*:/.test(jsonLine.slice(tokenStart + tokenText.length));
    const kind: JsonSyntaxKind = tokenText.startsWith('"') ? (isAKey ? "key" : "string") : /^[-\d]/.test(tokenText) ? "number" : "literal";
    parts.push({ text: tokenText, kind });
    readUpTo = tokenStart + tokenText.length;
  }
  addPunctuation(jsonLine.slice(readUpTo));
  return parts;
}
