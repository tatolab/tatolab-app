import { Result, Schema, SchemaIssue } from "effect";
import { describe, expect, it } from "vitest";
import { contractValue } from "./contract_value.js";

const decodeAnAction = Schema.decodeUnknownResult(contractValue("StreamGraphAction"));
const decodeAMode = Schema.decodeUnknownResult(contractValue("GraphEditMode"));
const issueWords = SchemaIssue.makeFormatterStandardSchemaV1();

/** The words and paths a decode failed with, or `[]` when it decoded. */
function issuesOf(decoded: Result.Result<unknown, Schema.SchemaError>) {
  return Result.isSuccess(decoded) ? [] : issueWords(decoded.failure.issue).issues;
}

const REMOVE_A_NODE = { operation: "remove_node", stream: "ab38b36d-ea2a-4948-bc01-f231ca4fa043", node: "ea646832-0f5f-45f4-bd5c-6b5b50a0b70a" };

describe("a contract type inside a Studio Schema", () => {
  it("takes a value the runtime takes, as it was sent", () => {
    expect(decodeAnAction(REMOVE_A_NODE)).toEqual(Result.succeed(REMOVE_A_NODE));
    expect(decodeAMode("live")).toEqual(Result.succeed("live"));
  });

  it("refuses a key the contract does not name, as the runtime refuses it, at the key", () => {
    expect(issuesOf(decodeAnAction({ ...REMOVE_A_NODE, force: true }))).toEqual([{ path: ["force"], message: "not a StreamGraphAction the runtime takes: the contract names no such field" }]);
  });

  it("refuses a value of another shape with the first reason the runtime client's check gives", () => {
    expect(issuesOf(decodeAnAction({ ...REMOVE_A_NODE, node: 3 }))).toEqual([{ path: ["node"], message: expect.stringContaining("not a StreamGraphAction the runtime takes:") }]);
    expect(issuesOf(decodeAMode("kept"))).toEqual([{ path: [], message: "not a GraphEditMode the runtime takes: matches none of the 2 alternatives the contract allows here" }]);
  });
});
