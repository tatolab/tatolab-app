// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { Activity, Boxes, ChevronLeft, ChevronRight, Moon, Plus, Settings, SquareX, Sun, TriangleAlert, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet, useNavigate, useParams, type RouteObject } from "react-router";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { presentPlatform, presentWindowShortcut, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { presentRuntimeStatus, presentWindowStatusBar } from "../presentation/runtime_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { ActionButton } from "../design_system/action_button";
import { IconButton } from "../design_system/icon_button";
import { SearchOpeningButton } from "../design_system/search_opening_button";
import { addStreamPagePath } from "./add_stream_page_path";
import { AddStreamPageView } from "./add_stream_page_view";
import { AddStreamRunNoticeView } from "./add_stream_run_notice_view";
import { FirstRunFinishingRefusalNoticeView } from "./first_run_finishing_refusal_notice_view";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { StreamPageView } from "./stream_page_view";
import { streamPagePath, streamPageTabNamed } from "./stream_page_path";
import { StreamsListPageView } from "./streams_list_page_view";
import { SettingsPageView } from "./settings_page_view";
import { useTatolabStatus, useTatolabWindowEnvironment, useWindowAppearance } from "./tatolab_window_context";

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
  isQuiet,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  windowNavigationName?: string;
  isQuiet?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-window-navigation={windowNavigationName}
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

function WindowSidebar() {
  const { platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const navigate = useNavigate();
  const sidebarIconClassName = "size-4 shrink-0 text-fg-3";
  return (
    <nav aria-label="Tatolab" className="flex w-(--sidebar-width) shrink-0 flex-col bg-chrome">
      <div className="h-(--traffic-light-strip-height) shrink-0" data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined} />
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised ring-1 ring-line" aria-hidden>
          <svg viewBox="0 0 22 22" className="size-[18px] text-fg">
            <rect x="1" y="1" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 8h8M11 8v7" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="grid min-w-0 leading-tight">
          <span className="truncate font-semibold">Tatolab</span>
          <span className={cn("truncate text-xs text-fg-3", status.machine_name !== null && "font-mono")}>
            {status.machine_name ?? presentPlatform(platform).thisMachineAtSentenceStart}
          </span>
        </span>
      </div>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2">
        <section>
          <h2 className="label-caps px-2 pb-1">Workspace</h2>
          <SidebarNavigationRow
            to="/"
            end
            windowNavigationName="streams"
            icon={<Boxes className={sidebarIconClassName} strokeWidth={1.75} aria-hidden />}
            label="Streams"
            trailing={listedStreams !== null && <span className="text-fg-2 tabular">{listedStreams.length}</span>}
          />
        </section>
        <section>
          <div className="flex items-center justify-between px-2 pb-1">
            <h2 className="label-caps">Streams</h2>
            <IconButton icon={Plus} label="Add stream" size="compact" onPressed={() => navigate(addStreamPagePath("project_folder"))} data-window-navigation="add-stream" />
          </div>
          {listedStreams === null ? (
            <p className="px-2 text-xs text-fg-3">Streams show here while the runtime runs.</p>
          ) : (
            listedStreams.map((stream) => (
              <SidebarNavigationRow
                key={stream.name}
                to={streamPagePath(stream.name)}
                icon={<Workflow className={sidebarIconClassName} strokeWidth={1.75} aria-hidden />}
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
      <div className="px-2 py-3">
        <SidebarNavigationRow
          to="/settings"
          windowNavigationName="settings"
          icon={<Settings className={sidebarIconClassName} strokeWidth={1.75} aria-hidden />}
          label="Settings"
        />
      </div>
    </nav>
  );
}

function WindowTitleBar() {
  const { platform, openSearch } = useTatolabWindowEnvironment();
  const navigate = useNavigate();
  const { shownTheme, chooseAppearance } = useWindowAppearance();
  const isDark = shownTheme === "dark";
  return (
    <header
      className="flex h-(--title-bar-height) shrink-0 items-center gap-1 border-b px-2"
      data-window-drag-region={windowDragRegionAttribute(platform, "deep") ?? undefined}
    >
      <IconButton icon={ChevronLeft} label="Back" onPressed={() => navigate(-1)} />
      <IconButton icon={ChevronRight} label="Forward" onPressed={() => navigate(1)} />
      <SearchOpeningButton
        label="Search streams, outputs and views"
        shortcut={presentWindowShortcut(platform, "K")}
        onPressed={openSearch}
        data-window-search=""
      />
      <IconButton
        icon={isDark ? Sun : Moon}
        label={isDark ? "Use the light theme" : "Use the dark theme"}
        onPressed={() => chooseAppearance(isDark ? "light" : "dark")}
        data-window-theme-toggle=""
      />
      <ActionButton appearance="primary" icon={Plus} onPressed={() => navigate(addStreamPagePath("project_folder"))} className="ml-1">
        Add stream
      </ActionButton>
    </header>
  );
}

function WindowStatusBar() {
  const status = useTatolabStatus();
  const statusBar = presentWindowStatusBar(status);
  const RuntimeIcon = statusBar.tone === "error" ? SquareX : statusBar.tone === "warning" ? TriangleAlert : Activity;
  return (
    <footer className="flex h-(--status-bar-height) shrink-0 items-center gap-4 border-t px-3 text-xs text-fg-3">
      <span
        className={cn(
          "flex items-center gap-1.5",
          statusBar.tone === "error" && "text-danger-text",
          statusBar.tone === "warning" && "text-warn-text",
        )}
      >
        <RuntimeIcon className="size-3" strokeWidth={2} aria-hidden />
        {statusBar.runtimeWords}
      </span>
      <span className="ml-auto font-mono">{statusBar.appVersionWords}</span>
    </footer>
  );
}

/** The window around every page: the sidebar, the title bar, the page, and the status bar. */
function TatolabWindowShell() {
  return (
    <div className="flex h-full bg-chrome">
      <WindowSidebar />
      <div className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-window ring-1 ring-line">
        <WindowTitleBar />
        <main className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
        <WindowStatusBar />
        <div className="pointer-events-none absolute right-4 bottom-10 z-40 flex flex-col-reverse gap-2">
          <AddStreamRunNoticeView />
          <FirstRunFinishingRefusalNoticeView />
        </div>
      </div>
    </div>
  );
}

/** The Streams list while the runtime lists its streams; otherwise the hosted page that says why it cannot. */
function StreamsRoute() {
  const { hostedPages } = useTatolabWindowEnvironment();
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  if (listedStreams === null) return <HostedDomPageView hostedPage={hostedPages.streamsPage} />;
  return <StreamsListPageView listedStreams={listedStreams} />;
}

/** One stream's page on the tab its path names; the hosted page saying why while the runtime lists none; back to the list once it is not listed. */
function StreamRoute() {
  const { hostedPages } = useTatolabWindowEnvironment();
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const { streamName, streamTab } = useParams();
  if (listedStreams === null) return <HostedDomPageView hostedPage={hostedPages.streamsPage} />;
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
