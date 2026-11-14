import { cn } from "cn";
import { ChevronRight, Lock } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { studioIconNamed, type StudioIconName } from "./support/studio_icons";
import { MatchedWords } from "./matched_words";

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
  /** Quiet words in the row's second column that say what kind of thing it is, as a node's type or `group`. */
  aside?: string;
  /** The row the window works in now, as the stream of the shown tab: a grey fill, its icon in the brand colour and its name stronger; a selected row keeps the selection's fill. */
  isCurrent?: boolean;
  expansion: TreeRowExpansion;
  /** What a search field over the tree holds: the part of the label or aside it matches is marked. */
  searchWords?: string;
}

const TREE_ROW_TONE_CLASS_NAMES: Record<NonNullable<TreeViewRow["tone"]>, string> = {
  plain: "text-fg-2",
  imports: "text-studio-imports",
  unreadable: "text-danger-text",
  failed: "text-danger-text",
  waiting: "text-fg-3 italic",
};

/** The aside column, a fixed width so every row's aside starts at one edge under its heading; hidden where the tree is too narrow for two columns. */
const TREE_ASIDE_COLUMN_CLASS_NAMES = "hidden w-16 shrink-0 truncate text-left text-2xs @min-[12rem]:block";

/** Pixels from a row's start to the middle of its depth's chevron, where that depth's guide line runs. */
function guideLineOffset(guideDepth: number): number {
  return 4 + (guideDepth - 1) * 14 + 7;
}

/** Pixels from a nested row's start to where its connector from its parent's guide line stops: short of its chevron, or into the empty chevron slot of a leaf. */
function guideConnectorEnd(row: TreeViewRow): number {
  return 4 + row.depth * 14 + (row.expansion === "leaf" ? 11 : 1);
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

/** The words over a tree's two columns: its rows' labels, and the kind of thing each is. */
export interface TreeViewColumnHeadings {
  label: string;
  aside: string;
}

/** How a row was picked: on its own, toggled in or out of the rows selected with ⌘ or Ctrl, or extended to with ⇧. */
export type TreeRowPick = "alone" | "toggled" | "extended";

/**
 * A tree of rows, each at its depth with guide lines down its parents' depths and a connector from its parent's line: a click selects a row, ⌘ or ⇧ with it
 * adds rows where the tree selects several, and its chevron opens or closes it; from the keyboard the arrows, Home and
 * End move the selection, Right and Left open and close a row or move to its first child or its parent, and Enter
 * activates it; where the tree selects several, ⇧ with Up or Down extends the selection and Space toggles the focused row.
 */
export function TreeView({
  label,
  rows,
  selectedRowId,
  alsoSelectedRowIds,
  onRowSelected,
  onRowActivated,
  onExpansionToggled,
  columnHeadings,
}: {
  label: string;
  /** The rows that show, in order: a collapsed row's rows are left out. */
  rows: readonly TreeViewRow[];
  /** The row selected, or picked last among several. */
  selectedRowId: string | null;
  /** The other rows selected with it, for a tree that selects several; left out, a ⌘-click or ⇧-click picks a row on its own. */
  alsoSelectedRowIds?: ReadonlySet<string>;
  onRowSelected: (rowId: string, pick: TreeRowPick) => void;
  onRowActivated: (rowId: string) => void;
  onExpansionToggled: (rowId: string, expand: boolean) => void;
  /** Headings over the label and aside columns, held at the top as the tree scrolls; left out, the tree shows none. */
  columnHeadings?: TreeViewColumnHeadings;
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

  const selectsSeveralRows = alsoSelectedRowIds !== undefined;
  const answerKey = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = rows.findIndex((row) => row.row_id === focusableRowId);
    if (selectsSeveralRows && keyboardEvent.key === " " && focusableRowId !== null) {
      keyboardEvent.preventDefault();
      onRowSelected(focusableRowId, "toggled");
      return;
    }
    const outcome = treeKeyOutcome(keyboardEvent.key, rows, focusedIndex);
    if (outcome === null) return;
    keyboardEvent.preventDefault();
    if ("moveTo" in outcome) {
      const movedToRow = rows[outcome.moveTo];
      if (movedToRow === undefined) return;
      focusRow(movedToRow.row_id);
      const extendsTheSelection = selectsSeveralRows && keyboardEvent.shiftKey && (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp");
      onRowSelected(movedToRow.row_id, extendsTheSelection ? "extended" : "alone");
    } else if ("toggle" in outcome) {
      onExpansionToggled(outcome.toggle.rowId, outcome.toggle.expand);
    } else {
      onRowActivated(outcome.activate);
    }
  };

  return (
    <div ref={treeElement} role="tree" aria-label={label} aria-multiselectable={selectsSeveralRows ? true : undefined} onKeyDown={answerKey} className="@container flex flex-col p-1 text-xs">
      {columnHeadings !== undefined && (
        <div aria-hidden data-tree-column-headings="" className="sticky top-0 z-10 -mx-1 -mt-1 mb-0.5 flex h-(--studio-tree-row-height) shrink-0 items-center border-b border-studio-area-outline bg-studio-area px-1 text-2xs font-medium text-fg-3 select-none">
          <span className="shrink-0" style={{ width: 4 + 14 }} />
          <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
            <span className="min-w-0 flex-1 truncate">{columnHeadings.label}</span>
            <span className={TREE_ASIDE_COLUMN_CLASS_NAMES}>{columnHeadings.aside}</span>
          </span>
          <span className="w-5 shrink-0" />
        </div>
      )}
      {rows.map((row) => {
        const RowIcon = studioIconNamed(row.icon);
        const isSelected = row.row_id === selectedRowId || alsoSelectedRowIds?.has(row.row_id) === true;
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
            onClick={(clickEvent) => {
              focusRow(row.row_id);
              const pick: TreeRowPick = !selectsSeveralRows ? "alone" : clickEvent.metaKey || clickEvent.ctrlKey ? "toggled" : clickEvent.shiftKey ? "extended" : "alone";
              onRowSelected(row.row_id, pick);
            }}
            onDoubleClick={() => onRowActivated(row.row_id)}
            className={cn(
              "group/tree-row relative flex h-(--studio-tree-row-height) shrink-0 cursor-default items-center rounded-sm outline-none select-none hover:bg-studio-tree-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
              isCurrent && "bg-studio-tree-current hover:bg-studio-tree-current",
              isSelected && "bg-studio-tree-selected hover:bg-studio-tree-selected",
            )}
          >
            {Array.from({ length: row.depth }, (_, guideIndex) => (
              <span key={guideIndex} aria-hidden data-tree-row-guide-line="" className="absolute inset-y-0 w-px bg-studio-tree-guide" style={{ left: guideLineOffset(guideIndex + 1) }} />
            ))}
            {row.depth > 0 && (
              <span
                aria-hidden
                data-tree-row-guide-connector=""
                className="absolute top-1/2 h-px bg-studio-tree-guide"
                style={{ left: guideLineOffset(row.depth), width: guideConnectorEnd(row) - guideLineOffset(row.depth) }}
              />
            )}
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
                <MatchedWords words={row.label} searchWords={row.searchWords ?? ""} />
              </span>
              {row.aside !== undefined && (
                <span className={cn(TREE_ASIDE_COLUMN_CLASS_NAMES, isSelected ? "text-fg-2" : "text-fg-3")}>
                  <MatchedWords words={row.aside} searchWords={row.searchWords ?? ""} />
                </span>
              )}
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
