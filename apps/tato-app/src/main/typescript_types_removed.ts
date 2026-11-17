// A project's `.ts` file as the JavaScript a page runs: Node's `stripTypeScriptTypes` blanks every
// type where it stands, so each line and column stays where the author wrote it and an error in a
// page names the author's own line with no source map. It refuses what only a compiler can turn into
// JavaScript (an `enum`, a parameter property, a namespace) and JSX.

import { stripTypeScriptTypes } from "node:module";
import { Data, Effect } from "effect";
import { describeCaughtFailure } from "./result.js";

/** The types of the project file at `path_in_the_project` could not be removed, on `line` when Node names one; `words` say which file, where and why. */
export class TypeScriptTypesNotRemoved extends Data.TaggedError("TypeScriptTypesNotRemoved")<{
  readonly path_in_the_project: string;
  readonly line: number | null;
  readonly words: string;
}> {}

/**
 * The line Node's refusal names. Its message holds only the reason; the line sits in the stack's first line, which Node
 * writes as `<source url>:<line>` above the refused line of source.
 */
function lineTheRefusalNames(refusal: unknown): number | null {
  if (!(refusal instanceof Error) || refusal.stack === undefined) return null;
  const lineNamed = /^[^\n]*:(\d+)\n/.exec(refusal.stack)?.[1];
  return lineNamed === undefined ? null : Number(lineNamed);
}

const UTF8_TEXT = new TextDecoder("utf-8", { fatal: true });

/** The project file at `pathInTheProject`, whose bytes are `typeScriptBytes`, as JavaScript with its types removed. */
export function typeScriptWithItsTypesRemoved(pathInTheProject: string, typeScriptBytes: Uint8Array): Effect.Effect<string, TypeScriptTypesNotRemoved> {
  return Effect.try({
    try: () => UTF8_TEXT.decode(typeScriptBytes),
    catch: () => new TypeScriptTypesNotRemoved({ path_in_the_project: pathInTheProject, line: null, words: `${pathInTheProject} is not UTF-8 text.` }),
  }).pipe(
    Effect.flatMap((typeScriptText) =>
      Effect.try({
        try: () => stripTypeScriptTypes(typeScriptText, { mode: "strip" }),
        catch: (refusal) => {
          const line = lineTheRefusalNames(refusal);
          return new TypeScriptTypesNotRemoved({
            path_in_the_project: pathInTheProject,
            line,
            words: `${pathInTheProject}${line === null ? "" : `, line ${line}`}: ${describeCaughtFailure(refusal)}`,
          });
        },
      }),
    ),
  );
}
