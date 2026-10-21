// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowDownToLine, Ban, Check, ChevronDown, Clock, Copy, PanelRight, Search, WrapText, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { useSearchParams } from "react-router-dom"
import { IconButton } from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { type StreamSpec, streamById } from "@/data/mock"
import { cn } from "@/lib/utils"
import { type LogLevel, type LogLine, nextLine, toJsonl } from "./logData"
import { LogLineDetails, useCopied } from "./LogLineDetails"
import { LogRow } from "./LogRow"

type LevelFilter = "all" | "info" | "warn" | "error"

const levelOptions: { id: LevelFilter; label: string; test: (l: LogLevel) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "info", label: "Info", test: (l) => l === "info" || l === "debug" },
  { id: "warn", label: "Warnings", test: (l) => l === "warn" },
  { id: "error", label: "Errors", test: (l) => l === "error" },
]

const stepKey = (l: LogLine) => `${l.stream ?? ""}/${l.node ?? ""}`

function matches(l: LogLine, q: string) {
  if (!q) return true
  const hay = `${l.msg} ${l.node ?? "runtime"} ${l.stream ?? ""} ${Object.entries(l.fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")} ${l.traceback ?? ""}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

function dayLabel(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
}

function MultiFilter({
  label,
  menuTitle,
  allLabel,
  groups,
  selected,
  onChange,
}: {
  label: string
  menuTitle: string
  allLabel: string
  groups: { heading?: string; items: { key: string; name: string; hint?: string }[] }[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const total = groups.reduce((a, g) => a + g.items.length, 0)
  const only = selected.size === 1 ? groups.flatMap((g) => g.items).find((i) => selected.has(i.key)) : undefined
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2 text-fg-2 transition-colors hover:border-line-strong hover:text-fg",
              selected.size > 0 && "border-line-strong text-fg",
            )}
          />
        }
      >
        <span className="text-fg-3">{label}</span>
        <span className={cn("max-w-36 truncate", only && "font-mono text-xs")}>
          {selected.size === 0 ? allLabel : only ? only.name : `${selected.size} of ${total}`}
        </span>
        <ChevronDown className="size-3.5 text-fg-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 w-72 p-1">
        <div className="flex h-7 items-center px-1.5">
          <span className="label-caps">{menuTitle}</span>
          <button
            disabled={selected.size === 0}
            onClick={() => onChange(new Set())}
            className="ml-auto rounded px-1 text-xs text-fg-3 hover:text-fg disabled:opacity-40 disabled:hover:text-fg-3"
          >
            Show all
          </button>
        </div>
        {groups.map((g, gi) => (
          <DropdownMenuGroup key={g.heading ?? gi}>
            {g.heading && <DropdownMenuLabel className="px-1.5 pt-2 pb-0.5 text-[11px] font-normal text-fg-3">{g.heading}</DropdownMenuLabel>}
            {g.items.map((i) => (
              <DropdownMenuCheckboxItem
                key={i.key}
                checked={selected.has(i.key)}
                onCheckedChange={(on) => {
                  const next = new Set(selected)
                  if (on) next.add(i.key)
                  else next.delete(i.key)
                  onChange(next)
                }}
              >
                <span className="font-mono text-xs">{i.name}</span>
                {i.hint && <span className="ml-auto truncate pl-3 text-xs text-fg-3">{i.hint}</span>}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Docker's Logs tab crossed with VS Code's Output panel. */
export function LogViewer({
  lines: baseLines,
  scope,
  live = [],
  footer,
  leading,
  toolbarExtra,
  className,
}: {
  lines: LogLine[]
  scope: "stream" | "machine"
  live?: StreamSpec[]
  footer?: React.ReactNode
  leading?: React.ReactNode
  toolbarExtra?: React.ReactNode
  className?: string
}) {
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get("q") ?? "")
  const [level, setLevel] = useState<LevelFilter>((params.get("level") as LevelFilter) || "all")
  const [steps, setSteps] = useState<Set<string>>(() => new Set(params.getAll("step")))
  const [streamFilter, setStreamFilter] = useState<Set<string>>(() => new Set(params.getAll("stream")))
  const [follow, setFollow] = useState(true)
  const [wrap, setWrap] = useState(params.get("wrap") === "1")
  const [showTime, setShowTime] = useState(params.get("time") !== "0")
  const [clearedAt, setClearedAt] = useState(0)
  const [extra, setExtra] = useState<LogLine[]>([])
  const [panelOpen, setPanelOpen] = useState(params.get("panel") !== "closed")
  const [copied, copy] = useCopied()
  const panelRef = usePanelRef()
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const all = useMemo(() => [...baseLines, ...extra], [baseLines, extra])
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const p = params.get("line")
    if (p) return baseLines.find((l) => l.id.endsWith(`:${p}`))?.id ?? null
    const rev = [...baseLines].reverse()
    return (rev.find((l) => l.traceback) ?? rev.find((l) => l.level === "error") ?? rev.find((l) => l.level === "warn"))?.id ?? null
  })

  const liveKey = live.map((s) => s.id).join(",")
  useEffect(() => {
    if (!live.length) return
    let seq = 0
    const timer = window.setInterval(() => {
      seq += 1
      const s = live[seq % live.length]
      setExtra((prev) => {
        const last = prev.length ? prev[prev.length - 1].ts : baseLines[baseLines.length - 1]?.ts ?? new Date().toISOString()
        return [...prev.slice(-400), nextLine(s, last, seq + prev.length)]
      })
    }, 1600)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, baseLines])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const scoped = useMemo(
    () =>
      all
        .slice(clearedAt)
        .filter((l) => (steps.size ? steps.has(stepKey(l)) : true))
        .filter((l) => (streamFilter.size ? streamFilter.has(l.stream ?? "") : true))
        .filter((l) => matches(l, query)),
    [all, clearedAt, steps, streamFilter, query],
  )
  const visible = useMemo(() => scoped.filter((l) => levelOptions.find((o) => o.id === level)!.test(l.level)), [scoped, level])
  const counts = useMemo(() => {
    const c: Record<LevelFilter, number> = { all: scoped.length, info: 0, warn: 0, error: 0 }
    for (const l of scoped) for (const o of levelOptions.slice(1)) if (o.test(l.level)) c[o.id]++
    return c
  }, [scoped])

  useLayoutEffect(() => {
    const el = listRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [visible.length, follow, wrap])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
    if (follow !== atBottom) setFollow(atBottom)
  }

  const togglePanel = useCallback(() => {
    const p = panelRef.current
    if (!p) return
    if (p.isCollapsed()) p.expand()
    else p.collapse()
  }, [panelRef])

  const stepGroups = useMemo(() => {
    const byStream = new Map<string, Set<string>>()
    for (const l of baseLines) {
      const k = l.stream ?? ""
      if (!byStream.has(k)) byStream.set(k, new Set())
      byStream.get(k)!.add(l.node ?? "")
    }
    return [...byStream.entries()].map(([sid, nodes]) => {
      const s = streamById(sid)
      const order = s ? s.nodes.map((n) => n.id) : []
      return {
        heading: scope === "machine" ? (s?.title ?? "Runtime") : undefined,
        items: [...nodes]
          .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : order.indexOf(a) - order.indexOf(b)))
          .map((n) => ({ key: `${sid}/${n}`, name: n || "runtime", hint: n ? s?.nodes.find((x) => x.id === n)?.label : "tatolabd" })),
      }
    })
  }, [baseLines, scope])

  const streamItems = useMemo(() => {
    const ids = [...new Set(baseLines.map((l) => l.stream ?? ""))]
    return ids.map((id) => ({ key: id, name: id || "tatolabd", hint: id ? streamById(id)?.title : "Runtime" }))
  }, [baseLines])

  const selected = all.find((l) => l.id === selectedId) ?? null
  const columns = [showTime && "92px", "44px", scope === "machine" && "112px", "120px", "minmax(0,1fr)"].filter(Boolean).join(" ")
  const spansDays = visible.length > 1 && visible[0].ts.slice(0, 10) !== visible[visible.length - 1].ts.slice(0, 10)

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <label className="flex h-7 w-60 items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
          <Search className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
          />
          {query ? (
            <button onClick={() => setQuery("")} className="text-fg-3 hover:text-fg" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="font-sans text-[11px] text-fg-4">⌘F</kbd>
          )}
        </label>
        <Segmented
          value={level}
          onChange={setLevel}
          options={levelOptions.map((o) => ({
            id: o.id,
            label: o.id === "warn" && counts.warn ? <span className="text-warn">{o.label}</span> : o.id === "error" && counts.error ? <span className="text-danger">{o.label}</span> : o.label,
            count: counts[o.id],
          }))}
        />
        {scope === "machine" && <MultiFilter label="Stream" menuTitle="Streams" allLabel="All streams" groups={[{ items: streamItems }]} selected={streamFilter} onChange={setStreamFilter} />}
        <MultiFilter label="Step" menuTitle="Steps" allLabel="All steps" groups={stepGroups} selected={steps} onChange={setSteps} />
        <div className="ml-auto flex items-center gap-0.5">
          {toolbarExtra}
          <span className="mr-2 text-xs whitespace-nowrap text-fg-3 tabular">
            {visible.length === all.length - clearedAt ? `${visible.length} lines` : `${visible.length} of ${all.length - clearedAt}`}
          </span>
          <IconButton icon={ArrowDownToLine} label={follow ? "Following new lines" : "Follow new lines"} active={follow} onClick={() => setFollow((f) => !f)} />
          <IconButton icon={WrapText} label={wrap ? "Don't wrap lines" : "Wrap lines"} active={wrap} onClick={() => setWrap((w) => !w)} />
          <IconButton icon={Clock} label={showTime ? "Hide timestamps" : "Show timestamps"} active={showTime} onClick={() => setShowTime((t) => !t)} />
          <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy visible lines as JSONL"} onClick={() => copy(toJsonl(visible))} />
          <IconButton icon={Ban} label="Clear" onClick={() => setClearedAt(all.length)} />
          <span className="mx-1 h-4 w-px bg-line" />
          <IconButton icon={PanelRight} label={panelOpen ? "Hide details" : "Show details"} active={panelOpen} onClick={togglePanel} />
        </div>
      </div>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel minSize={420} className="min-w-0">
          <div
            ref={listRef}
            onScroll={onScroll}
            role="grid"
            className="scrollbar-thin h-full overflow-auto py-1 font-mono text-[12px] leading-5"
          >
            {leading && clearedAt === 0 && !query && leading}
            {visible.map((l, i) => {
              const day = l.ts.slice(0, 10)
              const divider = i === 0 ? spansDays : day !== visible[i - 1].ts.slice(0, 10)
              return (
                <div key={l.id}>
                  {divider && (
                    <div className="flex items-center gap-3 px-3 pt-2 pb-1 font-sans">
                      <span className="label-caps">{dayLabel(l.ts)}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <LogRow
                    line={l}
                    columns={columns}
                    showTime={showTime}
                    showStream={scope === "machine"}
                    wrap={wrap}
                    query={query}
                    selected={l.id === selectedId}
                    onSelect={setSelectedId}
                  />
                </div>
              )
            })}
            {visible.length === 0 && (
              <div className="grid h-full place-items-center font-sans text-fg-3">
                {clearedAt > 0 && all.length === clearedAt ? "Cleared. New lines appear here." : "No lines match."}
              </div>
            )}
            {footer && visible.length > 0 && level === "all" && !query && footer}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          panelRef={panelRef}
          defaultSize={params.get("panel") === "closed" ? 0 : 340}
          minSize={280}
          maxSize={560}
          collapsible
          collapsedSize={0}
          onResize={(s) => setPanelOpen(s.inPixels > 0)}
          className="bg-chrome"
        >
          <LogLineDetails
            line={selected}
            onClose={togglePanel}
            onOnlyStep={(k) => {
              setSteps(new Set([k]))
              setLevel("all")
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
