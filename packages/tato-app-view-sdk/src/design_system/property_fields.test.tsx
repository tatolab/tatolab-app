// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropertyChoiceField, PropertyPortRow, PropertySliderField, PropertyTextField } from "./property_fields";

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

function aSliderRecordingEachEdit({ isCancelledByEscape = false }: { isCancelledByEscape?: boolean } = {}) {
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
        onDragCancelled={isCancelledByEscape ? () => edits.push("cancelled") : undefined}
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

  it("cancels a drag on Escape, commits nothing, and moves nothing more until the press ends", () => {
    const { edits, slider } = aSliderRecordingEachEdit({ isCancelledByEscape: true });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "31" } });
    fireEvent.keyDown(slider, { key: "Escape" });
    fireEvent.keyUp(slider, { key: "Escape" });
    fireEvent.change(slider, { target: { value: "35" } });
    expect(screen.queryByText("LIVE")).toBeNull();
    fireEvent.pointerUp(window);
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.pointerUp(window);
    expect(edits).toEqual(["drag started", "live 31", "cancelled", "drag started", "live 40", "commit 40"]);
  });

  it("releases a drag on Escape's key-up, as on any key's, where the drag cannot be cancelled", () => {
    const { edits, slider } = aSliderRecordingEachEdit();
    fireEvent.change(slider, { target: { value: "31" } });
    fireEvent.keyDown(slider, { key: "Escape" });
    fireEvent.keyUp(slider, { key: "Escape" });
    fireEvent.pointerUp(window);
    expect(edits).toEqual(["drag started", "live 31", "commit 31"]);
  });

  it("commits a keyboard step when the key is let go", () => {
    const { edits, slider } = aSliderRecordingEachEdit();
    fireEvent.change(slider, { target: { value: "31" } });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(edits).toEqual(["drag started", "live 31", "commit 31"]);
  });
});

describe("a property port row", () => {
  it("names the other end of each link an output has, and offers no way to change a link", () => {
    render(
      <PropertyPortRow
        direction="output"
        portName="video"
        typeWords="Image"
        pinMark={null}
        bandShade="first"
        linkedEnds={[
          { nodeTitle: "Mixer", port: "frames", linkKey: "id-mixer:frames" },
          { nodeTitle: "Meter", port: "frames", linkKey: "id-meter:frames" },
        ]}
      />,
    );
    expect([...document.querySelectorAll("[data-property-port-linked-end]")].map((line) => line.getAttribute("data-property-port-linked-end"))).toEqual(["Mixer › frames", "Meter › frames"]);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("shows an unjoined input's value where it has no link, its description, and where its value comes from", () => {
    render(<PropertyPortRow direction="input" portName="tint" typeWords="Array" pinMark={null} bandShade="first" linkedEnds={[]} description="The colour laid over each frame" comesFromWords="Saved" unlinkedValue={<span>0.5, 0.7</span>} />);
    expect(screen.getByText("0.5, 0.7")).toBeDefined();
    expect(document.querySelector("[data-properties-input-description]")?.textContent).toBe("The colour laid over each frame");
    expect(document.querySelector("[data-properties-input-comes-from]")?.textContent).toBe("Saved");
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("offers to reset an input and to promote it to a Graph Input where it is given each", () => {
    const pressed: string[] = [];
    render(
      <PropertyPortRow
        direction="input"
        portName="amount"
        typeWords="Float"
        pinMark={null}
        bandShade="first"
        linkedEnds={[]}
        reset={{ label: "Reset amount to default", onReset: () => pressed.push("reset") }}
        promotion={{ label: "Promote amount to a Graph Input", onPromoted: () => pressed.push("promoted") }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset amount to default" }));
    fireEvent.click(screen.getByRole("button", { name: "Promote amount to a Graph Input" }));
    expect(pressed).toEqual(["reset", "promoted"]);
  });

  it("offers to jump to and disconnect each link that drives an input where it is given each", () => {
    const pressed: string[] = [];
    render(
      <PropertyPortRow
        direction="input"
        portName="video"
        typeWords="Image"
        pinMark={null}
        bandShade="first"
        linkedEnds={[
          {
            nodeTitle: "Camera",
            port: "frames",
            linkKey: "id-camera:frames",
            jump: { label: "Go to Camera", onJumped: () => pressed.push("jumped") },
            disconnection: { label: "Disconnect Camera › frames", onDisconnected: () => pressed.push("disconnected") },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go to Camera" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Camera › frames" }));
    expect(pressed).toEqual(["jumped", "disconnected"]);
  });

  it("says Not connected for an output with no link", () => {
    render(<PropertyPortRow direction="output" portName="level" typeWords="Channels" pinMark={null} bandShade="second" linkedEnds={[]} />);
    expect(screen.getByText("Not connected")).toBeDefined();
  });
});

describe("a property choice field", () => {
  it("shows a choice's tooltip while the pointer rests on it, and two choices of the same words stay two", async () => {
    const chosen: string[] = [];
    render(
      <PropertyChoiceField
        fieldId="bundle-type-field"
        label="bundle_type"
        words=""
        choices={[
          { words: "Reading", tooltip: "level: Float", onChosen: () => chosen.push("first") },
          { words: "Reading", tooltip: "level: String", onChosen: () => chosen.push("second") },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "bundle_type" }));
    const entries = await screen.findAllByRole("menuitem");
    expect(entries.map((entry) => entry.textContent)).toEqual(["Reading", "Reading"]);
    const second = entries[1] ?? expect.unreachable("no second entry");
    fireEvent.pointerEnter(second, { pointerType: "mouse" });
    fireEvent.mouseEnter(second);
    fireEvent.mouseMove(second);
    fireEvent.pointerMove(second, { pointerType: "mouse" });
    expect(await screen.findByText("level: String", {}, { timeout: 2_000 })).not.toBeNull();
    fireEvent.click(second);
    expect(chosen).toEqual(["second"]);
  });

  it("says why its menu offers nothing when it has no choice", async () => {
    render(<PropertyChoiceField fieldId="bundle-type-field" label="bundle_type" words="" choices={[]} whyItOffersNoChoice="No node type in this stream declares a bundle." />);
    fireEvent.click(screen.getByRole("button", { name: "bundle_type" }));
    await waitFor(() => expect(screen.getByText("No node type in this stream declares a bundle.")).not.toBeNull());
    expect(screen.queryAllByRole("menuitem")).toEqual([]);
  });
});
