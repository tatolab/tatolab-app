// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { memo } from "react"
import { cn } from "@/lib/utils"
import { type FieldValue, formatClock, type LogLevel, type LogLine } from "./logData"

const levelStyle: Record<LogLevel, { word: string; tone: string }> = {
  debug: { word: "DEBUG", tone: "text-fg-4" },
  info: { word: "INFO", tone: "text-fg-3" },
  warn: { word: "WARN", tone: "text-warn" },
  error: { word: "ERROR", tone: "text-danger" },
}

export function LevelWord({ level, className }: { level: LogLevel; className?: string }) {
  const s = levelStyle[level]
  return <span className={cn("font-mono", s.tone, className)}>{s.word}</span>
}

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  let at = lower.indexOf(q)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark key={at} className="rounded-[2px] bg-brand-soft text-fg ring-1 ring-brand/40">
        {text.slice(at, at + q.length)}
      </mark>,
    )
    from = at + q.length
    at = lower.indexOf(q, from)
  }
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

export function formatField(v: FieldValue) {
  if (typeof v === "string") return /[\s"=]/.test(v) ? JSON.stringify(v) : v
  return String(v)
}

export const LogRow = memo(function LogRow({
  line,
  columns,
  showTime,
  showStream,
  wrap,
  query,
  selected,
  onSelect,
}: {
  line: LogLine
  columns: string
  showTime: boolean
  showStream: boolean
  wrap: boolean
  query: string
  selected: boolean
  onSelect: (id: string) => void
}) {
  const fields = Object.entries(line.fields)
  return (
    <div
      role="row"
      aria-selected={selected}
      onMouseDown={() => onSelect(line.id)}
      className={cn(
        "grid cursor-default gap-x-3 px-3 hover:bg-hover",
        !wrap && "whitespace-nowrap",
        selected && "bg-selected shadow-[inset_2px_0_0_var(--brand)] hover:bg-selected",
      )}
      style={{ gridTemplateColumns: columns }}
    >
      {showTime && <span className="text-fg-3 tabular">{formatClock(line.ts)}</span>}
      <LevelWord level={line.level} />
      {showStream && <span className={cn("truncate", line.stream ? "text-fg-2" : "text-fg-3")}>{line.stream ?? "tatolabd"}</span>}
      <span className={cn("truncate", line.node ? "text-fg-2" : "text-fg-3")}>{line.node ?? "runtime"}</span>
      <div className={cn("min-w-0", wrap ? "break-words whitespace-pre-wrap" : "truncate")}>
        <span className="text-fg">
          <Highlight text={line.msg} query={query} />
        </span>
        {fields.map(([k, v]) => (
          <span key={k}>
            {"  "}
            <span className="text-fg-3">
              <Highlight text={k} query={query} />=
            </span>
            <span className="text-fg-2">
              <Highlight text={formatField(v)} query={query} />
            </span>
          </span>
        ))}
        {line.traceback && (
          <pre
            className={cn(
              "scrollbar-thin my-1 overflow-x-auto border-l border-danger/60 pl-3 leading-[18px] text-fg-2",
              wrap ? "whitespace-pre-wrap" : "whitespace-pre",
            )}
          >
            <Highlight text={line.traceback} query={query} />
          </pre>
        )}
      </div>
    </div>
  )
})
