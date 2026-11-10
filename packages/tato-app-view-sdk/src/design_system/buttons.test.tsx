// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Activity, Ban } from "lucide-react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyIconButton } from "./copy_icon_button";
import { CopyWordsButton } from "./copy_words_button";
import { IconButton } from "./icon_button";
import { ToggleIconButton } from "./toggle_icon_button";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the icon button", () => {
  it("is named by its label and runs its action when pressed", () => {
    const onPressed = vi.fn();
    render(<IconButton icon={Ban} label="Clear" onPressed={onPressed} data-stream-log-toolbar="clear" />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onPressed).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Clear" }).getAttribute("data-stream-log-toolbar")).toBe("clear");
  });

  it("keeps its focus while it cannot act, says why in its name, and does nothing when pressed", () => {
    const onPressed = vi.fn();
    render(<IconButton icon={Activity} label="Open graph" disabledReason="No graph: the stream is not loaded" onPressed={onPressed} />);
    const openGraph = screen.getByRole("button", { name: "Open graph: No graph: the stream is not loaded" });

    fireEvent.click(openGraph);

    expect(onPressed).not.toHaveBeenCalled();
    expect(openGraph.getAttribute("aria-disabled")).toBe("true");
    expect(openGraph.hasAttribute("disabled")).toBe(false);
  });
});

describe("the toggle icon button", () => {
  function FollowToggle() {
    const [isFollowing, setIsFollowing] = useState(true);
    return <ToggleIconButton icon={Activity} label="Follow new lines" isOn={isFollowing} onToggled={setIsFollowing} />;
  }

  it("is pressed while on, and turns off and on again when pressed", () => {
    render(<FollowToggle />);
    const follow = screen.getByRole("button", { name: "Follow new lines" });

    expect(follow.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(follow);
    expect(follow.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(follow);
    expect(follow.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the copy buttons", () => {
  const copiedTexts: string[] = [];
  beforeEach(() => {
    copiedTexts.length = 0;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void copiedTexts.push(text) } });
  });

  it("copy what they read when pressed and say Copied for a moment", async () => {
    vi.useFakeTimers();
    render(<CopyIconButton label="Copy as JSON" readTextToCopy={() => '{"level":"warn"}'} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy as JSON" }));
    });

    expect(copiedTexts).toEqual(['{"level":"warn"}']);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByRole("button", { name: "Copy as JSON" })).toBeTruthy();
  });

  it("say Copy, then Copied once the words are copied", async () => {
    render(<CopyWordsButton readTextToCopy={() => "tatolab dev"} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });

    expect(copiedTexts).toEqual(["tatolab dev"]);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
