// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentedChoiceControl } from "./segmented_choice_control";

afterEach(cleanup);

type Level = "all" | "info" | "warn" | "error";

function LevelChoice({ firstChosen = "all" }: { firstChosen?: Level }) {
  const [chosen, setChosen] = useState<Level>(firstChosen);
  return (
    <SegmentedChoiceControl
      label="Levels shown"
      choices={[
        { choice: "all", label: "All", count: 1200 },
        { choice: "info", label: "Info" },
        { choice: "warn", label: "Warnings" },
        { choice: "error", label: "Errors" },
      ]}
      chosen={chosen}
      onChosen={setChosen}
      dataAttributeOfEachSegment="data-level-choice"
    />
  );
}

/** Presses `key` on the focused segment; base-ui moves focus a microtask later. */
async function pressKeyOnTheFocusedSegment(key: string): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });
}

function pressedSegmentNames(): string[] {
  return screen
    .getAllByRole("button")
    .filter((segment) => segment.getAttribute("aria-pressed") === "true")
    .map((segment) => segment.getAttribute("data-level-choice") ?? "");
}

describe("the segmented choice control", () => {
  it("is a named group of pressed buttons, the chosen one pressed, each counted in en-US", () => {
    render(<LevelChoice />);

    expect(screen.getByRole("group", { name: "Levels shown" })).toBeTruthy();
    expect(pressedSegmentNames()).toEqual(["all"]);
    expect(screen.getByRole("button", { name: "All 1,200" })).toBeTruthy();
  });

  it("chooses a segment pressed, and keeps it chosen when it is pressed again", () => {
    render(<LevelChoice />);

    fireEvent.click(screen.getByRole("button", { name: "Warnings" }));
    expect(pressedSegmentNames()).toEqual(["warn"]);
    fireEvent.click(screen.getByRole("button", { name: "Warnings" }));
    expect(pressedSegmentNames()).toEqual(["warn"]);
  });

  it("moves to and chooses the next segment with the arrow keys, wrapping, and the first and last with Home and End", async () => {
    render(<LevelChoice />);
    const allSegment = screen.getByRole("button", { name: /All/ });
    act(() => allSegment.focus());

    await pressKeyOnTheFocusedSegment("ArrowRight");
    expect(pressedSegmentNames()).toEqual(["info"]);
    expect(document.activeElement?.getAttribute("data-level-choice")).toBe("info");

    await pressKeyOnTheFocusedSegment("End");
    expect(pressedSegmentNames()).toEqual(["error"]);
    await pressKeyOnTheFocusedSegment("ArrowRight");
    expect(pressedSegmentNames()).toEqual(["all"]);
    await pressKeyOnTheFocusedSegment("ArrowLeft");
    expect(pressedSegmentNames()).toEqual(["error"]);
    await pressKeyOnTheFocusedSegment("Home");
    expect(pressedSegmentNames()).toEqual(["all"]);
  });

  it("is one Tab stop, and focus arriving by Tab chooses nothing", () => {
    render(<LevelChoice firstChosen="warn" />);

    expect(screen.getAllByRole("button").filter((segment) => segment.tabIndex === 0)).toHaveLength(1);
    act(() => screen.getByRole("button", { name: "Info" }).focus());
    expect(pressedSegmentNames()).toEqual(["warn"]);
  });

  it("never chooses a segment that can't be chosen here, which says why", () => {
    let chosenRunMode = "kept";
    render(
      <SegmentedChoiceControl
        label="Run mode"
        choices={[
          { choice: "kept", label: "Always on" },
          { choice: "attached", label: "Dev session", unavailableBecause: "Start one with tatolab dev." },
        ]}
        chosen="kept"
        onChosen={(choice) => {
          chosenRunMode = choice;
        }}
      />,
    );

    const devSession = screen.getByRole("button", { name: "Dev session" });
    expect(devSession.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(devSession);
    expect(chosenRunMode).toBe("kept");
  });
});
