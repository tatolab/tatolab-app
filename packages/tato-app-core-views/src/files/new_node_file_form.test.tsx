import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { NodeFileCreating } from "@tatolab/tato-app-view-sdk/studio_readings";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import { NewNodeFileForm } from "./new_node_file_form";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const PROJECT_FOLDER = "/home/sam/streams/s07-code";

/** The form drawn over a Studio whose `createNodeFile` answers only when the test says, recording each file asked for and each close and creation the form reports. */
function drawTheFormOverAStudioThatAnswersLater() {
  const filesAskedFor: string[] = [];
  const answers: ((creating: NodeFileCreating) => Promise<void>)[] = [];
  const filesCreated: string[] = [];
  let closes = 0;
  const connection: Pick<TatoAppViewConnection, "createNodeFile"> = {
    createNodeFile: (file) =>
      new Promise((resolve) => {
        filesAskedFor.push(file);
        answers.push((creating) => act(async () => resolve(creating)));
      }),
  };
  const formHolder = document.createElement("div");
  document.body.append(formHolder);
  act(() =>
    createRoot(formHolder).render(
      <NewNodeFileForm
        connection={connection}
        projectFolder={PROJECT_FOLDER}
        onCreated={(file) => filesCreated.push(file)}
        onClosed={() => {
          closes += 1;
        }}
      />,
    ),
  );
  const pathField = (): HTMLInputElement => {
    const field = formHolder.querySelector("input");
    if (field === null) throw new Error("The form drew no path field.");
    return field;
  };
  return {
    formHolder,
    filesAskedFor,
    filesCreated,
    closes: () => closes,
    pathField,
    answerTheLatest: (creating: NodeFileCreating) => {
      const answer = answers.at(-1);
      if (answer === undefined) throw new Error("Studio was asked nothing to answer.");
      return answer(creating);
    },
    type: (typedPath: string) =>
      act(() => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(pathField(), typedPath);
        pathField().dispatchEvent(new Event("input", { bubbles: true }));
      }),
    pressOn: (target: Element, key: string) => act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))),
    button: (action: string): HTMLButtonElement => {
      const button = formHolder.querySelector(`[data-new-node-file-action="${action}"]`);
      if (!(button instanceof HTMLButtonElement)) throw new Error(`The form drew no ${action} button.`);
      return button;
    },
  };
}

test("the form opens on nodes/ with its field focused, and Enter in the field asks Studio for that path inside the open project", async () => {
  const form = drawTheFormOverAStudioThatAnswersLater();

  expect([form.pathField().value, document.activeElement === form.pathField()]).toEqual(["nodes/", true]);
  form.type("nodes/invert.py");
  form.pressOn(form.pathField(), "Enter");
  await form.answerTheLatest({ kind: "created", file: `${PROJECT_FOLDER}/nodes/invert.py`, node_type: "nodes.invert:Invert" });

  expect(form.filesAskedFor).toEqual([`${PROJECT_FOLDER}/nodes/invert.py`]);
  expect(form.filesCreated).toEqual([`${PROJECT_FOLDER}/nodes/invert.py`]);
});

test("a refusal stays in the form in the runtime's own words, and nothing is reported created", async () => {
  const form = drawTheFormOverAStudioThatAnswersLater();
  const refusal = "create_node_file failed: the project already holds `nodes/invert.py`, and a new file is never written over it";

  form.type("nodes/invert.py");
  form.pressOn(form.pathField(), "Enter");
  await form.answerTheLatest({ kind: "not_created", because: refusal });

  expect(form.formHolder.querySelector("[data-new-node-file-refusal]")?.textContent).toContain(refusal);
  expect([form.filesCreated, form.closes()]).toEqual([[], 0]);
});

test("Enter on Cancel creates nothing, an unnamed path asks for nothing, and Escape closes the form only while nothing is being created", async () => {
  const form = drawTheFormOverAStudioThatAnswersLater();

  form.pressOn(form.pathField(), "Enter");
  form.pressOn(form.button("cancel"), "Enter");
  expect(form.filesAskedFor).toEqual([]);

  form.type("nodes/invert.py");
  form.pressOn(form.pathField(), "Enter");
  form.pressOn(form.pathField(), "Escape");
  expect([form.filesAskedFor.length, form.closes()]).toEqual([1, 0]);

  await form.answerTheLatest({ kind: "not_created", because: "the project's history is busy" });
  form.pressOn(form.pathField(), "Escape");
  expect(form.closes()).toBe(1);
});
