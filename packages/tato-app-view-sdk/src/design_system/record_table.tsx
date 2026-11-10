import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** One column of a record table: its id, its heading, and whether its cells are machine words, set in mono. */
export interface RecordTableColumn {
  column_id: string;
  heading: string;
  isMachineWords?: boolean;
}

/** How a record's row reads: plain, or red for one the runtime refused. */
export type RecordTableRowTone = "plain" | "refused";

/** One record's row: its id, one cell per column, its tone, and what ends it, such as its ⋯ menu. */
export interface RecordTableRow {
  row_id: string;
  cells: readonly ReactNode[];
  tone?: RecordTableRowTone;
  trailing?: ReactNode;
}

/**
 * Records as a table under a sticky heading row, one line each, newest first as given; a click selects a row, and the
 * arrow keys move the selection while the table has focus.
 */
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
  const selectTheRowBeside = (step: 1 | -1) => {
    const selectedIndex = rows.findIndex((row) => row.row_id === selectedRowId);
    const besideRow = rows[selectedIndex === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, selectedIndex + step))];
    if (besideRow !== undefined) onRowSelected(besideRow.row_id);
  };
  return (
    <table
      aria-label={label}
      tabIndex={0}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key !== "ArrowDown" && keyboardEvent.key !== "ArrowUp") return;
        keyboardEvent.preventDefault();
        selectTheRowBeside(keyboardEvent.key === "ArrowDown" ? 1 : -1);
      }}
      className="w-full border-collapse text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
      {...controlDataAttributes}
    >
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
              onClick={() => onRowSelected(row.row_id)}
              data-record-table-row={row.row_id}
              data-record-table-row-tone={row.tone ?? "plain"}
              className={cn("cursor-default border-b border-line text-fg-2", isSelected ? "bg-studio-tree-selected text-fg" : "hover:bg-hover", row.tone === "refused" && !isSelected && "bg-danger-soft")}
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
