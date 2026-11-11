// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView, type TreeViewRow } from "./tree_view";

afterEach(cleanup);

const ROWS: TreeViewRow[] = ["camera", "halftone", "display"].map((rowId) => ({ row_id: rowId, depth: 0, label: rowId, icon: "graph_node", expansion: "leaf" }));

function treeOfThreeRows({ alsoSelectedRowIds }: { alsoSelectedRowIds?: ReadonlySet<string> }) {
  const onRowSelected = vi.fn();
  render(<TreeView label="Nodes" rows={ROWS} selectedRowId="camera" alsoSelectedRowIds={alsoSelectedRowIds} onRowSelected={onRowSelected} onRowActivated={vi.fn()} onExpansionToggled={vi.fn()} />);
  return { onRowSelected, row: (rowId: string) => screen.getByRole("treeitem", { name: rowId }) };
}

describe("a tree that selects several rows", () => {
  it("says it selects several, marks every row selected with the one picked last, and reads ⌘ or Ctrl as a toggle and ⇧ as an extend", () => {
    const { onRowSelected, row } = treeOfThreeRows({ alsoSelectedRowIds: new Set(["camera", "display"]) });
    expect(screen.getByRole("tree").getAttribute("aria-multiselectable")).toBe("true");
    expect(ROWS.map(({ row_id }) => row(row_id).getAttribute("aria-selected"))).toEqual(["true", "false", "true"]);

    fireEvent.click(row("halftone"));
    fireEvent.click(row("halftone"), { metaKey: true });
    fireEvent.click(row("halftone"), { ctrlKey: true });
    fireEvent.click(row("display"), { shiftKey: true });
    expect(onRowSelected.mock.calls).toEqual([
      ["halftone", "alone"],
      ["halftone", "toggled"],
      ["halftone", "toggled"],
      ["display", "extended"],
    ]);
  });

  it("extends with ⇧ and Down or Up, toggles the focused row with Space, and moves alone with a bare arrow", () => {
    const { onRowSelected, row } = treeOfThreeRows({ alsoSelectedRowIds: new Set(["camera"]) });
    fireEvent.keyDown(row("camera"), { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(row("halftone"), { key: " " });
    fireEvent.keyDown(row("halftone"), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(row("camera"), { key: "ArrowDown" });
    expect(onRowSelected.mock.calls).toEqual([
      ["halftone", "extended"],
      ["halftone", "toggled"],
      ["camera", "extended"],
      ["halftone", "alone"],
    ]);
  });
});

describe("a tree that selects one row", () => {
  it("doesn't say it selects several, and picks a row alone whatever key is held", () => {
    const { onRowSelected, row } = treeOfThreeRows({});
    expect(screen.getByRole("tree").hasAttribute("aria-multiselectable")).toBe(false);
    fireEvent.click(row("halftone"), { metaKey: true });
    fireEvent.click(row("display"), { shiftKey: true });
    fireEvent.keyDown(row("display"), { key: "ArrowUp", shiftKey: true });
    fireEvent.keyDown(row("halftone"), { key: " " });
    expect(onRowSelected.mock.calls).toEqual([
      ["halftone", "alone"],
      ["display", "alone"],
      ["halftone", "alone"],
    ]);
  });
});
