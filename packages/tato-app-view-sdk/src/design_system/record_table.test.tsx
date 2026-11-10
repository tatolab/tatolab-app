// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RecordTable, recordTableKeyMovesTo } from "./record_table";

afterEach(cleanup);

function RecordTableOfThreeRecords({ startingSelection }: { startingSelection: string | null }) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(startingSelection);
  return (
    <RecordTable
      label="Records"
      columns={[{ column_id: "name", heading: "Name" }]}
      rows={["first", "second", "third"].map((rowId) => ({ row_id: rowId, cells: [rowId], trailing: <button type="button">More for {rowId}</button> }))}
      selectedRowId={selectedRowId}
      onRowSelected={setSelectedRowId}
    />
  );
}

function rowNamed(rowId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-record-table-row="${rowId}"]`) ?? expect.unreachable(`no ${rowId} row`);
}

describe("the record table", () => {
  it("is a grid whose selected row is the one the keyboard reaches, and the arrow keys move the selection and the focus together", () => {
    render(<RecordTableOfThreeRecords startingSelection="first" />);
    expect(screen.getByRole("grid", { name: "Records" })).toBeTruthy();
    expect(rowNamed("first").getAttribute("aria-selected")).toBe("true");
    expect(rowNamed("first").tabIndex).toBe(0);
    expect(rowNamed("second").tabIndex).toBe(-1);

    rowNamed("first").focus();
    fireEvent.keyDown(rowNamed("first"), { key: "ArrowDown" });
    expect(rowNamed("second").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(rowNamed("second"));
  });

  it("leaves the selection where it is while a key is pressed in a row's trailing control", () => {
    render(<RecordTableOfThreeRecords startingSelection="first" />);
    const moreForFirst = screen.getByRole("button", { name: "More for first" });
    moreForFirst.focus();
    fireEvent.keyDown(moreForFirst, { key: "ArrowDown" });
    expect(rowNamed("first").getAttribute("aria-selected")).toBe("true");
  });

  it("moves to the first row on ArrowDown and the last on ArrowUp when nothing is selected, and to either end on Home and End", () => {
    expect(recordTableKeyMovesTo("ArrowDown", -1, 3)).toBe(0);
    expect(recordTableKeyMovesTo("ArrowUp", -1, 3)).toBe(2);
    expect(recordTableKeyMovesTo("ArrowUp", 0, 3)).toBe(0);
    expect(recordTableKeyMovesTo("ArrowDown", 2, 3)).toBe(2);
    expect(recordTableKeyMovesTo("Home", 2, 3)).toBe(0);
    expect(recordTableKeyMovesTo("End", 0, 3)).toBe(2);
    expect(recordTableKeyMovesTo("Enter", 0, 3)).toBeNull();
    expect(recordTableKeyMovesTo("ArrowDown", -1, 0)).toBeNull();
  });
});
