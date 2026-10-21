// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Ellipsis, LayoutGrid, List, Play, RotateCw, Search, Square, Workflow } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { LivePreview } from "@/components/live/LivePreview"
import { formatMemory, IconButton, Meter, Preview, RunModeLabel, StatusLabel } from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import { machineById, type StreamSpec, streams } from "@/data/mock"
import { machineKindIcon } from "@/lib/vocab"

const filters = [
  { id: "all", label: "All", test: (_: StreamSpec) => true },
  { id: "running", label: "Running", test: (s: StreamSpec) => s.status === "live" || s.status === "attention" },
  { id: "stopped", label: "Stopped", test: (s: StreamSpec) => s.status === "paused" },
  { id: "problems", label: "Problems", test: (s: StreamSpec) => s.status === "attention" || s.status === "failed" },
] as const

function running(s: StreamSpec) {
  return s.status === "live" || s.status === "attention"
}

function StreamRow({ stream, index }: { stream: StreamSpec; index: number }) {
  const navigate = useNavigate()
  const machine = machineById(stream.machine)!
  const MIcon = machineKindIcon[machine.kind]
  return (
    <tr onClick={() => navigate(`/streams/${stream.id}`)} className="group cursor-default border-b transition-colors last:border-b-0 hover:bg-hover">
      <td className="py-2 pr-3 pl-5">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-[5px] bg-black ring-1 ring-line">
            <LivePreview scene={stream.hero} paused={!running(stream)} seed={index * 5} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{stream.title}</div>
            <div className="truncate font-mono text-xs text-fg-3">{stream.project}</div>
          </div>
        </div>
      </td>
      <td className="px-3">
        <StatusLabel status={stream.status} detail={stream.status === "live" ? stream.uptime : undefined} />
        {(stream.status === "attention" || stream.status === "failed") && (
          <div className="truncate pl-5 text-xs text-fg-3">{stream.statusDetail}</div>
        )}
      </td>
      <td className="px-3">
        <span className="inline-flex items-center gap-1.5 text-fg-2">
          <MIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
          <span className="font-mono text-xs">{machine.name}</span>
        </span>
      </td>
      <td className="px-3">
        <RunModeLabel mode={stream.runMode} />
      </td>
      <td className="px-3 text-right text-fg-2 tabular">{stream.nodes.length}</td>
      <td className="px-3">
        <div className="flex items-center justify-end gap-2 text-fg-2 tabular">
          {running(stream) ? `${stream.cpu}%` : "—"}
          <Meter value={running(stream) ? stream.cpu : 0} />
        </div>
      </td>
      <td className="px-3">
        <div className="flex items-center justify-end gap-2 text-fg-2 tabular">
          {running(stream) && stream.gpu ? `${stream.gpu}%` : "—"}
          <Meter value={running(stream) ? stream.gpu : 0} />
        </div>
      </td>
      <td className="px-3 text-right text-fg-2 tabular">{running(stream) ? formatMemory(stream.memoryMb) : "—"}</td>
      <td className="py-2 pr-4 pl-3">
        <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {running(stream) ? <IconButton icon={Square} label="Stop" filled /> : <IconButton icon={Play} label="Start" filled />}
          <IconButton icon={RotateCw} label="Restart" />
          <IconButton icon={Workflow} label="Open graph" onClick={() => navigate(`/streams/${stream.id}/graph`)} />
          <IconButton icon={Ellipsis} label="More" />
        </div>
      </td>
    </tr>
  )
}

function StreamTile({ stream, index }: { stream: StreamSpec; index: number }) {
  const machine = machineById(stream.machine)!
  return (
    <Link to={`/streams/${stream.id}`} className="group block">
      <Preview scene={stream.hero} paused={!running(stream)} seed={index * 5} className="aspect-video transition-[box-shadow] group-hover:ring-line-strong" />
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{stream.title}</div>
          <div className="truncate font-mono text-xs text-fg-3">{machine.name}</div>
        </div>
        <StatusLabel status={stream.status} className="shrink-0 text-xs" />
      </div>
    </Link>
  )
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const view = params.get("view") === "grid" ? "grid" : "list"
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all")
  const [query, setQuery] = useState("")
  const visible = streams
    .filter(filters.find((f) => f.id === filter)!.test)
    .filter((s) => !query || `${s.title} ${s.id} ${s.machine}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div>
          <h1 className="title-lg">Streams</h1>
          <p className="text-fg-3">
            {streams.filter(running).length} running across {new Set(streams.map((s) => s.machine)).size} machines
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={filters.map((f) => ({ id: f.id, label: f.label, count: streams.filter(f.test).length }))}
          />
          <label className="flex h-7 w-52 items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
            <Search className="size-3.5 text-fg-3" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
            />
          </label>
          <div className="flex items-center rounded-md border p-0.5">
            <IconButton icon={List} label="List" active={view === "list"} onClick={() => setParams({})} className="size-6" />
            <IconButton icon={LayoutGrid} label="Grid" active={view === "grid"} onClick={() => setParams({ view: "grid" })} className="size-6" />
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="border-t">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-fg-3">
                <th className="h-8 pr-3 pl-5 font-normal">Name</th>
                <th className="px-3 font-normal">Status</th>
                <th className="px-3 font-normal">Machine</th>
                <th className="px-3 font-normal">Run mode</th>
                <th className="px-3 text-right font-normal">Steps</th>
                <th className="px-3 text-right font-normal">CPU</th>
                <th className="px-3 text-right font-normal">GPU</th>
                <th className="px-3 text-right font-normal">Memory</th>
                <th className="pr-4 pl-3 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <StreamRow key={s.id} stream={s} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-x-5 gap-y-6 border-t px-5 pt-5 pb-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((s, i) => (
            <StreamTile key={s.id} stream={s} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
