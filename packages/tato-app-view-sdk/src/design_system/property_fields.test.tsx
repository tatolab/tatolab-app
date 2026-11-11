// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropertyPortRow, PropertySliderField, PropertyTextField, type PropertyPortTarget } from "./property_fields";

afterEach(cleanup);

function aTextFieldCommittingInto(committedWords: string[]) {
  render(<PropertyTextField fieldId="width-field" label="Width" words="1280" onCommitted={(words) => committedWords.push(words)} />);
  const textField = screen.getByRole("textbox", { name: "Width" });
  act(() => textField.focus());
  return textField;
}

describe("a property field edited in place", () => {
  it("commits the words typed on Enter", () => {
    const committedWords: string[] = [];
    const textField = aTextFieldCommittingInto(committedWords);
    fireEvent.change(textField, { target: { value: "640" } });
    fireEvent.keyDown(textField, { key: "Enter" });
    expect(committedWords).toEqual(["640"]);
  });

  it("commits the words typed on leaving the field", () => {
    const committedWords: string[] = [];
    const textField = aTextFieldCommittingInto(committedWords);
    fireEvent.change(textField, { target: { value: "640" } });
    act(() => textField.blur());
    expect(committedWords).toEqual(["640"]);
  });

  it("puts the words back on Escape and commits nothing", () => {
    const committedWords: string[] = [];
    const textField = aTextFieldCommittingInto(committedWords);
    fireEvent.change(textField, { target: { value: "640" } });
    fireEvent.keyDown(textField, { key: "Escape" });
    expect(committedWords).toEqual([]);
    expect(textField).toHaveProperty("value", "1280");
  });

  it("commits nothing when the words did not change", () => {
    const committedWords: string[] = [];
    const textField = aTextFieldCommittingInto(committedWords);
    fireEvent.keyDown(textField, { key: "Enter" });
    expect(committedWords).toEqual([]);
  });
});

function aSliderRecordingEachEdit() {
  const edits: string[] = [];
  render(
    <label>
      FPS
      <PropertySliderField
        fieldId="fps-field"
        value={30}
        minimum={1}
        maximum={60}
        isWholeNumber
        onDragStarted={() => edits.push("drag started")}
        onLiveEdit={(moved) => edits.push(`live ${moved}`)}
        onCommitted={(released) => edits.push(`commit ${released}`)}
        valueTypedBesideTheSlider={{ label: "FPS value", onWordsTyped: (words) => edits.push(`typed ${words}`) }}
      />
    </label>,
  );
  return { edits, slider: screen.getByRole("slider") };
}

describe("a property slider", () => {
  it("takes a value typed beside it, committed on Enter or on leaving it, and puts it back on Escape", () => {
    const { edits } = aSliderRecordingEachEdit();
    const typedValue = screen.getByRole("textbox", { name: "FPS value" });
    expect(typedValue.getAttribute("value") ?? "").toBe("30");
    typedValue.focus();
    fireEvent.change(typedValue, { target: { value: "24" } });
    fireEvent.keyDown(typedValue, { key: "Enter" });
    typedValue.focus();
    fireEvent.change(typedValue, { target: { value: "12" } });
    fireEvent.keyDown(typedValue, { key: "Escape" });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "FPS value" }).value).toBe("30");
    typedValue.focus();
    fireEvent.change(typedValue, { target: { value: "15" } });
    fireEvent.blur(typedValue);
    expect(edits).toEqual(["typed 24", "typed 15"]);
  });

  it("sends each move live and commits once on release, showing LIVE while dragged", () => {
    const { edits, slider } = aSliderRecordingEachEdit();
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "31" } });
    fireEvent.change(slider, { target: { value: "33" } });
    expect(screen.getByText("LIVE")).toBeTruthy();
    fireEvent.pointerUp(window);
    expect(edits).toEqual(["drag started", "live 31", "live 33", "commit 33"]);
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("commits a drag released outside it", () => {
    const { edits, slider } = aSliderRecordingEachEdit();
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(document.body);
    expect(edits).toEqual(["drag started", "live 40", "commit 40"]);
  });

  it("commits nothing for a press, a key or a focus change that did not move it", () => {
    const { edits, slider } = aSliderRecordingEachEdit();
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    fireEvent.keyDown(slider, { key: "Shift" });
    fireEvent.keyUp(slider, { key: "Shift" });
    act(() => slider.focus());
    act(() => slider.blur());
    expect(edits).toEqual([]);
  });

  it("commits a keyboard step when the key is let go", () => {
    const { edits, slider } = aSliderRecordingEachEdit();
    fireEvent.change(slider, { target: { value: "31" } });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(edits).toEqual(["drag started", "live 31", "commit 31"]);
  });
});

describe("a property port row", () => {
  const aTarget = (key: string, linkedWith: PropertyPortTarget["linkedWith"], onRemoved: () => void): PropertyPortTarget => ({
    linkedWith,
    targetKey: key,
    note: "Inputs in Main that take Image",
    choicesWhenOpened: () => [],
    onRemoved,
  });

  it("draws a target picker for each link an output has, each with its own remove", () => {
    const removed: string[] = [];
    render(
      <PropertyPortRow
        direction="output"
        portName="video"
        familyWords="Image"
        pinMark={null}
        bandShade="first"
        targets={[aTarget("id-1:frames", { nodeTitle: "Camera", port: "frames" }, () => removed.push("id-1")), aTarget("id-2:frames", { nodeTitle: "Camera", port: "frames" }, () => removed.push("id-2"))]}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Target of video: Camera frames" })).toHaveLength(2);
    const removeButtons = screen.getAllByRole("button", { name: "Remove the link of video with Camera frames" });
    fireEvent.click(removeButtons[1] ?? document.body);
    expect(removed).toEqual(["id-2"]);
  });

  it("reads None on a blank picker and says why + cannot add another where the port takes no more", () => {
    const added: string[] = [];
    render(
      <PropertyPortRow
        direction="input"
        portName="level"
        familyWords="Channels"
        pinMark={null}
        bandShade="second"
        targets={[aTarget("blank-1", null, () => undefined)]}
        addition={{ disabledReason: "An input takes one link. Choose another output in its picker.", onAdded: () => added.push("added") }}
      />,
    );
    expect(screen.getByRole("button", { name: "Target of level: none" }).textContent).toContain("None");
    fireEvent.click(screen.getByRole("button", { name: "Add a target for level: An input takes one link. Choose another output in its picker." }));
    expect(added).toEqual([]);
  });

  it("shows an unjoined input's value where it has no target picker", () => {
    render(<PropertyPortRow direction="input" portName="tint" familyWords="Array" pinMark={null} bandShade="first" targets={[]} unlinkedValue={<span>0.5, 0.7</span>} addition={{ disabledReason: null, onAdded: () => undefined }} />);
    expect(screen.getByText("0.5, 0.7")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add a target for tint" })).toBeDefined();
  });
});
