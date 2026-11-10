import { cn } from "cn";
import { useEffect, useState } from "react";
import type { ProjectTransactionsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { studioStatusBarWordsOf } from "../presentation/studio_status_bar_presentation";
import { useRuntimeDescriptionReading, useTatolabStatus } from "../setup_and_preferences/tatolab_window_context";
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

/** The studio's foot: the runtime and where it runs, the open stream's state and size, the project's last edit and who made it, and the shortcuts this build answers. */
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
      <span className="flex-1" />
      {words.last_edit !== null && <span data-studio-status-bar-last-edit="">{words.last_edit}</span>}
      <span data-studio-status-bar-shortcuts="">{words.shortcuts}</span>
    </footer>
  );
}
