import { cn } from "cn";
import { Boxes, ChevronLeft, Plus, Settings, SquareX, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet, useMatch, useNavigate, useParams, type RouteObject } from "react-router";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { windowDragRegionAttribute } from "../presentation/platform_presentation";
import { presentRuntimeStatus } from "../presentation/runtime_presentation";
import { SETTINGS_SECTION_GROUPS, settingsSectionPath } from "../presentation/settings_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { IconButton } from "../design_system/icon_button";
import { PageHeader } from "../design_system/page_header";
import { addStreamPagePath } from "./add_stream_page_path";
import { AddStreamPageView } from "./add_stream_page_view";
import { AddStreamRunNoticeView } from "./add_stream_run_notice_view";
import { FirstRunFinishingRefusalNoticeView } from "./first_run_finishing_refusal_notice_view";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { StreamPageView } from "./stream_page_view";
import { streamPagePath, streamPageTabNamed } from "./stream_page_path";
import { StreamsListPageView } from "./streams_list_page_view";
import { SETTINGS_SECTION_ICONS, SettingsPageView } from "./settings_page_view";
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
  dataSettingsSection,
  isQuiet,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  windowNavigationName?: string;
  dataSettingsSection?: string;
  isQuiet?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-window-navigation={windowNavigationName}
      data-settings-section={dataSettingsSection}
      title={label}
      className={({ isActive }) =>
        cn(
          "group flex h-7 items-center gap-2 rounded-md px-2 text-fg transition-colors hover:bg-hover",
          isActive && "bg-selected font-medium",
        )
      }
    >
      {icon}
      {/* fg-3 drops under 4.5:1 on a hovered or selected row over chrome, so a quiet name reads fg-2 there. */}
      <span className={cn("min-w-0 flex-1 truncate", isQuiet && "text-fg-3 group-hover:text-fg-2 group-aria-[current=page]:text-fg-2")}>
        {label}
      </span>
      {trailing}
    </NavLink>
  );
}

function SidebarSectionHeading({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between px-2">
      <h2 className="label-caps">{children}</h2>
      {trailing}
    </div>
  );
}

const SIDEBAR_ICON_CLASS_NAMES = "size-4 shrink-0 text-fg-3";

function StreamsSidebarNavigation() {
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const navigate = useNavigate();
  return (
    <>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pt-1">
        <SidebarNavigationRow
          to="/"
          end
          windowNavigationName="streams"
          icon={<Boxes className={SIDEBAR_ICON_CLASS_NAMES} strokeWidth={1.75} aria-hidden />}
          label="All streams"
          trailing={listedStreams !== null && <span className="text-fg-3 tabular">{listedStreams.length}</span>}
        />
        <section>
          <SidebarSectionHeading
            trailing={<IconButton icon={Plus} label="Add stream" size="compact" onPressed={() => navigate(addStreamPagePath("project_folder"))} data-window-navigation="add-stream" />}
          >
            Streams
          </SidebarSectionHeading>
          {listedStreams === null ? (
            <p className="px-2 text-xs text-fg-3">Streams show here while the runtime runs.</p>
          ) : (
            listedStreams.map((stream) => (
              <SidebarNavigationRow
                key={stream.name}
                to={streamPagePath(stream.name)}
                icon={<Workflow className={SIDEBAR_ICON_CLASS_NAMES} strokeWidth={1.75} aria-hidden />}
                label={stream.name}
                isQuiet={!isStreamLoaded(stream)}
                trailing={
                  stream.state === "failed" && (
                    <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} role="img" aria-label="Failed" />
                  )
                }
              />
            ))
          )}
        </section>
      </div>
      <div className="px-2 py-2">
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

function SettingsSidebarNavigation() {
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pt-1">
      <SidebarNavigationRow
        to="/"
        end
        windowNavigationName="back-to-streams"
        icon={<ChevronLeft className={SIDEBAR_ICON_CLASS_NAMES} strokeWidth={1.75} aria-hidden />}
        label="Back to streams"
      />
      {SETTINGS_SECTION_GROUPS.map(({ groupLabel, sections }) => (
        <section key={groupLabel}>
          <SidebarSectionHeading>{groupLabel}</SidebarSectionHeading>
          {sections.map(({ section, label }) => {
            const SectionIcon = SETTINGS_SECTION_ICONS[section];
            return (
              <SidebarNavigationRow
                key={section}
                to={settingsSectionPath(section)}
                icon={<SectionIcon className={SIDEBAR_ICON_CLASS_NAMES} strokeWidth={1.75} aria-hidden />}
                label={label}
                dataSettingsSection={section}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** The sidebar down the window's left edge: the streams to go to, or Settings' sections while Settings is open. */
function WindowSidebar() {
  const { platform } = useTatolabWindowEnvironment();
  const isSettingsOpen = useMatch("/settings/*") !== null;
  return (
    <nav aria-label={isSettingsOpen ? "Settings" : "Tatolab"} className="flex w-(--sidebar-width) shrink-0 flex-col border-r bg-chrome">
      <div className="h-(--traffic-light-strip-height) shrink-0" data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined} />
      {isSettingsOpen ? <SettingsSidebarNavigation /> : <StreamsSidebarNavigation />}
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
    <>
      <PageHeader title="Streams" windowDragRegion={windowDragRegionAttribute(platform, "deep")} />
      <HostedDomPageView hostedPage={hostedPages.streamsPage} className="scrollbar-thin overflow-y-auto" />
    </>
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
      { path: "add-stream", element: <AddStreamPageView source="project_folder" /> },
      { path: "add-stream/new-project", element: <AddStreamPageView source="new_project" /> },
    ],
  },
];
