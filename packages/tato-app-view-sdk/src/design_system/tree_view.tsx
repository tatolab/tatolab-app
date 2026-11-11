import { cn } from "cn";
import { ChevronRight, Lock } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { studioIconNamed, type StudioIconName } from "./support/studio_icons";

/** Whether a row holds others, and whether they show under it. */
export type TreeRowExpansion = "leaf" | "expanded" | "collapsed";

/** One row of a tree as it shows: where it sits, what it says, and whether it holds others. */
export interface TreeViewRow {
  row_id: string;
  /** 0 for a row at the tree's top. */
  depth: number;
  label: string;
  icon: StudioIconName;
  /** Code names, as a stream or a file, read in the monospace face. */
  isMachineWords?: boolean;
  /** A heading row: a project, a project, a folder. */
  isHeading?: boolean;
  /** Rows the person cannot change from here, as an imported project, marked with a lock. */
  isReadOnly?: boolean;
  /** How the row reads: plainly, as the project's imports, or as something unreadable, failed or waiting. */
  tone?: "plain" | "imports" | "unreadable" | "failed" | "waiting";
  /** Quiet words at the row's end that say what kind of thing it is, as a node's type or `group`. */
  aside?: string;
  /** The row the window works in now, as the stream of the shown tab: a grey fill, its icon in the brand colour and its name stronger; a selected row keeps the selection's fill. */
  isCurrent?: boolean;
  expansion: TreeRowExpansion;
}

const TREE_ROW_TONE_CLASS_NAMES: Record<NonNullable<TreeViewRow["tone"]>, string> = {
  plain: "text-fg-2",
  imports: "text-studio-imports",
  unreadable: "text-danger-text",
  failed: "text-danger-text",
  waiting: "text-fg-3 italic",
};

/** Pixels from a row's start to the middle of its depth's chevron, where that depth's guide line runs. */
function guideLineOffset(guideDepth: number): number {
  return 4 + (guideDepth - 1) * 14 + 7;
}

/** The row a key moves to from `focusedIndex`, with what pressing it opens or closes; `null` for a key the tree does not answer. */
function treeKeyOutcome(
  key: string,
  rows: readonly TreeViewRow[],
  focusedIndex: number,
): { moveTo: number } | { toggle: { rowId: string; expand: boolean } } | { activate: string } | null {
  const focusedRow = rows[focusedIndex];
  if (focusedRow === undefined) return null;
  switch (key) {
    case "ArrowDown":
      return { moveTo: Math.min(rows.length - 1, focusedIndex + 1) };
    case "ArrowUp":
      return { moveTo: Math.max(0, focusedIndex - 1) };
    case "Home":
      return { moveTo: 0 };
    case "End":
      return { moveTo: rows.length - 1 };
    case "ArrowRight":
      if (focusedRow.expansion === "collapsed") return { toggle: { rowId: focusedRow.row_id, expand: true } };
      return focusedRow.expansion === "expanded" ? { moveTo: Math.min(rows.length - 1, focusedIndex + 1) } : null;
    case "ArrowLeft": {
      if (focusedRow.expansion === "expanded") return { toggle: { rowId: focusedRow.row_id, expand: false } };
      for (let parentIndex = focusedIndex - 1; parentIndex >= 0; parentIndex -= 1) {
        if ((rows[parentIndex]?.depth ?? 0) < focusedRow.depth) return { moveTo: parentIndex };
      }
      return null;
    }
    case "Enter":
      return { activate: focusedRow.row_id };
    default:
      return null;
  }
}

/**
 * A tree of rows, each at its depth with guide lines down its parents' depths: a click selects a row and its chevron
 * opens or closes it; from the keyboard the arrows, Home and End move the selection, Right and Left open and close a
 * row or move to its first child or its parent, and Enter activates it.
 */
export function TreeView({
  label,
  rows,
  selectedRowId,
  onRowSelected,
  onRowActivated,
  onExpansionToggled,
}: {
  label: string;
  /** The rows that show, in order: a collapsed row's rows are left out. */
  rows: readonly TreeViewRow[];
  selectedRowId: string | null;
  onRowSelected: (rowId: string) => void;
  onRowActivated: (rowId: string) => void;
  onExpansionToggled: (rowId: string, expand: boolean) => void;
}) {
  const treeElement = useRef<HTMLDivElement>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const focusableRowId = rows.some((row) => row.row_id === focusedRowId)
    ? focusedRowId
    : rows.some((row) => row.row_id === selectedRowId)
      ? selectedRowId
      : (rows[0]?.row_id ?? null);

  const focusRow = (rowId: string) => {
    setFocusedRowId(rowId);
    treeElement.current?.querySelector<HTMLElement>(`[data-tree-row-id="${CSS.escape(rowId)}"]`)?.focus();
  };

  const answerKey = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = rows.findIndex((row) => row.row_id === focusableRowId);
    const outcome = treeKeyOutcome(keyboardEvent.key, rows, focusedIndex);
    if (outcome === null) return;
    keyboardEvent.preventDefault();
    if ("moveTo" in outcome) {
      const movedToRow = rows[outcome.moveTo];
      if (movedToRow === undefined) return;
      focusRow(movedToRow.row_id);
      onRowSelected(movedToRow.row_id);
    } else if ("toggle" in outcome) {
      onExpansionToggled(outcome.toggle.rowId, outcome.toggle.expand);
    } else {
      onRowActivated(outcome.activate);
    }
  };

  return (
    <div ref={treeElement} role="tree" aria-label={label} onKeyDown={answerKey} className="@container flex flex-col p-1 text-xs">
      {rows.map((row) => {
        const RowIcon = studioIconNamed(row.icon);
        const isSelected = row.row_id === selectedRowId;
        const isCurrent = row.isCurrent === true;
        return (
          <div
            key={row.row_id}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-expanded={row.expansion === "leaf" ? undefined : row.expansion === "expanded"}
            aria-selected={isSelected}
            tabIndex={row.row_id === focusableRowId ? 0 : -1}
            data-tree-row-id={row.row_id}
            data-tree-row-current={isCurrent ? "" : undefined}
            onFocus={() => setFocusedRowId(row.row_id)}
            onClick={() => {
              focusRow(row.row_id);
              onRowSelected(row.row_id);
            }}
            onDoubleClick={() => onRowActivated(row.row_id)}
            className={cn(
              "group/tree-row relative flex h-(--studio-tree-row-height) shrink-0 cursor-default items-center rounded-sm outline-none select-none hover:bg-studio-tree-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
              isCurrent && "bg-studio-tree-current hover:bg-studio-tree-current",
              isSelected && "bg-studio-tree-selected hover:bg-studio-tree-selected",
            )}
          >
            {Array.from({ length: row.depth }, (_, guideIndex) => (
              <span key={guideIndex} aria-hidden className="absolute inset-y-0 w-px bg-studio-tree-guide" style={{ left: guideLineOffset(guideIndex + 1) }} />
            ))}
            <span aria-hidden className="shrink-0" style={{ width: 4 + row.depth * 14 }} />
            <span
              aria-hidden
              data-tree-row-toggle=""
              onClick={(clickEvent) => {
                if (row.expansion === "leaf") return;
                clickEvent.stopPropagation();
                onExpansionToggled(row.row_id, row.expansion === "collapsed");
              }}
              className="flex h-full w-3.5 shrink-0 items-center justify-center text-fg-3"
            >
              {row.expansion !== "leaf" && <ChevronRight className={cn("size-3 transition-transform", row.expansion === "expanded" && "rotate-90")} strokeWidth={2} />}
            </span>
            <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 px-1", TREE_ROW_TONE_CLASS_NAMES[row.tone ?? "plain"], (row.tone ?? "plain") === "plain" && "group-hover/tree-row:text-fg", (row.isHeading || isCurrent || isSelected) && "text-fg")}>
              <RowIcon className={cn("size-3.5 shrink-0", isCurrent ? "text-brand-text" : "text-fg-3")} strokeWidth={isCurrent ? 2 : 1.5} aria-hidden />
              <span className={cn("min-w-0 flex-1 truncate", row.isMachineWords && "font-mono text-2xs", row.isHeading && "font-semibold", isCurrent && "font-medium", row.tone === "imports" && "text-studio-imports")}>
                {row.label}
              </span>
              {row.aside !== undefined && <span className={cn("hidden max-w-[40%] shrink-0 truncate text-2xs @3xs:block", isSelected ? "text-fg-2" : "text-fg-3")}>{row.aside}</span>}
            </span>
            <span className="flex w-5 shrink-0 justify-center text-studio-read-only">
              {row.isReadOnly === true && <Lock className="size-[11px]" strokeWidth={1.75} role="img" aria-label="Read only" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
