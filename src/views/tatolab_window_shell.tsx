// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Activity, Boxes, ChevronLeft, ChevronRight, Moon, Plus, Search, Settings, SquareX, Sun, TriangleAlert, Workflow } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useNavigate, useParams, type RouteObject } from "react-router";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { presentPlatform, shortcutHint, windowDragRegionAttribute } from "../presentation/platform_presentation";
import { presentRuntimeStatus, presentWindowStatusBar } from "../presentation/runtime_presentation";
import { HostedDomPageView } from "./hosted_dom_page_view";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { Kbd } from "./shadcn/kbd";
import { streamPagePath, StreamsListPageView } from "./streams_list_page_view";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** Where the person's light or dark choice is kept; the page's first script reads it before first paint. */
const CHOSEN_WINDOW_THEME_STORAGE_KEY = "tatolab-window-theme";

/** The streams `list_streams` gave while the runtime runs; `null` while it is down or the listing failed. */
function useListedStreamsWhileTheRuntimeRuns(): ListedStream[] | null {
  const status = useTatolabStatus();
  return presentRuntimeStatus(status).displayState === "running" ? status.streams : null;
}

/** The light or dark toggle: flips the `dark` class on the page and keeps the choice. */
function useWindowThemeToggle(): { isDark: boolean; toggleTheme: () => void } {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleTheme = () => {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle("dark", nextIsDark);
    try {
      localStorage.setItem(CHOSEN_WINDOW_THEME_STORAGE_KEY, nextIsDark ? "dark" : "light");
    } catch {
      // A page that cannot keep the choice still shows it until the window reloads.
    }
    setIsDark(nextIsDark);
  };
  return { isDark, toggleTheme };
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
        joinClassNames(
          "group flex h-7 items-center gap-2 rounded-md px-2 text-fg transition-colors hover:bg-hover",
          isActive && "bg-selected font-medium",
        )
      }
    >
      {icon}
      {/* fg-3 drops under 4.5:1 on a hovered or selected row over chrome, so a quiet name reads fg-2 there. */}
      <span className={joinClassNames("min-w-0 flex-1 truncate", isQuiet && "text-fg-3 group-hover:text-fg-2 group-aria-[current=page]:text-fg-2")}>
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
          <span className={joinClassNames("truncate text-xs text-fg-3", status.machine_name !== null && "font-mono")}>
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
            <button
              type="button"
              title="Add stream"
              aria-label="Add stream"
              data-window-navigation="add-stream"
              onClick={() => navigate("/add-stream")}
              className="grid size-5 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
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
                isQuiet={stream.node_count === null}
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
  const { isDark, toggleTheme } = useWindowThemeToggle();
  const iconButtonClassName = "grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg";
  return (
    <header
      className="flex h-(--title-bar-height) shrink-0 items-center gap-1 border-b px-2"
      data-window-drag-region={windowDragRegionAttribute(platform, "deep") ?? undefined}
    >
      <button type="button" onClick={() => navigate(-1)} className={iconButtonClassName} aria-label="Back">
        <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
      </button>
      <button type="button" onClick={() => navigate(1)} className={iconButtonClassName} aria-label="Forward">
        <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        onClick={openSearch}
        data-window-search=""
        aria-label="Search streams, outputs and views"
        aria-keyshortcuts={platform === "macos" ? "Meta+K" : "Control+K"}
        className="mx-auto flex h-7 w-[min(420px,40%)] items-center gap-2 rounded-md border bg-well px-2.5 text-fg-3 transition-colors hover:border-line-strong"
      >
        <Search className="size-3.5" strokeWidth={1.75} aria-hidden />
        Search
        <Kbd className="ml-auto" aria-hidden>
          {shortcutHint(platform, "K")}
        </Kbd>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className={iconButtonClassName}
        aria-label={isDark ? "Use the light theme" : "Use the dark theme"}
        data-window-theme-toggle=""
      >
        {isDark ? <Sun className="size-4" strokeWidth={1.75} aria-hidden /> : <Moon className="size-4" strokeWidth={1.75} aria-hidden />}
      </button>
      <Button className="ml-1" onClick={() => navigate("/add-stream")}>
        <Plus aria-hidden /> Add stream
      </Button>
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
        className={joinClassNames(
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
      <div className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-window ring-1 ring-line">
        <WindowTitleBar />
        <main className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
        <WindowStatusBar />
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

/** One stream's band, graph, logs and Overview, as the hosted streams page draws them; back to the list once it is not listed. */
function StreamRoute() {
  const { hostedPages } = useTatolabWindowEnvironment();
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const { streamName } = useParams();
  const isListed = listedStreams?.some((stream) => stream.name === streamName) ?? false;
  useEffect(() => {
    if (streamName !== undefined && isListed) hostedPages.streamsPage.chooseStream(streamName);
  }, [hostedPages, streamName, isListed]);
  if (listedStreams !== null && !isListed) return <Navigate to="/" replace />;
  return <HostedDomPageView hostedPage={hostedPages.streamsPage} />;
}

function SettingsRoute() {
  const { hostedPages } = useTatolabWindowEnvironment();
  return <HostedDomPageView hostedPage={hostedPages.settingsPage} />;
}

/** The first-stream guide, which keeps its promise to show the stream as soon as the runtime loads it: a stream listed after the guide opened is shown. */
function AddStreamRoute() {
  const { hostedPages } = useTatolabWindowEnvironment();
  const listedStreams = useListedStreamsWhileTheRuntimeRuns();
  const navigate = useNavigate();
  const streamNamesWhenTheGuideOpened = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (listedStreams === null) return;
    if (streamNamesWhenTheGuideOpened.current === null) {
      streamNamesWhenTheGuideOpened.current = new Set(listedStreams.map((stream) => stream.name));
      return;
    }
    const knownStreamNames = streamNamesWhenTheGuideOpened.current;
    const newlyListedStream = listedStreams.find((stream) => !knownStreamNames.has(stream.name));
    if (newlyListedStream !== undefined) navigate(streamPagePath(newlyListedStream.name), { replace: true });
  }, [listedStreams, navigate]);
  return <HostedDomPageView hostedPage={hostedPages.firstStreamGuidePage} />;
}

/** The window's routes, in its memory router: the Streams list, a stream, Settings, and adding a stream. */
export const TATOLAB_WINDOW_ROUTES: RouteObject[] = [
  {
    element: <TatolabWindowShell />,
    children: [
      { index: true, element: <StreamsRoute /> },
      { path: "streams/:streamName", element: <StreamRoute /> },
      { path: "settings", element: <SettingsRoute /> },
      { path: "add-stream", element: <AddStreamRoute /> },
    ],
  },
];

/** Whether the router shows a stream's page. */
export function isShowingAStreamPage(pathname: string): boolean {
  return pathname.startsWith("/streams/");
}

