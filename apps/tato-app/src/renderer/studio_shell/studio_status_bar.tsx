import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { ProgressMeter } from "@tatolab/tato-app-view-sdk/design_system/progress_meter";
import { StatusBarPanelButton } from "@tatolab/tato-app-view-sdk/design_system/status_bar_panel_button";
import type { ProjectTransactionsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { TatolabPlatform, TatolabStatus } from "../../shared/tatolab_backend_contract";
import {
  EMPTY_STUDIO_ACTIVITY_LOG,
  nextStudioActivityLog,
  studioActivityButtonWordsOf,
  studioActivityLogWithTheEndedCleared,
  type StudioActivity,
  type StudioActivityLog,
} from "../presentation/studio_activity_presentation";
import { studioStatusBarWordsOf } from "../presentation/studio_status_bar_presentation";
import { useRuntimeDescriptionReading, useTatolabStatus } from "../setup_and_settings/tatolab_window_context";
import type { StudioViewHostServices } from "../view_host/studio_view_contract";

/** How often the last edit's "2 minutes ago" is said again. */
const LAST_EDIT_WORDS_REFRESH_MS = 30_000;

/** The open project's change feed while `projectFolder` names one, re-rendering the caller on each reading. */
function useProjectTransactionsOf(viewHostServices: StudioViewHostServices, projectFolder: string | null): ProjectTransactionsReading | null {
  const [reading, setReading] = useState<ProjectTransactionsReading | null>(null);
  useEffect(() => {
    setReading(null);
    if (projectFolder === null) return undefined;
    return viewHostServices.watchProjectTransactions(projectFolder, setReading);
  }, [viewHostServices, projectFolder]);
  return reading;
}

/** The wall clock for display, read again every `everyMs`. */
function useWallClockForDisplay(everyMs: number): number {
  const [wallClockNowMs, setWallClockNowMs] = useState(() => Date.now());
  useEffect(() => {
    const repeatingTimer = setInterval(() => setWallClockNowMs(Date.now()), everyMs);
    return () => clearInterval(repeatingTimer);
  }, [everyMs]);
  return wallClockNowMs;
}

/** The window's activity log, moved on by each status the main process sends, with a way to clear its ended activities. */
function useStudioActivityLog(status: TatolabStatus): [StudioActivityLog, () => void] {
  const [activityLog, setActivityLog] = useState<StudioActivityLog>(EMPTY_STUDIO_ACTIVITY_LOG);
  useEffect(() => {
    setActivityLog((previousLog) => nextStudioActivityLog(previousLog, { listedStreams: status.streams, appUpdate: status.app_update }));
  }, [status.streams, status.app_update]);
  return [activityLog, () => setActivityLog(studioActivityLogWithTheEndedCleared)];
}

function StudioActivityProgressMeter({ activity }: { activity: StudioActivity }) {
  if (activity.kind === "in_progress") {
    return (
      <ProgressMeter
        label={activity.title}
        detail={activity.detail}
        percent={activity.progress.kind === "share_known" ? activity.progress.percent : null}
        outcome="in_progress"
        data-studio-activity={activity.activity_id}
      />
    );
  }
  return (
    <ProgressMeter
      label={activity.title}
      detail={activity.kind === "failed" ? activity.refusal : activity.detail}
      percent={null}
      outcome={activity.kind}
      data-studio-activity={activity.activity_id}
    />
  );
}

/** Who last opened the Activity panel: the person pressing it, or work starting while nothing was under way, which opens it without moving the person's focus. */
type StudioActivityPanelOpening = { isOpen: false } | { isOpen: true; openedBy: "the_person" | "work_starting" };

/** The panel's opening, opened by itself each time work starts while none was under way. */
function useStudioActivityPanelOpening(inProgressCount: number): [StudioActivityPanelOpening, (isOpen: boolean) => void] {
  const [panelOpening, setPanelOpening] = useState<StudioActivityPanelOpening>({ isOpen: false });
  const inProgressCountBefore = useRef(0);
  useEffect(() => {
    if (inProgressCountBefore.current === 0 && inProgressCount > 0) setPanelOpening({ isOpen: true, openedBy: "work_starting" });
    inProgressCountBefore.current = inProgressCount;
  }, [inProgressCount]);
  return [panelOpening, (isOpen) => setPanelOpening(isOpen ? { isOpen: true, openedBy: "the_person" } : { isOpen: false })];
}

/** The studio's Activity: a status bar phrase naming what downloads or installs now, opening a panel of each under way with its progress and each ended since the window opened; it opens by itself when work starts. */
function StudioActivityPanelButton({ status }: { status: TatolabStatus }) {
  const [activityLog, clearTheEndedActivities] = useStudioActivityLog(status);
  const [panelOpening, setThePanelOpen] = useStudioActivityPanelOpening(activityLog.in_progress.length);
  const words = studioActivityButtonWordsOf(activityLog);
  if (words === null) return null;
  return (
    <StatusBarPanelButton
      words={words}
      isBusy={activityLog.in_progress.length > 0}
      isFailing={activityLog.in_progress.length === 0 && activityLog.ended.some((activity) => activity.kind === "failed")}
      panelTitle="Activity"
      isOpen={panelOpening.isOpen}
      onOpenChange={setThePanelOpen}
      takesFocusOnOpen={!panelOpening.isOpen || panelOpening.openedBy === "the_person"}
      panelActions={
        activityLog.ended.length > 0 && (
          <ActionButton appearance="quiet" size="small" onPressed={clearTheEndedActivities} data-studio-activity-clear="">
            Clear finished
          </ActionButton>
        )
      }
      data-studio-status-bar-activity=""
    >
      <div className="flex flex-col divide-y divide-line" data-studio-activity-panel="">
        {activityLog.in_progress.map((activity) => (
          <StudioActivityProgressMeter key={activity.activity_id} activity={activity} />
        ))}
        {activityLog.ended.map((activity, endedIndex) => (
          <StudioActivityProgressMeter key={`ended-${activityLog.ended.length - endedIndex}`} activity={activity} />
        ))}
      </div>
    </StatusBarPanelButton>
  );
}

/** The studio's foot: the runtime and where it runs, the open stream's state and size, what downloads or installs, the project's last edit and who made it, and the shortcuts this build answers. */
export function StudioStatusBar({
  viewHostServices,
  projectFolder,
  activeStream,
  platform,
}: {
  viewHostServices: StudioViewHostServices;
  projectFolder: string | null;
  activeStream: string | null;
  platform: TatolabPlatform;
}) {
  const status = useTatolabStatus();
  const runtimeDescription = useRuntimeDescriptionReading();
  const projectTransactions = useProjectTransactionsOf(viewHostServices, projectFolder);
  const wallClockNowMs = useWallClockForDisplay(LAST_EDIT_WORDS_REFRESH_MS);
  const words = studioStatusBarWordsOf({
    runtimeState: status.runtime_state,
    runtimeDescription,
    listedStreams: status.streams,
    activeStream,
    projectTransactions,
    platform,
    wallClockNowMs,
  });
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 bg-studio-menu-bar px-3 text-2xs text-fg-3" aria-label="Status" data-studio-status-bar="">
      <span className={cn(words.runtime_tone === "not_running" && "text-danger-text")} data-studio-status-bar-runtime={words.runtime_tone}>
        {words.runtime}
      </span>
      {words.open_stream !== null && <span data-studio-status-bar-open-stream="">{words.open_stream}</span>}
      <StudioActivityPanelButton status={status} />
      <span className="flex-1" />
      {words.last_edit !== null && <span data-studio-status-bar-last-edit="">{words.last_edit}</span>}
      <span data-studio-status-bar-shortcuts="">{words.shortcuts}</span>
    </footer>
  );
}
