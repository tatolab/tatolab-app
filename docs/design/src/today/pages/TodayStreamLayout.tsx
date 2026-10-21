// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, Code2, Ellipsis, Play, RotateCw, Square, Terminal, Trash2 } from "lucide-react"
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom"
import { StatusLabel } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { runtimeStateWords, type TodayStream, todayStreamById, todayStreams } from "../data"

const tabs = [
  { to: "", label: "Overview" },
  { to: "graph", label: "Graph" },
  { to: "logs", label: "Logs" },
  { to: "outputs", label: "Outputs" },
  { to: "inspect", label: "Inspect" },
]

/** The stream every Today stream tab renders for. */
export function useTodayStream(): TodayStream {
  const { streamId } = useParams()
  return todayStreamById(streamId ?? "") ?? todayStreams[0]
}

const button = "h-7 gap-1.5 px-2.5 text-[13px]"

export default function TodayStreamLayout() {
  const stream = useTodayStream()
  const location = useLocation()
  const onGraph = location.pathname.endsWith("/graph")
  const words = runtimeStateWords[stream.state]
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b px-5 pt-3">
        <div className="flex items-center gap-1 text-xs text-fg-3">
          <Link to="/" className="hover:text-fg">
            Streams
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-fg-2">{stream.title}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-4">
          <h1 className="title-lg">{stream.title}</h1>
          <div className="flex items-center gap-4 text-[13px]">
            <StatusLabel status={stream.status} detail={stream.loaded ? `up ${stream.uptime}` : undefined} />
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default text-fg-2" />}>{words.label}</TooltipTrigger>
              <TooltipContent className="max-w-64">
                {words.long}
                <span className="mt-1 block font-mono text-[10px] opacity-60">runtime: {stream.state}</span>
              </TooltipContent>
            </Tooltip>
            <span className="font-mono text-xs text-fg-3">{stream.project}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" className={button}>
              <Code2 className="size-3.5" /> Open project
            </Button>
            <Button variant="outline" size="sm" className={button}>
              <Terminal className="size-3.5" /> Terminal
            </Button>
            {stream.loaded ? (
              <Button variant="outline" size="sm" className={button} disabled={stream.state === "attached"}>
                <Square className="size-3.5" /> Stop
              </Button>
            ) : (
              <Button size="sm" className={button}>
                <Play className="size-3.5" /> {stream.state === "failed" ? "Retry" : "Start"}
              </Button>
            )}
            {stream.loaded && (
              <Button variant="outline" size="sm" className={button}>
                <RotateCw className="size-3.5" /> Reload
              </Button>
            )}
            <Button variant="ghost" size="sm" className={cn(button, "text-fg-2")}>
              <Trash2 className="size-3.5" /> Remove
            </Button>
            <Button variant="ghost" size="icon-sm" className="size-7" aria-label="More">
              <Ellipsis className="size-4" />
            </Button>
          </div>
        </div>
        <nav className="mt-2 -mb-px flex gap-4">
          {tabs.map((t) => (
            <NavLink
              key={t.label}
              to={t.to ? `/streams/${stream.id}/${t.to}` : `/streams/${stream.id}`}
              end
              className={({ isActive }) =>
                cn("flex h-9 items-center border-b border-transparent text-fg-3 transition-colors hover:text-fg", isActive && "border-fg text-fg")
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className={cn("relative min-h-0 flex-1", onGraph ? "overflow-hidden" : "scrollbar-thin overflow-y-auto")}>
        <Outlet />
      </div>
    </div>
  )
}
