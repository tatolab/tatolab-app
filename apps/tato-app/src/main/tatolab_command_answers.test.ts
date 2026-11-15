import { expect, test } from "vitest";
import { succeeded } from "./result.js";
import { answerTheWindow } from "./tatolab_command_answers.js";

test("an_awaited_command_answers_with_its_works_answer_or_why_it_has_none", async () => {
  expect(await answerTheWindow("read_project_log_records", async () => succeeded(7))).toEqual(succeeded(7));
  const refusal = await answerTheWindow<number>("describe_stream_graph", () => Promise.reject(new Error("the work failed unexpectedly")));
  expect(!refusal.ok && refusal.failure.startsWith("describe_stream_graph ended without an answer"), JSON.stringify(refusal)).toBe(true);
});
