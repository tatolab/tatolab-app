// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, FolderOpen, type LucideIcon, Plus, Search, Sparkles } from "lucide-react"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Mascot } from "@/components/brand/brand"
import { CommandBlock } from "@/components/setup/CommandBlock"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { thisMachine, type TodayStream, todayStreams } from "../data"
import { StreamRowActions } from "../components/streams/StreamRowActions"
import { TodayRunModeWord, TodayStreamStatusWord, TodayStreamThumbnail } from "../components/streams/StreamStateWords"

const filters = [
  { id: "all", label: "All", test: (_: TodayStream) => true },
  { id: "running", label: "Running", test: (s: TodayStream) => s.loaded },
  { id: "stopped", label: "Stopped", test: (s: TodayStream) => s.state === "stopped" },
  { id: "failed", label: "Failed", test: (s: TodayStream) => s.state === "failed" },
] as const

function StreamRow({ stream, index }: { stream: TodayStream; index: number }) {
  const navigate = useNavigate()
  return (
    <tr onClick={() => navigate(`/streams/${stream.id}`)} className="group cursor-default border-b transition-colors last:border-b-0 hover:bg-hover">
      <td className="py-2 pr-3 pl-5">
        <div className="flex items-center gap-3">
          <TodayStreamThumbnail stream={stream} seed={index * 5} className="h-9 w-16 shrink-0" />
          <div className="min-w-0">
            <div className={stream.loaded ? "truncate font-medium text-fg" : "truncate font-medium text-fg-2"}>{stream.title}</div>
            <div className="truncate font-mono text-xs text-fg-3">{stream.project}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <TodayStreamStatusWord stream={stream} />
        {stream.failedBecause && (
          <div className="line-clamp-2 max-w-[440px] pl-5 text-xs text-fg-3">
            {stream.failedBecause}
          </div>
        )}
      </td>
      <td className="px-3">
        <TodayRunModeWord stream={stream} />
      </td>
      <td className="px-3 text-right text-fg-2 tabular">{stream.loaded ? stream.nodes.length : <span className="text-fg-3">—</span>}</td>
      <td className="py-2 pr-4 pl-3">
        <div className="opacity-60 transition-opacity group-hover:opacity-100">
          <StreamRowActions stream={stream} />
        </div>
      </td>
    </tr>
  )
}

function FirstStreamChoice({ icon: Icon, title, body, onClick }: { icon: LucideIcon; title: string; body: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-16 w-full items-center gap-3.5 border-b px-4 text-left transition-colors last:border-b-0 hover:bg-hover">
      <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-raised">
        <Icon className="size-4 text-fg-2" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-fg">{title}</span>
        <span className="block truncate text-xs text-fg-3">{body}</span>
      </span>
      <ChevronRight className="size-4 text-fg-4" strokeWidth={1.75} />
    </button>
  )
}

function NoStreamsYet() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-1 items-start justify-center border-t px-5 pt-[9vh] pb-16">
      <div className="flex w-[480px] flex-col items-center text-center">
        <Mascot className="size-[120px]" />
        <h2 className="mt-4 text-[15px] leading-5 font-semibold">No streams on {thisMachine.name} yet</h2>
        <p className="mt-1 max-w-md text-fg-3">A stream is a Python project with a stream.py. The runtime compiles it, loads its graph and keeps it running.</p>
        <div className="mt-6 w-full overflow-hidden rounded-lg border text-left">
          <FirstStreamChoice
            icon={Sparkles}
            title="Create the sample stream"
            body="A test pattern you can edit, in ~/streams/hello. Runs Always on."
            onClick={() => navigate("/new?source=new")}
          />
          <FirstStreamChoice icon={FolderOpen} title="Run a project folder" body="Any folder with a stream.py and a .venv." onClick={() => navigate("/new")} />
        </div>
        <div className="mt-6 w-full text-left">
          <div className="mb-1.5 text-xs text-fg-3">Or in a terminal, from a project folder, to reload on every save:</div>
          <CommandBlock command="tatolab dev" />
        </div>
      </div>
    </div>
  )
}

export default function TodayStreams() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const empty = params.get("empty") === "1"
  const streams = empty ? [] : todayStreams
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all")
  const [query, setQuery] = useState("")
  const visible = streams
    .filter(filters.find((f) => f.id === filter)!.test)
    .filter((s) => !query || `${s.title} ${s.id} ${s.project}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div>
          <h1 className="title-lg">Streams</h1>
          <p className="text-fg-3">
            {empty ? `Nothing loaded on ${thisMachine.name}` : `${streams.filter((s) => s.loaded).length} of ${streams.length} loaded on ${thisMachine.name}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!empty && (
            <>
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
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-[13px]" onClick={() => navigate("/new")}>
                <Plus className="size-3.5" /> Add stream
              </Button>
            </>
          )}
        </div>
      </div>

      {empty ? (
        <NoStreamsYet />
      ) : (
        <div className="border-t">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-fg-3">
                <th className="h-8 w-[36%] pr-3 pl-5 font-normal">Name</th>
                <th className="px-3 font-normal">Status</th>
                <th className="w-[150px] px-3 font-normal">Run mode</th>
                <th className="w-[72px] px-3 text-right font-normal">Steps</th>
                <th className="w-[148px] pr-4 pl-3 font-normal">
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
          {visible.length === 0 && <div className="border-t px-5 py-10 text-center text-fg-3">No streams match.</div>}
        </div>
      )}
    </div>
  )
}
