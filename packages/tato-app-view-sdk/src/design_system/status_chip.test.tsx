// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusChip } from "./status_chip";

afterEach(cleanup);

describe("StatusChip", () => {
  it.each(["positive", "danger", "caution", "neutral"] as const)("says its word and names its %s tone", (tone) => {
    render(<StatusChip tone={tone}>{`${tone} word`}</StatusChip>);
    expect(screen.getByText(`${tone} word`).dataset.statusChipTone).toBe(tone);
  });
});
