// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropertyPortRow, PropertySliderField, PropertyTextField } from "./property_fields";

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
      />
    </label>,
  );
  return { edits, slider: screen.getByRole("slider") };
}

describe("a property slider", () => {
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
  it("offers a disconnect for each link an output has", () => {
    const disconnected: string[] = [];
    render(
      <PropertyPortRow
        direction="output"
        portName="video"
        familyWords="Image"
        pinMark={null}
        linkedEnds={[
          { nodeTitle: "Camera", port: "frames", linkKey: "id-1:frames", onDisconnect: () => disconnected.push("id-1") },
          { nodeTitle: "Camera", port: "frames", linkKey: "id-2:frames", onDisconnect: () => disconnected.push("id-2") },
        ]}
      />,
    );
    const disconnectButtons = screen.getAllByRole("button", { name: "Disconnect video to Camera › frames" });
    expect(disconnectButtons).toHaveLength(2);
    fireEvent.click(disconnectButtons[1] ?? document.body);
    expect(disconnected).toEqual(["id-2"]);
  });
});
