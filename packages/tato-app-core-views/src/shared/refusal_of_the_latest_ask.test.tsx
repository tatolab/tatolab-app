import type { ViewAskDone } from "@tatolab/tato-app-view-sdk";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { useRefusalOfTheLatestAsk, type RefusalOfTheLatestAsk } from "./refusal_of_the_latest_ask";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function drawTheRefusalOfTheLatestAsk() {
  const drawn: { refusal: RefusalOfTheLatestAsk | null; showTheRefusalOf: (lead: string, asked: Promise<ViewAskDone>) => void } = { refusal: null, showTheRefusalOf: () => undefined };
  function RefusalReader() {
    [drawn.refusal, drawn.showTheRefusalOf] = useRefusalOfTheLatestAsk();
    return null;
  }
  act(() => createRoot(document.createElement("div")).render(<RefusalReader />));
  return drawn;
}

function anAskStudioAnswersLater() {
  let answerTheAsk: (done: ViewAskDone) => void = () => undefined;
  const asked = new Promise<ViewAskDone>((resolve) => (answerTheAsk = resolve));
  return { asked, answer: (done: ViewAskDone) => act(async () => answerTheAsk(done)) };
}

test("a refused ask shows Studio's words, and a later ask that is done clears them", async () => {
  const drawn = drawTheRefusalOfTheLatestAsk();
  const refusedSelect = anAskStudioAnswersLater();
  act(() => drawn.showTheRefusalOf("Didn't select:", refusedSelect.asked));
  await refusedSelect.answer({ kind: "refused", because: "The stream is gone." });
  expect(drawn.refusal).toEqual({ lead: "Didn't select:", because: "The stream is gone." });

  const doneSelect = anAskStudioAnswersLater();
  act(() => drawn.showTheRefusalOf("Didn't select:", doneSelect.asked));
  await doneSelect.answer({ kind: "done" });
  expect(drawn.refusal).toBeNull();
});

test("an earlier ask's refusal arriving after a later ask was sent changes nothing", async () => {
  const drawn = drawTheRefusalOfTheLatestAsk();
  const earlierAsk = anAskStudioAnswersLater();
  const laterAsk = anAskStudioAnswersLater();
  act(() => drawn.showTheRefusalOf("Didn't select:", earlierAsk.asked));
  act(() => drawn.showTheRefusalOf("Didn't open the file:", laterAsk.asked));
  await laterAsk.answer({ kind: "done" });
  await earlierAsk.answer({ kind: "refused", because: "Too late." });
  expect(drawn.refusal).toBeNull();
});
