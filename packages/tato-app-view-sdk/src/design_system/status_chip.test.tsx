// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusChip } from "./status_chip";

afterEach(cleanup);

describe("StatusChip", () => {
  it("says its word and names its tone", () => {
    render(<StatusChip tone="danger">refused</StatusChip>);
    const chip = screen.getByText("refused");
    expect(chip.dataset.statusChipTone).toBe("danger");
    expect(chip.className).toContain("bg-status-danger-ground");
  });
});
