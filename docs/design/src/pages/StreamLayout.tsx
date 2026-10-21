// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, Code2, Ellipsis, Play, RotateCw, Square, Terminal } from "lucide-react"
import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom"
import { RunModeLabel, StatusLabel } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { machineById, type StreamSpec, streamById, streams } from "@/data/mock"
import { cn } from "@/lib/utils"
import { machineKindIcon } from "@/lib/vocab"

const tabs = [
  { to: "", label: "Overview" },
  { to: "graph", label: "Graph" },
  { to: "logs", label: "Logs" },
  { to: "stats", label: "Stats" },
  { to: "inspect", label: "Inspect" },
  { to: "sharing", label: "Sharing" },
]

/** The stream every stream tab renders for. */
export function useStream(): StreamSpec {
  const { streamId } = useParams()
  return streamById(streamId ?? "") ?? streams[0]
}

export default function StreamLayout() {
  const stream = useStream()
  const machine = machineById(stream.machine)!
  const MIcon = machineKindIcon[machine.kind]
  const location = useLocation()
  const onGraph = location.pathname.endsWith("/graph")
  const running = stream.status === "live" || stream.status === "attention"
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
            <StatusLabel status={stream.status} detail={stream.status === "live" ? `up ${stream.uptime}` : stream.statusDetail} />
            <span className="inline-flex items-center gap-1.5 text-fg-2">
              <MIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
              <span className="font-mono text-xs">{machine.name}</span>
            </span>
            <RunModeLabel mode={stream.runMode} />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <Code2 className="size-3.5" /> Open project
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <Terminal className="size-3.5" /> Terminal
            </Button>
            {running ? (
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
                <Square className="size-3.5" /> Stop
              </Button>
            ) : (
              <Button size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
                <Play className="size-3.5" /> Start
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <RotateCw className="size-3.5" /> Restart
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
