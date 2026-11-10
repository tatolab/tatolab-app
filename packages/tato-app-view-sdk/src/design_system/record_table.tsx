import { cn } from "cn";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** One column of a record table: its id, its heading, and whether its cells are machine words, set in mono. */
export interface RecordTableColumn {
  column_id: string;
  heading: string;
  isMachineWords?: boolean;
}

/** How a record's row reads: plain, or tinted with the danger colour, as for a change the runtime refused. */
export type RecordTableRowTone = "plain" | "danger";

/** One record's row: its id, one cell per column, its tone, and what ends it, such as its ⋯ menu. */
export interface RecordTableRow {
  row_id: string;
  cells: readonly ReactNode[];
  tone?: RecordTableRowTone;
  trailing?: ReactNode;
}

/** Records as a grid under a sticky heading row, one line each, in the order given; a click or the arrow keys select a row. */
export function RecordTable({
  label,
  columns,
  rows,
  selectedRowId,
  onRowSelected,
  ...controlDataAttributes
}: {
  /** The table's accessible name, as "Transactions". */
  label: string;
  columns: readonly RecordTableColumn[];
  rows: readonly RecordTableRow[];
  selectedRowId: string | null;
  onRowSelected: (rowId: string) => void;
} & ControlDataAttributes) {
  const tableElement = useRef<HTMLTableElement>(null);
  const selectedIndex = rows.findIndex((row) => row.row_id === selectedRowId);
  const focusableRowId = selectedIndex === -1 ? (rows[0]?.row_id ?? null) : selectedRowId;

  const answerKey = (keyboardEvent: KeyboardEvent<HTMLTableElement>) => {
    if (!(keyboardEvent.target instanceof HTMLElement) || keyboardEvent.target.dataset.recordTableRow === undefined) return;
    const movedToIndex = recordTableKeyMovesTo(keyboardEvent.key, selectedIndex, rows.length);
    const movedToRow = movedToIndex === null ? undefined : rows[movedToIndex];
    if (movedToRow === undefined) return;
    keyboardEvent.preventDefault();
    tableElement.current?.querySelector<HTMLElement>(`[data-record-table-row="${CSS.escape(movedToRow.row_id)}"]`)?.focus();
    onRowSelected(movedToRow.row_id);
  };

  return (
    <table ref={tableElement} role="grid" aria-label={label} onKeyDown={answerKey} className="w-full border-collapse text-xs" {...controlDataAttributes}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.column_id} scope="col" className="sticky top-0 border-b border-studio-area-header-line bg-studio-area-header px-2.5 py-1.5 text-left font-medium whitespace-nowrap text-fg-3">
              {column.heading}
            </th>
          ))}
          <th scope="col" className="sticky top-0 w-8 border-b border-studio-area-header-line bg-studio-area-header">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = row.row_id === selectedRowId;
          return (
            <tr
              key={row.row_id}
              aria-selected={isSelected}
              tabIndex={row.row_id === focusableRowId ? 0 : -1}
              onClick={() => onRowSelected(row.row_id)}
              data-record-table-row={row.row_id}
              data-record-table-row-tone={row.tone ?? "plain"}
              className={cn("cursor-default border-b border-line text-fg-2 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset", isSelected ? "bg-studio-tree-selected text-fg" : "hover:bg-hover", row.tone === "danger" && !isSelected && "bg-danger-soft")}
            >
              {row.cells.map((cell, cellIndex) => (
                <td key={columns[cellIndex]?.column_id ?? cellIndex} className={cn("max-w-80 truncate px-2.5 py-1.5 whitespace-nowrap", columns[cellIndex]?.isMachineWords === true && "font-mono text-2xs")}>
                  {cell}
                </td>
              ))}
              <td className="w-8 px-1 py-0.5" onClick={(clickEvent) => clickEvent.stopPropagation()}>
                {row.trailing}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The index of the row `key` moves the selection to from `selectedIndex` (-1 for none) among `rowCount` rows, or `null` for a key that moves nothing. */
export function recordTableKeyMovesTo(key: string, selectedIndex: number, rowCount: number): number | null {
  if (rowCount === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return rowCount - 1;
  if (key === "ArrowDown") return selectedIndex === -1 ? 0 : Math.min(rowCount - 1, selectedIndex + 1);
  if (key === "ArrowUp") return selectedIndex === -1 ? rowCount - 1 : Math.max(0, selectedIndex - 1);
  return null;
}
