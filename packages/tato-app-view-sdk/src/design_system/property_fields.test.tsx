// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyChoiceField, PropertyPortRow, PropertyTextField } from "./property_fields";

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
  /** Two choices drawn with the same words, each with its own tooltip, recording which was chosen in `chosen`. */
  const twoChoicesOfTheSameWords = (chosen: string[]) => [
    { words: "Reading", tooltip: "level: Float", onChosen: () => chosen.push("first") },
    { words: "Reading", tooltip: "level: String", onChosen: () => chosen.push("second") },
  ];

  /** Waits for a tooltip of `words` to show. */
  const tooltipShows = (words: string) =>
    waitFor(() => expect([...document.querySelectorAll<HTMLElement>("[data-slot=tooltip-content]")].map((tooltip) => tooltip.textContent)).toContain(words), { timeout: 2_000 });

  /** The words `entry` is described by. */
  const descriptionOf = (entry: Element) => document.getElementById(entry.getAttribute("aria-describedby") ?? "")?.textContent;

  it("names each choice's tooltip as its description, and shows the tooltip while the pointer rests on it", async () => {
    const chosen: string[] = [];
    render(<PropertyChoiceField fieldId="bundle-type-field" label="bundle_type" words="" choices={twoChoicesOfTheSameWords(chosen)} />);
    fireEvent.click(screen.getByRole("button", { name: "bundle_type" }));
    const second = await screen.findByRole("menuitem", { description: "level: String" });
    expect(screen.getByRole("menuitem", { description: "level: Float" }).textContent).toBe("Reading");
    expect(second.textContent).toBe("Reading");
    fireEvent.pointerEnter(second, { pointerType: "mouse" });
    fireEvent.mouseEnter(second);
    fireEvent.mouseMove(second);
    fireEvent.pointerMove(second, { pointerType: "mouse" });
    await tooltipShows("level: String");
    fireEvent.click(second);
    expect(chosen).toEqual(["second"]);
  });

  it("shows a choice's tooltip when the keyboard moves onto it", async () => {
    render(<PropertyChoiceField fieldId="bundle-type-field" label="bundle_type" words="" choices={twoChoicesOfTheSameWords([])} />);
    const field = screen.getByRole("button", { name: "bundle_type" });
    act(() => field.focus());
    fireEvent.keyDown(field, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const focused = await waitFor(() => (document.activeElement?.getAttribute("role") === "menuitem" ? document.activeElement : expect.unreachable("no entry holds the focus")));
    await tooltipShows(descriptionOf(focused) ?? expect.unreachable("the focused entry is described by nothing"));
  });

  it("keeps two choices of the same words apart, each with its own tooltip, as they are reordered", async () => {
    const reactWarnings = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const chosen: string[] = [];
    const choices = twoChoicesOfTheSameWords(chosen);
    const { rerender } = render(<PropertyChoiceField fieldId="bundle-type-field" label="bundle_type" words="" choices={choices} />);
    rerender(<PropertyChoiceField fieldId="bundle-type-field" label="bundle_type" words="" choices={[...choices].reverse()} />);
    fireEvent.click(screen.getByRole("button", { name: "bundle_type" }));
    const entries = await screen.findAllByRole("menuitem");
    expect(entries.map(descriptionOf)).toEqual(["level: String", "level: Float"]);
    fireEvent.click(entries[0] ?? expect.unreachable("no first entry"));
    expect(chosen).toEqual(["second"]);
    expect(reactWarnings.mock.calls.filter((call) => String(call[0]).includes("same key"))).toEqual([]);
    reactWarnings.mockRestore();
  });

  it("says why its menu offers nothing when it has no choice", async () => {
    render(<PropertyChoiceField fieldId="bundle-type-field" label="bundle_type" words="" choices={[]} whyItOffersNoChoice="No node type in this stream declares a bundle." />);
    fireEvent.click(screen.getByRole("button", { name: "bundle_type" }));
    await waitFor(() => expect(screen.getByText("No node type in this stream declares a bundle.")).not.toBeNull());
    expect(screen.queryAllByRole("menuitem")).toEqual([]);
  });
});
