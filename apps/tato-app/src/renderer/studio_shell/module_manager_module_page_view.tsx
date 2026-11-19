import { ArrowLeft, Box, Check, ChevronLeft, ChevronRight, Copy, Download, RefreshCw, TriangleAlert, Workflow, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { PackageCatalogMember, ViewsOfAWorkspaceDependency } from "../../shared/tatolab_backend_contract";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { CopyWordsButton } from "@tatolab/tato-app-view-sdk/design_system/copy_words_button";
import { IconButton } from "@tatolab/tato-app-view-sdk/design_system/icon_button";
import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import { KeyboardKey } from "@tatolab/tato-app-view-sdk/design_system/keyboard_key";
import { ModuleCover } from "@tatolab/tato-app-view-sdk/design_system/module_card";
import { PanelListRow } from "@tatolab/tato-app-view-sdk/design_system/panel_section";
import { ProgressMeter } from "@tatolab/tato-app-view-sdk/design_system/progress_meter";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { studioIconNamed } from "@tatolab/tato-app-view-sdk/design_system/support/studio_icons";
import {
  MODULE_ASK_WORDS_ONCE_DONE,
  whyTheRowBringsNothingOnThisMachine,
  whyTheRowNeedsANewerTatoStudio,
  type ModuleAsk,
  moduleCopyStateOf,
  moduleCoverNumberOf,
  moduleUpdateWordsOf,
  whyTheModuleHasNoUpdateToTake,
  moduleViewsShownOf,
  type ModuleCardRow,
} from "./module_manager_listing";
import { marketplaceAddShownOf, type MarketplaceAddFollowed } from "../presentation/marketplace_add_presentation";
import { presentTatolabAppUpdate } from "../presentation/app_update_presentation";
import { useTatolabAppUpdateAction } from "../setup_and_settings/action_through_the_backend";
import { useTatolabStatus, useTatolabWindowEnvironment } from "../setup_and_settings/tatolab_window_context";

/**
 * Where the last thing asked of one module stands: under way, refused in the words of what refused it, or done in a way its page tells of
 * (just added to the project, or a sample just cloned into the project in `folder`, whose window was then shown or refused in words).
 */
export type ModuleWork =
  | { kind: "under_way"; ask: ModuleAsk; words: string }
  | { kind: "refused"; ask: ModuleAsk; because: string }
  | { kind: "just_added" }
  | { kind: "just_cloned"; folder: string; showing_it_was_refused_because: string | null };

/** A heading over one kind of thing a module holds, with how many of it there are. */
function CountedHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="flex items-center gap-2 text-xs text-fg-2">
      {title}
      <span className="text-fg-3 tabular-nums">{count}</span>
    </h3>
  );
}

const MEMBER_LIST_CLASS_NAMES = "mt-1.5 rounded-lg border px-3 py-1";

function MemberRows({ title, icon, members }: { title: string; icon: ReactNode; members: readonly PackageCatalogMember[] }) {
  if (members.length === 0) return null;
  return (
    <div>
      <CountedHeading title={title} count={members.length} />
      <ul className={MEMBER_LIST_CLASS_NAMES}>
        {members.map((member) => (
          <PanelListRow key={member.import_path} icon={icon} name={<span className="font-mono text-xs">{member.name}</span>} detail={member.summary === "" ? member.import_path : member.summary} detailWraps />
        ))}
      </ul>
    </div>
  );
}

/** The views a module the project has brings, each a row, and what they can reach; or why the runtime listed none. */
function ViewsTheModuleBrings({ views }: { views: ViewsOfAWorkspaceDependency }) {
  const shown = useMemo(() => moduleViewsShownOf(views), [views]);
  const ViewIcon = studioIconNamed("project_view");
  if (shown.kind === "not_listed") return <RefusalLine tone="warning" lead="Its views could not be listed:" words={shown.because} data-module-manager-views-not-listed="" />;
  if (shown.rows.length === 0) return null;
  return (
    <div>
      <CountedHeading title="Views" count={shown.rows.length} />
      <ul className={MEMBER_LIST_CLASS_NAMES}>
        {shown.rows.map((viewRow) => (
          <PanelListRow
            key={viewRow.view_type_id}
            icon={<ViewIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />}
            name={viewRow.title}
            trailing={viewRow.opens ? viewRow.ports_words : undefined}
            detail={viewRow.opens ? undefined : <RefusalLine tone="warning" layout="under_field" lead="Doesn't open:" words={viewRow.not_opened_because} />}
            detailWraps
            data-module-manager-view={viewRow.view_type_id}
          />
        ))}
      </ul>
      {shown.reach_words !== null && (
        <p className="mt-1.5 text-xs text-fg-3" data-module-manager-views-reach="">
          {shown.reach_words}
        </p>
      )}
    </div>
  );
}

/** A module page's action, drawn across its column. */
function PageAction({
  appearance,
  icon,
  disabledReason,
  onPressed,
  children,
  ...controlDataAttributes
}: Pick<Parameters<typeof ActionButton>[0], "appearance" | "icon" | "disabledReason" | "onPressed" | "children"> & { [dataAttributeName: `data-${string}`]: string | undefined }) {
  return (
    <ActionButton appearance={appearance} icon={icon} disabledReason={disabledReason} onPressed={onPressed} className="h-10 w-full text-base" {...controlDataAttributes}>
      {children}
    </ActionButton>
  );
}

/** How something asked of a module went, once done: a line saying so behind a check, what it means, and what to do next. */
function PageOutcome({ title, children, ...controlDataAttributes }: { title: string; children: ReactNode; [dataAttributeName: `data-${string}`]: string | undefined }) {
  return (
    <div className="flex flex-col gap-3" {...controlDataAttributes}>
      <h3 className="flex items-start gap-2 text-lg font-semibold text-fg">
        <Check className="mt-0.5 size-4 shrink-0 text-status-positive-text" strokeWidth={2} aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  );
}

/** What a module's page is asked to do, each by the row it shows. */
export interface ModuleAsks {
  add: (row: ModuleCardRow) => void;
  clone: (row: ModuleCardRow) => void;
  update: (row: ModuleCardRow) => void;
  askBeforeRemoving: (row: ModuleCardRow) => void;
  showTheClonedProject: (row: ModuleCardRow, folder: string) => void;
  /** Stop the download of the row's Marketplace add; an add past its download runs to its end. */
  cancelTheAdd: (row: ModuleCardRow) => void;
}

/**
 * Tato Studio's own updates control, offered where a module needs the newer runtime a newer Tato Studio carries: Check for Updates…, then
 * Download Update or Restart to Update as the updater moves on, disabled while it works, its refusal shown under it; in an app that cannot
 * update itself, the updater's reason in its place.
 */
function TatoStudioUpdateOffer({ moduleName, appearance }: { moduleName: string; appearance: "primary" | "secondary" }) {
  const { backend } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const updates = presentTatolabAppUpdate(status.app_update);
  const runTheUpdateAction = useTatolabAppUpdateAction(backend, status.app_update);
  const { action } = runTheUpdateAction;
  if (action === null) return <p className="text-xs text-fg-3">{updates.description}</p>;
  const isUnderWay = !action.isEnabled || runTheUpdateAction.isPending;
  return (
    <>
      <PageAction appearance={appearance} icon={RefreshCw} disabledReason={isUnderWay ? updates.description : undefined} onPressed={runTheUpdateAction.run} data-module-manager-update-tato-studio={moduleName}>
        {action.label}
      </PageAction>
      {runTheUpdateAction.refusal !== null && <RefusalLine {...runTheUpdateAction.refusal} />}
      {runTheUpdateAction.refusal === null && updates.failure !== null && <RefusalLine lead="The last check failed:" words={updates.failure} />}
    </>
  );
}

/** A Marketplace add under way as told so far: its meter, filled by its bytes once their total is known, its stages, and Cancel while it downloads. */
function MarketplaceAddProgress({ row, followed, projectName, asks }: { row: ModuleCardRow; followed: MarketplaceAddFollowed; projectName: string; asks: ModuleAsks }) {
  const shown = marketplaceAddShownOf(followed, row.title, projectName);
  return (
    <div className="flex flex-col gap-3">
      <ProgressMeter label={shown.label} detail={shown.detail} percent={shown.percent} outcome="in_progress" parts={shown.parts} data-module-manager-work={row.row_id} data-module-manager-add-stage={followed.stage.kind} />
      {shown.cancel.kind === "offered" && (
        <PageAction icon={X} disabledReason={shown.cancel.disabledReason} onPressed={() => asks.cancelTheAdd(row)} data-module-manager-cancel-add={row.row_id}>
          {shown.cancel.words}
        </PageAction>
      )}
      {shown.cancelRefusedBecause !== null && <RefusalLine lead="The download was not cancelled:" words={shown.cancelRefusedBecause} data-module-manager-cancel-add-refusal="" />}
    </div>
  );
}

/** The right column of a module's page: what it is, the one thing to do with it, and how that went. */
function ModulePageActions({
  row,
  work,
  addFollowed,
  projectName,
  asks,
  onKeepBrowsing,
  onViewInTheProject,
}: {
  row: ModuleCardRow;
  work: ModuleWork | null;
  addFollowed: MarketplaceAddFollowed | null;
  projectName: string;
  asks: ModuleAsks;
  onKeepBrowsing: () => void;
  onViewInTheProject: () => void;
}) {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  const whyItBringsNothingHere = whyTheRowBringsNothingOnThisMachine(row);
  const whyItNeedsANewerTatoStudio = whyTheRowNeedsANewerTatoStudio(row);
  const retry = (ask: ModuleAsk) => ({ add: asks.add, clone: asks.clone, update: asks.update, remove: asks.askBeforeRemoving })[ask](row);
  const action = (() => {
    if (work?.kind === "under_way" && work.ask === "add" && addFollowed !== null) return <MarketplaceAddProgress row={row} followed={addFollowed} projectName={projectName} asks={asks} />;
    if (work?.kind === "under_way") {
      return <ProgressMeter label={work.words} detail="Leave this page any time. It keeps going." percent={null} outcome="in_progress" data-module-manager-work={row.row_id} />;
    }
    if (work?.kind === "just_cloned") {
      return (
        <PageOutcome title={`${row.title} was cloned into a new project`} data-module-manager-cloned={row.row_id}>
          <p className="text-sm text-fg-2">
            It is a project of its own now, open in its own window. {projectName} was not changed.
          </p>
          <PageAction appearance="primary" onPressed={() => asks.showTheClonedProject(row, work.folder)} data-module-manager-show-cloned-project="">
            Show the new project
          </PageAction>
          {work.showing_it_was_refused_because !== null && (
            <RefusalLine lead="The new project was not shown:" words={work.showing_it_was_refused_because} data-module-manager-show-cloned-project-refusal="" />
          )}
          <PageAction onPressed={onKeepBrowsing}>Keep browsing</PageAction>
        </PageOutcome>
      );
    }
    if (work?.kind === "just_added") {
      const nodeNames = entry === null ? [] : entry.nodes.map((node) => node.name);
      return (
        <PageOutcome title={`${row.title} is in ${projectName}`} data-module-manager-added={row.row_id}>
          {nodeNames.length > 0 && (
            <p className="text-sm text-fg-2">
              <span className="font-mono text-xs">{nodeNames.join(", ")}</span> {nodeNames.length === 1 ? "is" : "are"} in {projectName}'s node list now, ready for any of its streams.
            </p>
          )}
          <PageAction onPressed={onKeepBrowsing}>Keep browsing</PageAction>
          <PageAction onPressed={onViewInTheProject} data-module-manager-view-in-project="">
            View in {projectName}
          </PageAction>
        </PageOutcome>
      );
    }
    if (entry?.kind === "sample") {
      return (
        <div className="flex flex-col gap-3">
          {entry.download === null ? (
            <p className="text-xs text-fg-3">The catalog names no download for it yet.</p>
          ) : (
            <PageAction appearance="primary" icon={Copy} onPressed={() => asks.clone(row)} data-module-manager-clone={entry.name}>
              Clone sample
            </PageAction>
          )}
          <p className="text-xs text-fg-3">Downloaded, checked against its SHA-256, then made into a new project of its own. {projectName} is not changed.</p>
        </div>
      );
    }
    if (dependency === null) {
      if (entry === null) return null;
      if (entry.download === null) return <p className="text-xs text-fg-3">The catalog names no download for it yet.</p>;
      if (whyItBringsNothingHere !== null) return <RefusalLine tone="warning" words={whyItBringsNothingHere} data-module-manager-not-on-this-machine={entry.name} />;
      if (whyItNeedsANewerTatoStudio !== null) {
        return (
          <div className="flex flex-col gap-3">
            <RefusalLine tone="warning" words={whyItNeedsANewerTatoStudio} data-module-manager-needs-a-newer-runtime={entry.name} />
            <TatoStudioUpdateOffer moduleName={entry.name} appearance="primary" />
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-3">
          <PageAction appearance="primary" icon={Download} onPressed={() => asks.add(row)} data-module-manager-import={entry.name}>
            Add to {projectName}
          </PageAction>
          <p className="text-xs text-fg-3">Downloaded, checked against its SHA-256, then added to {projectName}.</p>
        </div>
      );
    }
    const copyState = moduleCopyStateOf(dependency);
    const updateWords = moduleUpdateWordsOf(row);
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm text-fg-2" data-module-manager-in-project={row.row_id}>
          <Check className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          In {projectName}
        </p>
        {whyItBringsNothingHere !== null && <RefusalLine tone="warning" words={whyItBringsNothingHere} data-module-manager-not-on-this-machine={dependency.folder} />}
        {copyState.kind === "update_available" && (
          <p className="text-xs font-medium text-brand-text" data-module-manager-update-available="">
            {updateWords.updateAvailable}
          </p>
        )}
        {whyItNeedsANewerTatoStudio !== null ? (
          <>
            <RefusalLine tone="warning" words={whyItNeedsANewerTatoStudio} data-module-manager-needs-a-newer-runtime={dependency.folder} />
            <TatoStudioUpdateOffer moduleName={dependency.folder} appearance="secondary" />
          </>
        ) : (
          copyState.kind === "check_refused" && <RefusalLine tone="warning" lead={updateWords.checkRefusedLead} words={copyState.because} />
        )}
        <PageAction
          appearance={copyState.kind === "update_available" ? "primary" : "secondary"}
          icon={RefreshCw}
          disabledReason={whyTheModuleHasNoUpdateToTake(dependency)}
          onPressed={() => asks.update(row)}
          data-module-manager-update={dependency.folder}
        >
          {dependency.edited_files.length > 0 ? "Update…" : "Update"}
        </PageAction>
        <PageAction appearance="quiet" onPressed={() => asks.askBeforeRemoving(row)} data-module-manager-remove={dependency.folder}>
          Uninstall…
        </PageAction>
      </div>
    );
  })();
  return (
    <aside className="sticky top-0 flex w-90 shrink-0 flex-col gap-4 self-start rounded-xl border bg-raised p-6" aria-label={`${row.title}, what to do with it`}>
      <div className="flex flex-col gap-1.5">
        {entry !== null && <span className="label-caps">{entry.kind === "sample" ? "Sample project" : "Package"}</span>}
        <h2 className="text-2xl font-semibold text-fg">{row.title}</h2>
        {row.summary !== "" && <p className="text-sm text-fg-2">{row.summary}</p>}
      </div>
      {work?.kind === "refused" && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-danger bg-danger-soft p-3.5" role="alert" data-module-manager-refusal={row.row_id}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-danger-text">
            <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {row.title} was not {MODULE_ASK_WORDS_ONCE_DONE[work.ask]}
          </h3>
          <p className="rounded-md bg-window p-2.5 font-mono text-xs break-words whitespace-pre-wrap text-fg select-text" data-module-manager-refusal-words="">
            {work.because}
          </p>
          <p className="text-xs text-fg-2">Nothing in {projectName} changed.</p>
          <div className="flex gap-2">
            <ActionButton appearance="primary" icon={RefreshCw} onPressed={() => retry(work.ask)} data-module-manager-retry="">
              Retry
            </ActionButton>
            <CopyWordsButton readTextToCopy={() => work.because} />
          </div>
        </div>
      )}
      {(work?.kind !== "refused" || work.ask === "update" || work.ask === "remove") && action}
      {entry !== null && <KeyValueRows rows={[["Version", entry.version]]} />}
    </aside>
  );
}

/** A module's own page: Back and where it is, its cover, its description, what's inside and its technical details down the left, and what to do with it on the right. */
export function ModulePage({
  row,
  position,
  rowCount,
  previousRowId,
  nextRowId,
  cameFromWords,
  work,
  addFollowed,
  projectName,
  asks,
  onBack,
  onRowOpened,
  onViewInTheProject,
}: {
  row: ModuleCardRow;
  position: number;
  rowCount: number;
  previousRowId: string | null;
  nextRowId: string | null;
  /** The tab Back returns to, as the breadcrumb names it. */
  cameFromWords: string;
  work: ModuleWork | null;
  /** The row's Marketplace add as told so far; `null` where none is under way or nothing has been told yet. */
  addFollowed: MarketplaceAddFollowed | null;
  projectName: string;
  asks: ModuleAsks;
  onBack: () => void;
  onRowOpened: (rowId: string) => void;
  onViewInTheProject: () => void;
}) {
  const { catalog_entry: entry, module_of_the_project: dependency } = row;
  const isASample = entry?.kind === "sample";
  const technicalDetails: KeyValueRow[] = [
    ...(entry === null ? [] : ([["Package", entry.name], ["Version", entry.version]] as const)),
    ...(entry === null || entry.download === null ? [] : ([["Download", entry.download.url], ["SHA-256", entry.download.sha256]] as const)),
    ...(dependency === null ? [] : ([["Folder", `imports/${dependency.folder}`], ["Copied from", dependency.source], ["Its copy", dependency.version]] as const)),
  ];
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-9 py-5" data-module-manager-detail={row.row_id}>
      <div className="mx-auto flex w-full max-w-300 flex-col gap-5">
        <div className="flex items-center gap-3">
          <ActionButton icon={ArrowLeft} onPressed={onBack} data-module-manager-back="">
            Back
          </ActionButton>
          <nav aria-label="Where this page is" className="flex min-w-0 items-center gap-1.5 text-sm text-fg-3">
            <span>{cameFromWords}</span>
            {entry !== null && cameFromWords === "Marketplace" && (
              <>
                <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>{isASample ? "Samples" : "Packages"}</span>
              </>
            )}
            <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate text-fg" aria-current="page">
              {row.title}
            </span>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-fg-3">
            <IconButton icon={ChevronLeft} label="Previous" disabledReason={previousRowId === null ? "This is the first" : null} onPressed={() => previousRowId !== null && onRowOpened(previousRowId)} data-module-manager-previous="" />
            <IconButton icon={ChevronRight} label="Next" disabledReason={nextRowId === null ? "This is the last" : null} onPressed={() => nextRowId !== null && onRowOpened(nextRowId)} data-module-manager-next="" />
            <span className="tabular-nums">
              {position} of {rowCount}
            </span>
            <KeyboardKey>esc</KeyboardKey>
          </div>
        </div>
        <div className="flex items-start gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <ModuleCover title={row.title} coverNumber={moduleCoverNumberOf(row)} size="page" />
            {row.summary !== "" && (
              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-fg">Description</h2>
                <p className="max-w-(--page-readable-width) text-base text-fg-2 select-text" data-module-manager-description="">
                  {row.summary}
                </p>
              </section>
            )}
            <section className="flex flex-col gap-3" data-module-manager-whats-inside="">
              <div>
                <h2 className="text-lg font-semibold text-fg">What's inside</h2>
                <p className="text-sm text-fg-3">{isASample ? "What the new project starts with." : dependency === null ? `What adding it brings to ${projectName}.` : `What it brought to ${projectName}.`}</p>
              </div>
              {entry !== null && (
                <>
                  <MemberRows title="Nodes" icon={<Box className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} members={entry.nodes} />
                  <MemberRows title="Streams" icon={<Workflow className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />} members={entry.streams} />
                </>
              )}
              {dependency !== null && <ViewsTheModuleBrings views={dependency.views} />}
              {entry === null && (dependency === null || dependency.views.kind !== "listed" || dependency.views.views.length === 0) && (
                <p className="text-xs text-fg-3">The catalog doesn't list it, so its nodes are named in {projectName}'s node list only.</p>
              )}
            </section>
            <section className="flex flex-col gap-3" data-module-manager-technical-details="">
              <h2 className="text-lg font-semibold text-fg">Technical details</h2>
              <KeyValueRows rows={technicalDetails} look="fields" />
              {dependency !== null && (
                <div>
                  <h3 className="text-xs text-fg-2">Edited since its copy ({dependency.edited_files.length})</h3>
                  {dependency.edited_files.length === 0 ? (
                    <p className="py-1.5 text-xs text-fg-3">Nothing in its folder was edited since it was copied.</p>
                  ) : (
                    <ul className="py-1 font-mono text-xs text-fg-2" data-module-manager-edited-files="">
                      {dependency.edited_files.map((editedFile) => (
                        <li key={editedFile}>{editedFile}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
          <ModulePageActions row={row} work={work} addFollowed={addFollowed} projectName={projectName} asks={asks} onKeepBrowsing={onBack} onViewInTheProject={onViewInTheProject} />
        </div>
      </div>
    </div>
  );
}
