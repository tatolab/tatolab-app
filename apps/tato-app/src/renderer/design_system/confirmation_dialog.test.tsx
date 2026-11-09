// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./confirmation_dialog";

afterEach(cleanup);

function RemovalQuestion({ onConfirmed }: { onConfirmed: () => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      question={{ title: "Remove camera?", explanation: "The runtime unloads it and forgets it.", confirmWords: "Remove" }}
      isDestructive
      onConfirmed={() => {
        onConfirmed();
        setIsOpen(false);
      }}
    />
  );
}

describe("the confirmation dialog", () => {
  it("asks its question with Cancel holding focus, so Return never confirms by accident", async () => {
    render(<RemovalQuestion onConfirmed={() => {}} />);
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Remove camera?" }));

    expect(dialog.textContent).toContain("The runtime unloads it and forgets it.");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancel"));
  });

  it("confirms with its button, and closes with Cancel without confirming", async () => {
    const onConfirmed = vi.fn();
    render(<RemovalQuestion onConfirmed={onConfirmed} />);

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Cancel" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirmed).not.toHaveBeenCalled();

    cleanup();
    render(<RemovalQuestion onConfirmed={onConfirmed} />);
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Remove" })));
    expect(onConfirmed).toHaveBeenCalledOnce();
  });
});
