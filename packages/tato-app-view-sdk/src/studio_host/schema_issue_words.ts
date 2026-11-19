// A failed decode as the words a person reads: each issue at the path it sits at, a key the Schema
// does not take named as such.

import { SchemaIssue } from "effect";

/** One way a value does not match: where in the value, and what is wrong there. */
export type IssueAtItsPath = { path: readonly PropertyKey[]; words: string };

const leafIssueWords = SchemaIssue.makeFormatterStandardSchemaV1();

/** Each issue `issue` holds, at its path inside a value that sits at `path`. */
export function issuesAtTheirPaths(issue: SchemaIssue.Issue, path: readonly PropertyKey[] = []): IssueAtItsPath[] {
  switch (issue._tag) {
    case "Pointer":
      return issuesAtTheirPaths(issue.issue, [...path, ...issue.path]);
    case "Composite":
      return issue.issues.flatMap((held) => issuesAtTheirPaths(held, path));
    case "UnexpectedKey":
      return [{ path: path.slice(0, -1), words: `Unrecognized key: ${JSON.stringify(String(path.at(-1)))}` }];
    default:
      return leafIssueWords(issue).issues.map((leaf) => ({ path: [...path, ...(leaf.path ?? []).map((step) => (typeof step === "object" ? step.key : step))], words: leaf.message }));
  }
}
