import type { ListedStreamsReading, OpenProjectReading, ProjectTransaction, ProjectTransactionsReading, RefusedProjectAction, StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { CodeBlock } from "@tatolab/tato-app-view-sdk/design_system/code_block";
import { CopyWordsButton } from "@tatolab/tato-app-view-sdk/design_system/copy_words_button";
import { KeyValueRows } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { FieldMenu, MenuGroup, MenuItem, MenuSeparator, MenuSingleChoiceGroup, MoreActionsMenu } from "@tatolab/tato-app-view-sdk/design_system/menus";
import { RecordTable, type RecordTableColumn } from "@tatolab/tato-app-view-sdk/design_system/record_table";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { SidePanel, WorkAreaWithSidePanel } from "@tatolab/tato-app-view-sdk/design_system/side_panel";
import { StatusChip } from "@tatolab/tato-app-view-sdk/design_system/status_chip";
import { writeTextToClipboard } from "@tatolab/tato-app-view-sdk/design_system/support/clipboard";
import { downloadTextAsFile } from "@tatolab/tato-app-view-sdk/design_system/support/file_download";
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { useCallback, useMemo, useState } from "react";
import { CoreViewFrame } from "../shared/core_view_page";
import {
  changeFeedEntryAsJson,
  NO_TRANSACTIONS_FILTER,
  refusedNamesRowsOf,
  refusedOperationWordsOf,
  streamWordsByOperationStream,
  transactionsFilterButtonWordsOf,
  transactionsFilterChoicesOf,
  transactionsFiltersOnCount,
  TRANSACTIONS_LOG_FOLLOWING_THE_FEED,
  transactionsLogAsJson,
  transactionsLogCleared,
  transactionsLogFileNameOf,
  transactionsLogPausedOrResumed,
  transactionsLogRowsShown,
  transactionsViewRowsAsJson,
  transactionsViewRowsOf,
  transactionsViewRowsShownBy,
  type TransactionsLogHolding,
  type TransactionsViewFilter,
  type TransactionsViewRow,
} from "./transactions_view_rows";

const TRANSACTIONS_COLUMNS: readonly RecordTableColumn[] = [
  { column_id: "time", heading: "Time", isMachineWords: true },
  { column_id: "author", heading: "Author" },
  { column_id: "stream", heading: "Stream" },
  { column_id: "mode", heading: "Mode" },
  { column_id: "operations", heading: "Operations" },
  { column_id: "result", heading: "Result" },
  { column_id: "commit", heading: "Commit", isMachineWords: true },
];

/** A row's mode and result, each as a chip in the tone the row gives it. */
function ModeChip({ row }: { row: TransactionsViewRow }) {
  return <StatusChip tone={row.mode_chip_tone}>{row.mode_words}</StatusChip>;
}

function ResultChip({ row }: { row: TransactionsViewRow }) {
  return <StatusChip tone={row.result_chip_tone}>{row.result}</StatusChip>;
}

/** The detail panel's title row: what ran, then its mode and result. */
function TransactionDetailTitle({ row }: { row: TransactionsViewRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{row.operations_words}</span>
      <ModeChip row={row} />
      <ResultChip row={row} />
    </span>
  );
}

/** The choice that narrows nothing; every other choice is a value behind its own prefix, so no value can be mistaken for it. */
const NO_NARROWING_FILTER_CHOICE = "transactions-filter:no-narrowing";
const NARROWING_FILTER_CHOICE_PREFIX = "transactions-filter:value:";

function choicesWithAny(anyWords: string, values: readonly string[]) {
  return [{ choice: NO_NARROWING_FILTER_CHOICE, label: anyWords }, ...values.map((value) => ({ choice: `${NARROWING_FILTER_CHOICE_PREFIX}${value}`, label: value }))];
}

function choiceOf(narrowing: string | null): string {
  return narrowing === null ? NO_NARROWING_FILTER_CHOICE : `${NARROWING_FILTER_CHOICE_PREFIX}${narrowing}`;
}

function narrowingOf(choice: string): string | null {
  return choice.startsWith(NARROWING_FILTER_CHOICE_PREFIX) ? choice.slice(NARROWING_FILTER_CHOICE_PREFIX.length) : null;
}

/** The labelled Filter ▾ menu: Result, Author, Stream and Operation, each one choice, and Clear filters. */
function TransactionsFilterMenu({
  rows,
  filter,
  onFilterChanged,
}: {
  rows: readonly TransactionsViewRow[];
  filter: TransactionsViewFilter;
  onFilterChanged: (filter: TransactionsViewFilter) => void;
}) {
  const choices = useMemo(() => transactionsFilterChoicesOf(rows), [rows]);
  const filtersOn = transactionsFiltersOnCount(filter);
  const buttonWords = transactionsFilterButtonWordsOf(filtersOn);
  return (
    <FieldMenu label={buttonWords.label} words={buttonWords.words} isNarrowing={filtersOn > 0} data-transactions-filter="">
      <MenuGroup label="Result">
        <MenuSingleChoiceGroup<string>
          choices={choicesWithAny("Any result", choices.results)}
          chosen={choiceOf(filter.result)}
          onChosen={(choice) => onFilterChanged({ ...filter, result: choices.results.find((result) => result === narrowingOf(choice)) ?? null })}
          dataAttributeOfEachChoice="data-transactions-filter-result"
        />
      </MenuGroup>
      <MenuGroup label="Author">
        <MenuSingleChoiceGroup<string>
          choices={choicesWithAny("Anyone", choices.author_words)}
          chosen={choiceOf(filter.author_words)}
          onChosen={(choice) => onFilterChanged({ ...filter, author_words: narrowingOf(choice) })}
          dataAttributeOfEachChoice="data-transactions-filter-author"
        />
      </MenuGroup>
      <MenuGroup label="Stream">
        <MenuSingleChoiceGroup<string>
          choices={choicesWithAny("All streams", choices.stream_words)}
          chosen={choiceOf(filter.stream_words)}
          onChosen={(choice) => onFilterChanged({ ...filter, stream_words: narrowingOf(choice) })}
          dataAttributeOfEachChoice="data-transactions-filter-stream"
        />
      </MenuGroup>
      <MenuGroup label="Operation">
        <MenuSingleChoiceGroup<string>
          choices={choicesWithAny("Any", choices.operation_verbs)}
          chosen={choiceOf(filter.operation_verb)}
          onChosen={(choice) => onFilterChanged({ ...filter, operation_verb: narrowingOf(choice) })}
          dataAttributeOfEachChoice="data-transactions-filter-operation"
        />
      </MenuGroup>
      <MenuSeparator />
      <MenuItem isDisabled={filtersOn === 0} onChosen={() => onFilterChanged({ ...NO_TRANSACTIONS_FILTER, search_words: filter.search_words })} data-transactions-filter-clear="">
        Clear filters
      </MenuItem>
    </FieldMenu>
  );
}

/** The selected transaction: who made it and from where, then what it ran and what undoes it, as the runtime sent them. */
function AppliedTransactionDetail({ row, transaction }: { row: TransactionsViewRow; transaction: ProjectTransaction }) {
  return (
    <SidePanel
      label="Selected transaction"
      title={<TransactionDetailTitle row={row} />}
      actions={<CopyWordsButton appearance="quiet" readTextToCopy={() => changeFeedEntryAsJson(row.sent)} data-transactions-detail-copy="" />}
      hiding={null}
      data-transactions-detail={row.row_id}
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        <KeyValueRows rows={[["Author", row.author_words]]} />
        <KeyValueRows
          look="fields"
          rows={[
            ["Transaction", transaction.transaction],
            ["Commit", transaction.commit],
            ["Parent", transaction.parent_commit ?? "none, the project's first"],
            ...(transaction.undoes === null ? [] : [["Undoes", transaction.undoes] as const]),
            ...(transaction.redoes === null ? [] : [["Redoes", transaction.redoes] as const]),
          ]}
          data-transactions-detail-ids=""
        />
        <CodeBlock fileName="operations" code={JSON.stringify(transaction.operations, null, 2)} data-transactions-detail-operations="" />
        <CodeBlock fileName="inverse_operations" code={JSON.stringify(transaction.inverse_operations, null, 2)} data-transactions-detail-inverse-operations="" />
      </div>
    </SidePanel>
  );
}

/** The selected refused action: why the runtime refused it, in its own words, who asked and what it asked for. */
function RefusedActionDetail({ row, refusedAction }: { row: TransactionsViewRow; refusedAction: RefusedProjectAction }) {
  const refusedOperationWords = refusedOperationWordsOf(refusedAction);
  const refusedNamesRows = refusedNamesRowsOf(refusedAction);
  return (
    <SidePanel
      label="Selected refused action"
      title={<TransactionDetailTitle row={row} />}
      actions={<CopyWordsButton appearance="quiet" readTextToCopy={() => changeFeedEntryAsJson(row.sent)} data-transactions-detail-copy="" />}
      hiding={null}
      data-transactions-detail={row.row_id}
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        <RuntimeFailureWords words={refusedAction.refusal.runtime_words} data-transactions-detail-refusal="" />
        <KeyValueRows
          rows={[
            ["Author", row.author_words],
            ["Action", refusedAction.refusal.action],
            ...(refusedOperationWords === null ? [] : [["Operation", refusedOperationWords] as const]),
          ]}
        />
        {refusedNamesRows.length === 0 ? null : <KeyValueRows look="fields" rows={refusedNamesRows} data-transactions-detail-refused-names="" />}
        {refusedAction.operations.length === 0 ? null : <CodeBlock fileName="operations" code={JSON.stringify(refusedAction.operations, null, 2)} data-transactions-detail-operations="" />}
      </div>
    </SidePanel>
  );
}

function TransactionDetail({ row }: { row: TransactionsViewRow }) {
  return row.sent.kind === "applied" ? <AppliedTransactionDetail row={row} transaction={row.sent.transaction} /> : <RefusedActionDetail row={row} refusedAction={row.sent.refused_action} />;
}

/** The feed's rows, newest first, filtered, beside the selected one's detail, or why there are none to show. */
function TransactionsTableAndDetail({ feed, rows, shownRows, wasCleared }: { feed: ProjectTransactionsReading | null; rows: readonly TransactionsViewRow[]; shownRows: readonly TransactionsViewRow[]; wasCleared: boolean }) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  if (feed === null) return <WaitingState title="Reading the project's transactions" data-transactions-state="reading" />;
  if (feed.kind === "not_read") return <WaitingState isFailure title="The project's transactions weren't read" explanation={feed.because} data-transactions-state="not_read" />;
  if (rows.length === 0 && wasCleared) {
    return <WaitingState title="The view is cleared" explanation="Each change the runtime applies or refuses from now on shows here." data-transactions-state="cleared" />;
  }
  if (rows.length === 0) {
    return <WaitingState title="No transactions yet" explanation="Each change the runtime applies or refuses in this project shows here." data-transactions-state="none_yet" />;
  }
  if (shownRows.length === 0) {
    return <WaitingState title="No transaction matches" explanation="Clear the filters or the search to see every transaction." data-transactions-state="none_shown" />;
  }
  const selectedRow = shownRows.find((row) => row.row_id === selectedRowId) ?? null;
  return (
    <WorkAreaWithSidePanel sidePanel={selectedRow === null ? null : <TransactionDetail row={selectedRow} />}>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto" data-transactions-table="">
        <RecordTable
          label="Transactions"
          columns={TRANSACTIONS_COLUMNS}
          selectedRowId={selectedRow?.row_id ?? null}
          onRowSelected={setSelectedRowId}
          rows={shownRows.map((row) => ({
            row_id: row.row_id,
            tone: row.result === "refused" ? "danger" : "plain",
            cells: [row.happened_at_words, row.author_words, row.stream_cell_words, <ModeChip key="mode" row={row} />, row.operations_words, <ResultChip key="result" row={row} />, row.commit_cell_words],
            trailing: (
              <MoreActionsMenu label={`More for ${row.operations_words}`} data-transactions-row-menu={row.row_id}>
                <MenuItem onChosen={() => void writeTextToClipboard(changeFeedEntryAsJson(row.sent))} data-transactions-copy-as-json={row.row_id}>
                  Copy as JSON
                </MenuItem>
              </MoreActionsMenu>
            ),
          }))}
        />
      </div>
    </WorkAreaWithSidePanel>
  );
}

/** The open project's change feed, its search, Filter ▾ and log menu in the header row. */
function TransactionsOfTheProject({ connection, projectFolder, projectName }: { connection: TatoAppViewConnection; projectFolder: string; projectName: string }) {
  const watchTheFeed = useCallback(
    (listener: (reading: ProjectTransactionsReading) => void): StopWatching => connection.watchProjectTransactions(projectFolder, listener),
    [connection, projectFolder],
  );
  const feed = useViewReading(watchTheFeed);
  const listedStreams = useViewReading(useCallback((listener: (reading: ListedStreamsReading) => void) => connection.watchListedStreams(listener), [connection]));
  const [filter, setFilter] = useState<TransactionsViewFilter>(NO_TRANSACTIONS_FILTER);
  const [logHolding, setLogHolding] = useState<TransactionsLogHolding>(TRANSACTIONS_LOG_FOLLOWING_THE_FEED);
  const rowsOfTheFeed = useMemo(() => {
    if (feed?.kind !== "read") return [];
    const streamWordsOf = streamWordsByOperationStream(listedStreams?.kind === "listed" ? listedStreams.streams : []);
    return transactionsViewRowsOf(feed.project_transactions, streamWordsOf);
  }, [feed, listedStreams]);
  const rows = useMemo(() => transactionsLogRowsShown(rowsOfTheFeed, logHolding), [rowsOfTheFeed, logHolding]);
  const shownRows = useMemo(() => transactionsViewRowsShownBy(rows, filter), [rows, filter]);
  return (
    <CoreViewFrame
      connection={connection}
      toolbarLabel="Transactions tools"
      toolbarTools={
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <StatusChip tone="caution" data-transactions-developer-chip="">
            Developer
          </StatusChip>
          {logHolding.rows_when_paused === null ? null : (
            <StatusChip tone="neutral" data-transactions-paused-chip="">
              Paused
            </StatusChip>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <SearchField label="Search transactions" placeholder="Search transactions" text={filter.search_words} onTextChanged={(searchWords) => setFilter({ ...filter, search_words: searchWords })} data-transactions-search="" />
            <TransactionsFilterMenu rows={rows} filter={filter} onFilterChanged={setFilter} />
            <MoreActionsMenu label="More for the transactions log" data-transactions-log-menu="">
              <MenuItem
                isDisabled={feed?.kind !== "read"}
                onChosen={() => {
                  if (feed?.kind === "read") downloadTextAsFile(transactionsLogFileNameOf(projectName), transactionsLogAsJson(feed.project_transactions), "application/json");
                }}
                data-transactions-download=""
              >
                Download transaction logs
              </MenuItem>
              <MenuItem onChosen={() => setLogHolding((holding) => transactionsLogPausedOrResumed(holding, rowsOfTheFeed))} data-transactions-pause="">
                {logHolding.rows_when_paused === null ? "Pause the log" : "Resume the log"}
              </MenuItem>
              <MenuItem isDisabled={shownRows.length === 0} onChosen={() => void writeTextToClipboard(transactionsViewRowsAsJson(shownRows))} data-transactions-copy-shown-as-json="">
                Copy shown rows as JSON
              </MenuItem>
              <MenuItem isDisabled={rows.length === 0} onChosen={() => setLogHolding((holding) => transactionsLogCleared(holding, rowsOfTheFeed))} data-transactions-clear-view="">
                Clear the view
              </MenuItem>
            </MoreActionsMenu>
          </div>
        </div>
      }
    >
      <TransactionsTableAndDetail feed={feed} rows={rows} shownRows={shownRows} wasCleared={logHolding.cleared_row_ids.size > 0} />
    </CoreViewFrame>
  );
}

/** The Transactions view's whole frame: every transaction the runtime recorded in the open project, under its header row. */
export function TransactionsView({ connection }: { connection: TatoAppViewConnection }) {
  const openProject = useViewReading(useCallback((listener: (reading: OpenProjectReading) => void) => connection.watchOpenProject(listener), [connection]));
  if (openProject?.kind === "read") return <TransactionsOfTheProject key={openProject.open_project.project.folder} connection={connection} projectFolder={openProject.open_project.project.folder} projectName={openProject.open_project.project.name} />;
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Transactions tools">
      {openProject === null ? null : openProject.kind === "none_open" ? (
        <WaitingState title="No project is open" explanation="Open or create one from the File menu." data-transactions-state="no_project" />
      ) : (
        <WaitingState isFailure title={`${openProject.folder} can't be read`} explanation={openProject.refusal} data-transactions-state="project_unreadable" />
      )}
    </CoreViewFrame>
  );
}
