import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import StringCode from "../node_ui/string_code.ts";
import { eventsFiredBy, NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

/** The props the control hands the design system's code editor, kept from its latest draw. */
interface EditorPropsDrawn {
  documentKey: string;
  language: string;
  text: string;
  isReadOnly: boolean;
  onTextEdited(text: string): void;
  onSaveAsked(): void;
}

const editor = vi.hoisted(() => ({ latest: null as EditorPropsDrawn | null, forgotten: [] as string[] }));

// Monaco draws nothing in a test page, so the editor is a focusable stand-in that keeps what it was handed.
vi.mock("@tatolab/tato-app-view-sdk/design_system/code_text_editor", async () => {
  const { createElement } = await import("react");
  return {
    CodeTextEditor: (props: EditorPropsDrawn) => {
      editor.latest = props;
      return createElement("textarea", { "data-code-editor": "", value: props.text, readOnly: props.isReadOnly, onChange: () => undefined });
    },
    forgetCodeEditorDocument: (documentKey: string) => editor.forgotten.push(documentKey),
  };
});

customElements.define("tato-studio-string_code-test", StringCode);

function mountedCode(value: string, state: InputControlState = "editable"): StringCode {
  const control = new StringCode();
  const pin: ControlledPin<"string"> = { declaration: { input_name: "expression", label: "Expression", pin_type: { type: "string" }, annotations: { control: "code" }, may_be_unset: false }, surface: "properties", studio: NO_STUDIO_CALLS };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** The editor's props once it has drawn `text`. */
async function editorShowing(text: string): Promise<EditorPropsDrawn> {
  return vi.waitFor(() => {
    const latest = editor.latest;
    if (latest?.text !== text) throw new Error(`the editor shows ${latest?.text ?? "nothing"}, not ${text}`);
    return latest;
  });
}

/** The stand-in editor's field, focused as a person's click focuses it. */
async function focusedEditorOf(control: StringCode): Promise<HTMLTextAreaElement> {
  const field = await vi.waitFor(() => {
    const drawn = control.querySelector<HTMLTextAreaElement>("[data-code-editor]");
    if (drawn === null) throw new Error("the control draws no editor yet");
    return drawn;
  });
  field.focus();
  return field;
}

afterEach(() => {
  document.body.replaceChildren();
  editor.latest = null;
  editor.forgotten = [];
});

describe("the String code editor", () => {
  it("is the class the Studio registers as the code control of a String input", () => {
    expectTypeOf(StringCode).toExtend<InputControlElementClass<"string">>();
  });

  it("draws the design system's editor in plain text with the String's words, at the surface's height, named by the input's label", async () => {
    const control = mountedCode("a + b");
    const drawn = await editorShowing("a + b");
    expect(drawn.language).toBe("plaintext");
    expect(drawn.isReadOnly).toBe(false);
    expect(drawn.documentKey).toMatch(/^\/tatolab-input-control\/expression-.+\.txt$/);
    const part = control.querySelector<HTMLElement>(".code-control");
    expect(part?.style.height).toBe("140px");
    expect(part?.getAttribute("aria-label")).toBe("Expression");
  });

  it("fires each edit as input, and the text left by leaving the editor as one change", async () => {
    const control = mountedCode("a");
    const fired = eventsFiredBy(control);
    const field = await focusedEditorOf(control);
    (await editorShowing("a")).onTextEdited("a +");
    (await editorShowing("a +")).onTextEdited("a + b");
    field.blur();
    expect(fired).toEqual([
      { name: "input", value: "a +" },
      { name: "input", value: "a + b" },
      { name: "change", value: "a + b" },
    ]);
  });

  it("commits once at a save and leaves nothing to commit on leaving after", async () => {
    const control = mountedCode("x");
    const fired = eventsFiredBy(control);
    const field = await focusedEditorOf(control);
    (await editorShowing("x")).onTextEdited("x * 2");
    (await editorShowing("x * 2")).onSaveAsked();
    field.blur();
    expect(fired).toEqual([
      { name: "input", value: "x * 2" },
      { name: "change", value: "x * 2" },
    ]);
  });

  it("keeps the text being edited when the host sets a value, and shows it once the editor is left with nothing edited", async () => {
    const control = mountedCode("first");
    const fired = eventsFiredBy(control);
    const field = await focusedEditorOf(control);
    control.value = "from the host";
    await editorShowing("first");
    field.blur();
    await editorShowing("from the host");
    expect(fired).toEqual([]);
  });

  it("is read only while the input is not editable, puts back the text being edited, and fires nothing", async () => {
    const control = mountedCode("kept");
    const fired = eventsFiredBy(control);
    const field = await focusedEditorOf(control);
    (await editorShowing("kept")).onTextEdited("dropped");
    await editorShowing("dropped");
    control.state = "read_only";
    const drawn = await editorShowing("kept");
    expect(drawn.isReadOnly).toBe(true);
    drawn.onTextEdited("ignored");
    field.blur();
    expect(fired).toEqual([{ name: "input", value: "dropped" }]);
  });

  it("drops the editor's text and undo history as it is taken off", async () => {
    const control = mountedCode("gone");
    const { documentKey } = await editorShowing("gone");
    control.remove();
    expect(editor.forgotten).toEqual([documentKey]);
  });
});
