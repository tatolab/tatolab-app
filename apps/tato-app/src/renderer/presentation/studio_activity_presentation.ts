// What the studio's Activity panel lists: each download and install the runtime or the app is doing,
// with its progress, and each that has ended since the window opened, with how it ended.

import type { ProgressMeterPart } from "@tatolab/tato-app-view-sdk/design_system/progress_meter";
import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";
import { STREAM_ACTION_STEP_MAKING_THE_VENV, type ProjectVenvSyncUnderWay, type StreamActionVenvSync, type StreamActionVenvSyncPackage, type TatolabAppUpdateState } from "../../shared/tatolab_backend_contract";


/** How many ended activities the panel keeps, newest first. */
export const ENDED_STUDIO_ACTIVITIES_KEPT = 20;

/** How far one activity has got: a share of its whole when the source says, else only that it is under way. */
export type StudioActivityProgress = { kind: "share_known"; percent: number } | { kind: "share_unknown" };


/** One download or install in the Activity panel, under way or ended. */
export type StudioActivity =
  | { activity_id: string; title: string; kind: "in_progress"; detail: string; progress: StudioActivityProgress; package_lines: ProgressMeterPart[] }
  | { activity_id: string; title: string; kind: "done"; detail: string }
  | { activity_id: string; title: string; kind: "failed"; refusal: string };

/** What the Activity panel holds: the activities under way, then the ended ones, newest first. */
export interface StudioActivityLog {
  in_progress: StudioActivity[];
  ended: StudioActivity[];
}

/** The log of a window that has seen no activity yet. */
export const EMPTY_STUDIO_ACTIVITY_LOG: StudioActivityLog = { in_progress: [], ended: [] };

/** What the Activity panel reads on each status: the runtime's listed streams, each project's sync under way, and the app's update. */
export interface StudioActivitySources {
  listedStreams: readonly ListedStream[] | null;
  projectVenvSyncsUnderWay: readonly ProjectVenvSyncUnderWay[];
  appUpdate: TatolabAppUpdateState;
}

function projectNameOfTheFolder(projectDirectory: string): string {
  return projectDirectory.split("/").filter((folderName) => folderName !== "").at(-1) ?? projectDirectory;
}

const PYTHON_PACKAGES_ACTIVITY_PREFIX = "python_packages:";
const APP_UPDATE_ACTIVITY_PREFIX = "app_update:";

const BYTES_PER_MEGABYTE = 1_000_000;

function megabytesOf(bytes: number): string {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

const VENV_SYNC_PACKAGE_STATE_WORDS: Readonly<Record<string, string>> = {
  downloading: "Downloading",
  downloaded: "Downloaded",
  building: "Building",
  built: "Built",
  installed: "Installed",
  uninstalled: "Removed",
};

function packageLineOf(venvSyncPackage: StreamActionVenvSyncPackage): ProgressMeterPart {
  const name = venvSyncPackage.kind === "python_interpreter" ? `Python (${venvSyncPackage.name})` : venvSyncPackage.name;
  const detailParts = [
    venvSyncPackage.version,
    VENV_SYNC_PACKAGE_STATE_WORDS[venvSyncPackage.state] ?? venvSyncPackage.state,
    venvSyncPackage.download_size_bytes === null ? null : megabytesOf(venvSyncPackage.download_size_bytes),
  ];
  return { name, detail: detailParts.filter((detailPart) => detailPart !== null).join(" · ") };
}

/** The sized downloads uv has finished and named so far; uv names each download only as it starts, so the whole is never known ahead. */
function downloadedBytesOf(venvSync: StreamActionVenvSync): { downloadedBytes: number; namedBytes: number } {
  const sizedPackages = venvSync.packages.filter((venvSyncPackage) => venvSyncPackage.download_size_bytes !== null);
  const namedBytes = sizedPackages.reduce((sum, venvSyncPackage) => sum + (venvSyncPackage.download_size_bytes ?? 0), 0);
  const downloadedBytes = sizedPackages
    .filter((venvSyncPackage) => venvSyncPackage.state !== "downloading")
    .reduce((sum, venvSyncPackage) => sum + (venvSyncPackage.download_size_bytes ?? 0), 0);
  return { downloadedBytes, namedBytes };
}

function packagesCountWords(packageCount: number | null): string {
  if (packageCount === null) return "packages";
  return packageCount === 1 ? "1 package" : `${packageCount} packages`;
}

function detailAndProgressOfTheSync(venvSync: StreamActionVenvSync): { detail: string; progress: StudioActivityProgress } {
  switch (venvSync.phase) {
    case "resolving":
      return { detail: "Resolving packages…", progress: { kind: "share_unknown" } };
    case "downloading": {
      const { downloadedBytes, namedBytes } = downloadedBytesOf(venvSync);
      if (namedBytes === 0) return { detail: "Downloading…", progress: { kind: "share_unknown" } };
      return {
        detail: `Downloading ${venvSync.downloads_done} of ${venvSync.downloads_started} · ${megabytesOf(downloadedBytes)} of ${megabytesOf(namedBytes)}`,
        progress: { kind: "share_unknown" },
      };
    }
    case "building":
      return { detail: "Building packages…", progress: { kind: "share_unknown" } };
    case "installing":
      return { detail: "Installing packages…", progress: { kind: "share_unknown" } };
    case "installed":
      if (venvSync.packages_installed === 0) return { detail: "Packages already up to date", progress: { kind: "share_known", percent: 100 } };
      return { detail: `Installed ${packagesCountWords(venvSync.packages_installed)}`, progress: { kind: "share_known", percent: 100 } };
    default:
      return { detail: "Downloading and installing…", progress: { kind: "share_unknown" } };
  }
}

function pythonPackagesActivitiesOf(listedStreams: readonly ListedStream[] | null, projectVenvSyncsUnderWay: readonly ProjectVenvSyncUnderWay[]): StudioActivity[] {
  const projectFoldersInstalling = new Set(
    (listedStreams ?? []).flatMap((listedStream) =>
      listedStream.step === STREAM_ACTION_STEP_MAKING_THE_VENV && listedStream.location !== null ? [listedStream.location.project_directory] : [],
    ),
  );
  return [...projectFoldersInstalling].map((projectFolder) => {
    const venvSync = projectVenvSyncsUnderWay.find((syncUnderWay) => syncUnderWay.project_directory === projectFolder)?.venv_sync ?? null;
    const { detail, progress } = venvSync === null ? { detail: "Downloading and installing…", progress: { kind: "share_unknown" } as const } : detailAndProgressOfTheSync(venvSync);
    return {
      activity_id: `${PYTHON_PACKAGES_ACTIVITY_PREFIX}${projectFolder}`,
      title: `${projectNameOfTheFolder(projectFolder)}'s Python packages`,
      kind: "in_progress",
      detail,
      progress,
      package_lines: venvSync === null ? [] : venvSync.packages.map(packageLineOf),
    };
  });
}

function appUpdateActivitiesOf(appUpdate: TatolabAppUpdateState): StudioActivity[] {
  if (appUpdate.kind !== "downloading") return [];
  return [
    {
      activity_id: `${APP_UPDATE_ACTIVITY_PREFIX}${appUpdate.version}`,
      title: `Tato Studio ${appUpdate.version}`,
      kind: "in_progress",
      detail: `Downloading · ${Math.round(appUpdate.percent)}%`,
      progress: { kind: "share_known", percent: appUpdate.percent },
      package_lines: [],
    },
  ];
}

/** Every download and install under way in `sources`. */
export function studioActivitiesInProgressOf(sources: StudioActivitySources): StudioActivity[] {
  return [...pythonPackagesActivitiesOf(sources.listedStreams, sources.projectVenvSyncsUnderWay), ...appUpdateActivitiesOf(sources.appUpdate)];
}

function endOfThePythonPackagesActivity(activity: StudioActivity, projectFolder: string, listedStreams: readonly ListedStream[] | null): StudioActivity {
  const failedStream = (listedStreams ?? []).find((listedStream) => listedStream.location?.project_directory === projectFolder && listedStream.state === "failed");
  return failedStream === undefined
    ? { activity_id: activity.activity_id, title: activity.title, kind: "done", detail: "Installed" }
    : { activity_id: activity.activity_id, title: activity.title, kind: "failed", refusal: failedStream.failed_because ?? `${failedStream.display_name} failed.` };
}

function endOfTheAppUpdateActivity(activity: StudioActivity, appUpdate: TatolabAppUpdateState): StudioActivity {
  if (appUpdate.kind === "failed") return { activity_id: activity.activity_id, title: activity.title, kind: "failed", refusal: appUpdate.refusal };
  return { activity_id: activity.activity_id, title: activity.title, kind: "done", detail: appUpdate.kind === "ready_to_restart" ? "Downloaded · ready to restart" : "Downloaded" };
}

function endOfTheActivity(activity: StudioActivity, sources: StudioActivitySources): StudioActivity {
  if (activity.activity_id.startsWith(PYTHON_PACKAGES_ACTIVITY_PREFIX)) {
    return endOfThePythonPackagesActivity(activity, activity.activity_id.slice(PYTHON_PACKAGES_ACTIVITY_PREFIX.length), sources.listedStreams);
  }
  return endOfTheAppUpdateActivity(activity, sources.appUpdate);
}

/** The log after a status reading `sources`: what is under way now, and each activity that was under way and no longer is, ended as the status says. */
export function nextStudioActivityLog(previousLog: StudioActivityLog, sources: StudioActivitySources): StudioActivityLog {
  const inProgress = studioActivitiesInProgressOf(sources);
  const stillInProgressIds = new Set(inProgress.map((activity) => activity.activity_id));
  const justEnded = previousLog.in_progress.filter((activity) => !stillInProgressIds.has(activity.activity_id)).map((activity) => endOfTheActivity(activity, sources));
  if (justEnded.length === 0 && inProgress.length === previousLog.in_progress.length && inProgress.every((activity, index) => sameActivity(activity, previousLog.in_progress[index]))) {
    return previousLog;
  }
  return { in_progress: inProgress, ended: [...justEnded, ...previousLog.ended].slice(0, ENDED_STUDIO_ACTIVITIES_KEPT) };
}

function sameActivity(activity: StudioActivity, other: StudioActivity | undefined): boolean {
  return other !== undefined && JSON.stringify(activity) === JSON.stringify(other);
}

/** The log with its ended activities cleared, as Clear does. */
export function studioActivityLogWithTheEndedCleared(log: StudioActivityLog): StudioActivityLog {
  return { in_progress: log.in_progress, ended: [] };
}

/** What the status bar's Activity button says: what is under way, or how many have ended; `null` when the log is empty and the button is not shown. */
export function studioActivityButtonWordsOf(log: StudioActivityLog): string | null {
  const [onlyInProgress, ...otherInProgress] = log.in_progress;
  if (onlyInProgress !== undefined) {
    if (otherInProgress.length > 0) return `${log.in_progress.length} downloads and installs…`;
    return onlyInProgress.kind === "in_progress" ? `${onlyInProgress.title} · ${onlyInProgress.detail}` : onlyInProgress.title;
  }
  if (log.ended.length === 0) return null;
  const failedCount = log.ended.filter((activity) => activity.kind === "failed").length;
  return failedCount === 0 ? "Activity" : `Activity · ${failedCount} failed`;
}
