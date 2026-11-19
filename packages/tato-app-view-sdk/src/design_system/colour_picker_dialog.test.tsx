// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColourPickerDialog, isAHexColour, isAHexColourWithAlpha } from "./colour_picker_dialog";

afterEach(cleanup);

function pickerOpenedOn(startingColour: string) {
  const onColourPicked = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ColourPickerDialog isOpen onOpenChange={onOpenChange} title="Color of The look" startingColour={startingColour} recentColours={["#123456", "#abcdef"]} onColourPicked={onColourPicked} />,
  );
  return { onColourPicked, onOpenChange };
}

describe("the colour picker dialog", () => {
  it("reads only a six-digit hex colour", () => {
    expect(isAHexColour("#4AA8a8")).toBe(true);
    expect(isAHexColour("#4aa8a")).toBe(false);
    expect(isAHexColour("teal")).toBe(false);
  });

  it("uses a typed hex colour, in lower case, and closes", async () => {
    const { onColourPicked, onOpenChange } = pickerOpenedOn("#c46a6a");
    const hexField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-colour-picker-hex]") ?? expect.unreachable("no hex field"));
    expect(hexField.value).toBe("#c46a6a");
    fireEvent.change(hexField, { target: { value: "#4AA8A8" } });
    fireEvent.click(document.querySelector('[data-colour-picker-action="use"]') ?? expect.unreachable("no Use color"));
    expect(onColourPicked).toHaveBeenCalledWith("#4aa8a8");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the last colour it read while the typed one is not a colour, and a recent swatch picks its colour", async () => {
    const { onColourPicked } = pickerOpenedOn("#c46a6a");
    const hexField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-colour-picker-hex]") ?? expect.unreachable("no hex field"));
    fireEvent.change(hexField, { target: { value: "#12" } });
    fireEvent.click(document.querySelector('[data-colour-picker-action="use"]') ?? expect.unreachable("no Use color"));
    expect(onColourPicked).toHaveBeenLastCalledWith("#c46a6a");
    fireEvent.click(document.querySelector('[data-colour-picker-recent="#abcdef"]') ?? expect.unreachable("no recent swatch"));
    expect(hexField.value).toBe("#abcdef");
    fireEvent.click(document.querySelector('[data-colour-picker-action="use"]') ?? expect.unreachable("no Use color"));
    expect(onColourPicked).toHaveBeenLastCalledWith("#abcdef");
  });

  it("reads a hex colour with its alpha only when it sets alpha", () => {
    expect(isAHexColourWithAlpha("#4aa8a8")).toBe(true);
    expect(isAHexColourWithAlpha("#4aa8a880")).toBe(true);
    expect(isAHexColourWithAlpha("#4aa8a88")).toBe(false);
    expect(isAHexColour("#4aa8a880")).toBe(false);
  });

  it("tells each colour picked as it moves, and with alpha takes a typed #rrggbbaa", async () => {
    const onColourMoved = vi.fn();
    const onColourPicked = vi.fn();
    render(
      <ColourPickerDialog isOpen onOpenChange={() => undefined} title="tint" startingColour="#ff9933" recentColours={["#abcdef"]} onColourPicked={onColourPicked} onColourMoved={onColourMoved} withAlpha />,
    );
    const hexField = await waitFor(() => document.querySelector<HTMLInputElement>("[data-colour-picker-hex]") ?? expect.unreachable("no hex field"));
    fireEvent.change(hexField, { target: { value: "#12" } });
    expect(onColourMoved).not.toHaveBeenCalled();
    fireEvent.change(hexField, { target: { value: "#FF993380" } });
    fireEvent.click(document.querySelector('[data-colour-picker-recent="#abcdef"]') ?? expect.unreachable("no recent swatch"));
    expect(onColourMoved.mock.calls).toEqual([["#ff993380"], ["#abcdef"]]);
    fireEvent.click(document.querySelector('[data-colour-picker-action="use"]') ?? expect.unreachable("no Use color"));
    expect(onColourPicked).toHaveBeenCalledWith("#abcdef");
  });
});
