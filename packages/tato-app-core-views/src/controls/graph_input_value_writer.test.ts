import type { ViewAskDone } from "@tatolab/tato-app-view-sdk";
import type { JsonValue } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { GraphInputLatestValueWriter, type GraphInputWriteOutcome } from "./graph_input_value_writer";

/** A writer over a Studio that answers each write only when the test says, recording each value written and each outcome reported. */
function writerOverAStudioThatAnswersLater() {
  const valuesWritten: JsonValue[] = [];
  const answers: ((answer: ViewAskDone) => Promise<void>)[] = [];
  const outcomes: GraphInputWriteOutcome[] = [];
  const writer = new GraphInputLatestValueWriter(
    (value) =>
      new Promise((resolve) => {
        valuesWritten.push(value);
        answers.push(async (answer) => {
          resolve(answer);
          await new Promise((settled) => setTimeout(settled, 0));
        });
      }),
    (outcome) => outcomes.push(outcome),
  );
  const answerTheWrite = (index: number, answer: ViewAskDone) => (answers[index] ?? expect.unreachable(`no write ${index}`))(answer);
  return { writer, valuesWritten, outcomes, answerTheWrite };
}

test("a value moved while a write is in flight waits, only the latest waiting value is written next, only the last write's outcome is reported, and the value last handed is not written again", async () => {
  const { writer, valuesWritten, outcomes, answerTheWrite } = writerOverAStudioThatAnswersLater();

  writer.write(0.1);
  writer.write(0.2);
  writer.write(0.3);
  expect(valuesWritten).toEqual([0.1]);
  await answerTheWrite(0, { kind: "done" });
  expect(valuesWritten).toEqual([0.1, 0.3]);
  expect(outcomes).toEqual([]);
  await answerTheWrite(1, { kind: "done" });
  expect(outcomes).toEqual([{ kind: "written" }]);

  writer.write(0.3);
  expect(valuesWritten).toEqual([0.1, 0.3]);
  writer.write(0.4);
  expect(valuesWritten).toEqual([0.1, 0.3, 0.4]);
});

test("the runtime's refusal of the last write is reported in its own words, and the refused value can be written again", async () => {
  const { writer, valuesWritten, outcomes, answerTheWrite } = writerOverAStudioThatAnswersLater();
  const because = 'write_graph_input failed: Port error: output `value` of node `graphinput` carries Channels, and a Channels value is a number, a bool or `{"samples": [[...], ...], "sample_rate"}`';

  writer.write("bright");
  await answerTheWrite(0, { kind: "refused", because });
  writer.write("bright");

  expect(outcomes).toEqual([{ kind: "refused", because }]);
  expect(valuesWritten).toEqual(["bright", "bright"]);
});
