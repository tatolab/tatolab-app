// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeDialog } from "./notice_dialog";

afterEach(cleanup);

function SlowerViewersNotice({ onAcknowledged }: { onAcknowledged: () => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <NoticeDialog
      isOpen={isOpen}
      onAcknowledged={() => {
        onAcknowledged();
        setIsOpen(false);
      }}
      notice={{ title: "Viewers run slower on X11", explanation: "Log in with a Wayland session for full-speed viewers.", acknowledgeWords: "OK" }}
    />
  );
}

describe("the notice dialog", () => {
  it("says its notice with its one button holding focus", async () => {
    render(<SlowerViewersNotice onAcknowledged={() => {}} />);
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Viewers run slower on X11" }));

    expect(dialog.textContent).toContain("Log in with a Wayland session for full-speed viewers.");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["OK"]);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("OK"));
  });

  it("is acknowledged by its button and by Escape alike", async () => {
    const acknowledgedByTheButton = vi.fn();
    render(<SlowerViewersNotice onAcknowledged={acknowledgedByTheButton} />);
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "OK" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acknowledgedByTheButton).toHaveBeenCalledTimes(1);
    cleanup();

    const acknowledgedByEscape = vi.fn();
    render(<SlowerViewersNotice onAcknowledged={acknowledgedByEscape} />);
    fireEvent.keyDown(await waitFor(() => screen.getByRole("dialog")), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acknowledgedByEscape).toHaveBeenCalledTimes(1);
  });
});
