import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { AuthoredChangeList, AuthoredChangeRow, AuthoredChangeSectionHeading, type AuthoredChange } from "@tatolab/tato-app-view-sdk/design_system/authored_change_rows";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import type { ProjectTransaction, ProjectTransactionsReading, StreamGraphReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoreViewFrame } from "../shared/core_view_page";
import { historyRowsOfTheFeed, historyStepsToTheRow, nodeNamesTheFeedGives, theStepReachedItsEdit, whoMadeTheEdit, type HistoryRow } from "./history_rows_of_the_feed";
import { dayTheEditWasApplied, howLongAgoTheEditWasApplied } from "./when_an_edit_was_applied";

const NOTHING_TO_WATCH: StopWatching = () => undefined;
const BYLINE_REFRESH_EVERY_MS = 30_000;

/** What History is doing with the row last chosen. */
type HistoryChoice = { kind: "idle" } | { kind: "carrying_out"; transaction: string } | { kind: "refused"; lead: string; because: string };

function useWallClockForBylines(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const refresh = setInterval(() => setNowMs(Date.now()), BYLINE_REFRESH_EVERY_MS);
    return () => clearInterval(refresh);
  }, []);
  return nowMs;
}

function operationsWordsOf(operationCount: number): string | null {
  return operationCount > 1 ? `one transaction, ${operationCount} operations` : null;
}

function authoredChangeOf(row: HistoryRow, nowMs: number, isTheLatestApplied: boolean): AuthoredChange {
  const byline = [row.who, howLongAgoTheEditWasApplied(row.applied_at, nowMs), operationsWordsOf(row.operation_count), row.is_undone ? "undone" : null].filter((words) => words !== null).join(" · ");
  const choiceWords = row.is_undone ? "Redo up to this edit" : isTheLatestApplied ? "The project is at this edit" : "Undo back to this edit";
  return {
    change_id: row.transaction,
    author_kind: row.shown_author_kind,
    author_name: row.who,
    sentence: row.what,
    byline,
    operation_lines: row.operation_lines,
    is_undone: row.is_undone,
    is_the_current_change: isTheLatestApplied,
    choice_words: choiceWords,
  };
}

/** The open project's history: each edit as a row, newest first, chosen to undo back to it or redo forward to it. */
function HistoryBody({ connection, projectFolder }: { connection: TatoAppViewConnection; projectFolder: string }) {
  const projectTransactions = useViewReading(
    useCallback((listener: (reading: ProjectTransactionsReading) => void) => connection.watchProjectTransactions(projectFolder, listener), [connection, projectFolder]),
  );
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const activeStream = activeStreamTab?.stream ?? null;
  const activeStreamGraph = useViewReading(
    useCallback(
      (listener: (reading: StreamGraphReading) => void): StopWatching => (activeStream === null ? NOTHING_TO_WATCH : connection.watchStreamGraph(activeStream, listener)),
      [connection, activeStream],
    ),
  );
  const [historyChoice, setHistoryChoice] = useState<HistoryChoice>({ kind: "idle" });
  const nowMs = useWallClockForBylines();
  const transactionsNewestFirst = useMemo(() => (projectTransactions?.kind === "read" ? projectTransactions.project_transactions.transactions : []), [projectTransactions]);
  const historyRows = useMemo(() => {
    const nodeNames = new Map(nodeNamesTheFeedGives(transactionsNewestFirst));
    if (activeStreamGraph?.kind === "read") for (const node of activeStreamGraph.graph.nodes) nodeNames.set(node.id, node.name);
    return historyRowsOfTheFeed(transactionsNewestFirst, nodeNames);
  }, [transactionsNewestFirst, activeStreamGraph]);

  const goToTheRow = async (chosenTransaction: string) => {
    const stepsToTheRow = historyStepsToTheRow(historyRows, chosenTransaction);
    if (stepsToTheRow.kind === "unreachable") {
      setHistoryChoice({ kind: "refused", lead: "History can't go back there:", because: stepsToTheRow.because });
      return;
    }
    setHistoryChoice({ kind: "carrying_out", transaction: chosenTransaction });
    const answeredSoFar: ProjectTransaction[] = [];
    for (const step of stepsToTheRow.steps) {
      const applying = step.undo_or_redo === "undo" ? await connection.undoInTheProject(projectFolder, step.author) : await connection.redoInTheProject(projectFolder, step.author);
      if (applying.kind === "not_applied") {
        setHistoryChoice({ kind: "refused", lead: step.undo_or_redo === "undo" ? "Undo was refused:" : "Redo was refused:", because: applying.because });
        return;
      }
      answeredSoFar.unshift(applying.transaction);
      if (!theStepReachedItsEdit(step, applying.transaction, [...answeredSoFar, ...transactionsNewestFirst])) {
        setHistoryChoice({ kind: "refused", lead: "History stopped:", because: `${whoMadeTheEdit(step.author.kind, step.author.name)}'s ${step.undo_or_redo} reversed a different edit than the one History meant, so it went no further.` });
        return;
      }
    }
    setHistoryChoice({ kind: "idle" });
  };

  const latestAppliedTransaction = historyRows.find((row) => !row.is_undone)?.transaction ?? null;
  const historyRowsScroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (latestAppliedTransaction === null) return;
    historyRowsScroller.current?.querySelector(`[data-history-row="${CSS.escape(latestAppliedTransaction)}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [latestAppliedTransaction]);

  if (projectTransactions === null) return null;
  if (projectTransactions.kind === "not_read") return <WaitingState isFailure title="The project's history can't be read" explanation={projectTransactions.because} />;
  if (historyRows.length === 0) return <WaitingState title="No edits yet" explanation="Each edit to the project, by you, an agent or the runtime, shows here as it lands." />;
  const dayHeadings = historyRows.map((row) => dayTheEditWasApplied(row.applied_at, nowMs));
  return (
    <>
      {historyChoice.kind === "refused" && <RefusalLine layout="bar" lead={historyChoice.lead} words={historyChoice.because} />}
      <div ref={historyRowsScroller} className="scrollbar-thin min-h-0 flex-1 overflow-auto" data-history="">
        <AuthoredChangeList label="History">
          {historyRows.map((row, position) => (
            <Fragment key={row.transaction}>
              {dayHeadings[position] !== dayHeadings[position - 1] && <AuthoredChangeSectionHeading>{dayHeadings[position]}</AuthoredChangeSectionHeading>}
              <AuthoredChangeRow
                change={authoredChangeOf(row, nowMs, row.transaction === latestAppliedTransaction)}
                isChoosable={historyChoice.kind !== "carrying_out" && row.transaction !== latestAppliedTransaction}
                onChosen={(transaction) => void goToTheRow(transaction)}
                dataAttribute="data-history-row"
              />
            </Fragment>
          ))}
        </AuthoredChangeList>
        <p className="border-t border-studio-area-header-line px-3 py-2.5 text-2xs text-fg-3">
          Each row is one transaction from the project's change feed: who, what and when. Choose an earlier row to undo back to it, or a dimmed one to redo up to it; each edit is undone or redone by its own author.
        </p>
      </div>
    </>
  );
}

/** The History view's whole frame: the open project's edits, newest first, under its header row naming the project. */
export function HistoryView({ connection }: { connection: TatoAppViewConnection }) {
  const openProject = useViewReading(connection.watchOpenProject);
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const headerWords = openProject?.kind === "read" ? [openProject.open_project.project.name, activeStreamTab?.display_name].filter((words) => words !== undefined).join(" · ") : null;
  return (
    <CoreViewFrame connection={connection} headerTools={headerWords === null ? undefined : <span className="truncate text-2xs text-fg-3">{headerWords}</span>}>
      {openProject === null ? null : openProject.kind === "none_open" ? (
        <WaitingState title="No project is open" explanation="Open or create one from the File menu." />
      ) : openProject.kind === "unreadable" ? (
        <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} />
      ) : (
        <HistoryBody connection={connection} projectFolder={openProject.open_project.project.folder} />
      )}
    </CoreViewFrame>
  );
}
