import { cn } from "cn";
import { Folder, FolderInput, FolderOpen, FolderPlus, List, Plus, Settings } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useNavigate, useParams, type RouteObject } from "react-router";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { windowDragRegionAttribute } from "../presentation/platform_presentation";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import { presentStreamState } from "../presentation/stream_presentation";
import { streamProjectFoldersOf, type StreamProjectFolder } from "../presentation/streams_list_presentation";
import { IconButton } from "../design_system/icon_button";
import { ListRowButton } from "../design_system/list_row_button";
import { IconButtonMenu, MenuItem } from "../design_system/menus";
import { PageFrame } from "../design_system/page_frame";
import { PageHeader } from "../design_system/page_header";
import { StreamStateIcon } from "../design_system/stream_state_words";
import { AddStreamDialogView } from "./add_stream_dialog_view";
import { AddStreamRunNoticeView } from "./add_stream_run_notice_view";
import { FirstRunFinishingRefusalNoticeView } from "./first_run_finishing_refusal_notice_view";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { StreamPageView } from "./stream_page_view";
import { streamPagePath, streamPageTabNamed } from "./stream_page_path";
import { StreamsListPageView } from "./streams_list_page_view";
import { SettingsPageView } from "./settings_page_view";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The streams `list_streams` gave while the runtime runs; `null` while it is down or the listing failed. */
function useListedStreamsWhileTheRuntimeRuns(): ListedStream[] | null {
  const status = useTatolabStatus();
  return presentRuntimeStatus(status).displayState === "running" ? status.streams : null;
}

function SidebarNavigationRow({
  to,
  end,
  icon,
  label,
  trailing,
  windowNavigationName,
  stateWordsForAScreenReader,
  isUnderAFolder,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  windowNavigationName?: string;
  /** Said after the label, where only the icon's colour shows the state. */
  stateWordsForAScreenReader?: string;
  /** Indented under its project folder's row. */
  isUnderAFolder?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-window-navigation={windowNavigationName}
      aria-label={stateWordsForAScreenReader === undefined ? undefined : `${label}, ${stateWordsForAScreenReader}`}
      title={label}
      className={({ isActive }) =>
        cn(
          "group flex h-8 items-center gap-2 rounded-md px-2 text-fg transition-colors hover:bg-hover",
          isUnderAFolder && "pl-8",
          isActive && "bg-selected font-medium",
        )
      }
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </NavLink>
  );
}

function SidebarSectionHeading({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between pr-1 pl-2">
      <h2 className="label-caps">{children}</h2>
      {trailing}
    </div>
  );
}

const SIDEBAR_ICON_CLASS_NAMES = "size-4 shrink-0 text-fg-3";

/** A project folder's row, opening and closing the list of the streams added from it; a closed folder holding a failed stream says so. */
function StreamProjectFolderSidebarRows({ projectFolder }: { projectFolder: StreamProjectFolder }) {
  const [isOpen, setIsOpen] = useState(true);
  const holdsAFailedStream = projectFolder.streams.some((stream) => stream.state === "failed");
  return (
    <li>
      <ListRowButton
        icon={isOpen ? FolderOpen : Folder}
        iconTone={!isOpen && holdsAFailedStream ? "danger" : "quiet"}
        aria-expanded={isOpen}
        onPressed={() => setIsOpen((wasOpen) => !wasOpen)}
        className="h-8 text-fg"
        data-sidebar-project-folder={projectFolder.projectDirectory}
      >
        <span className="min-w-0 flex-1 truncate">{projectFolder.folderName}</span>
        {!isOpen && holdsAFailedStream && <span className="sr-only">, holds a failed stream</span>}
      </ListRowButton>
      {isOpen && (
        <ul aria-label={`Streams added from ${projectFolder.folderName}`} className="mt-0.5 flex flex-col gap-0.5">
          {projectFolder.streams.map((stream) => (
            <li key={stream.name}>
              <SidebarNavigationRow
                to={streamPagePath(stream.name)}
                icon={<StreamStateIcon stream={stream} />}
                label={stream.name}
                stateWordsForAScreenReader={presentStreamState(stream).label}
                isUnderAFolder
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function StreamsSidebarNavigation() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const navigate = useNavigate();
  return (
    <>
      <section className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
        <SidebarSectionHeading
          trailing={
            <div className="flex items-center">
              <IconButton
                icon={List}
                label="View all streams"
                size="compact"
                onPressed={() => navigate("/")}
                data-window-navigation="streams"
              />
              <IconButtonMenu icon={Plus} label="New or import a project" size="compact" menuAlignment="start" data-window-navigation="add-project-menu">
                <MenuItem icon={FolderPlus} onChosen={() => addStreamFlow.openDialog("new_project", false)} data-window-navigation="new-project">
                  New project
                </MenuItem>
                <MenuItem icon={FolderInput} onChosen={() => addStreamFlow.openDialog("project_folder", false)} data-window-navigation="add-stream">
                  Import project
                </MenuItem>
              </IconButtonMenu>
            </div>
          }
        >
          Projects
        </SidebarSectionHeading>
        {listedStreams === null ? (
          <p className="px-2 text-xs text-fg-3">Projects show here while the runtime runs.</p>
        ) : (
          <ul aria-label="Project folders" className="flex flex-col gap-2">
            {streamProjectFoldersOf(listedStreams).map((projectFolder) => (
              <StreamProjectFolderSidebarRows key={projectFolder.projectDirectory} projectFolder={projectFolder} />
            ))}
          </ul>
        )}
      </section>
      <div className="border-t px-2 py-2">
        <SidebarNavigationRow
          to="/settings"
          windowNavigationName="settings"
          icon={<Settings className={SIDEBAR_ICON_CLASS_NAMES} strokeWidth={1.75} aria-hidden />}
          label="Settings"
        />
      </div>
    </>
  );
}

/** The sidebar down the window's left edge: all streams, each stream, and Settings. */
function WindowSidebar() {
  const { platform } = useTatolabWindowEnvironment();
  return (
    <nav aria-label="Tatolab" className="flex w-(--sidebar-width) shrink-0 flex-col border-r bg-chrome">
      <div className="h-(--traffic-light-strip-height) shrink-0" data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined} />
      <StreamsSidebarNavigation />
    </nav>
  );
}

/** The window around every view: the sidebar beside the view, each view bringing its own bar. */
function TatolabWindowShell() {
  return (
    <div className="flex h-full bg-window">
      <WindowSidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <Outlet />
        <AddStreamDialogView />
        <div className="pointer-events-none absolute right-4 bottom-4 z-40 flex flex-col-reverse gap-2">
          <AddStreamRunNoticeView />
          <FirstRunFinishingRefusalNoticeView />
        </div>
      </main>
    </div>
  );
}

/** The hosted page saying why the runtime lists no streams, under the Streams bar. */
function StreamsPageWhileTheRuntimeListsNone() {
  const { hostedPages, platform } = useTatolabWindowEnvironment();
  return (
    <PageFrame header={<PageHeader title="Streams" windowDragRegion={windowDragRegionAttribute(platform, "deep")} />}>
      <HostedDomPageView hostedPage={hostedPages.streamsPage} className="scrollbar-thin overflow-y-auto" />
    </PageFrame>
  );
}

/** The Streams list while the runtime lists its streams; otherwise the hosted page that says why it cannot. */
function StreamsRoute() {
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  if (listedStreams === null) return <StreamsPageWhileTheRuntimeListsNone />;
  return <StreamsListPageView listedStreams={listedStreams} />;
}

/** One stream's page on the tab its path names; the hosted page saying why while the runtime lists none; back to the list once it is not listed. */
function StreamRoute() {
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const { streamName, streamTab } = useParams();
  if (listedStreams === null) return <StreamsPageWhileTheRuntimeListsNone />;
  const stream = listedStreams.find((listedStream) => listedStream.name === streamName);
  if (stream === undefined) return <Navigate to="/" replace />;
  const shownTab = streamPageTabNamed(streamTab);
  if (shownTab === null) return <Navigate to={streamPagePath(stream.name)} replace />;
  return <StreamPageView key={stream.name} stream={stream} shownTab={shownTab} />;
}

/** The window's routes, in its memory router: the Streams list, a stream, Settings on one of its sections, and adding a stream from a project folder or a new project. */
export const TATOLAB_WINDOW_ROUTES: RouteObject[] = [
  {
    element: <TatolabWindowShell />,
    children: [
      { index: true, element: <StreamsRoute /> },
      { path: "streams/:streamName/:streamTab?", element: <StreamRoute /> },
      { path: "settings/:settingsSection?", element: <SettingsPageView /> },
    ],
  },
];
