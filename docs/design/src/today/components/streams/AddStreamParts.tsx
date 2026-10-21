// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, FileCode2, Folder, FolderOpen, LoaderCircle, type LucideIcon, SquareX, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { CommandBlock } from "@/components/setup/CommandBlock"
import { Preview } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const small = "h-7 gap-1.5 px-2.5 text-[13px]"

/** One labelled row of the add-stream form. */
export function AddStreamField({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-4 py-3">
      <div className="pt-1 text-fg-2">{label}</div>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-1.5 text-xs text-fg-3">{hint}</div>}
      </div>
    </div>
  )
}

/** A folder path in a well with a Choose button. */
export function ProjectFolderPicker({ path, onChoose }: { path: string; onChoose?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <FolderOpen className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{path}</span>
      <Button variant="outline" size="sm" className={small} onClick={onChoose}>
        Choose…
      </Button>
    </div>
  )
}

export interface ProjectCheck {
  icon: LucideIcon
  name: string
  found: boolean
  detail: string
  fix?: string
}

/** What the folder holds that `run_stream` needs: a stream.py and the project's own .venv. */
export function ProjectChecks({ checks }: { checks: ProjectCheck[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      {checks.map((c) => (
        <div key={c.name} className="border-b px-3 py-2.5 last:border-b-0">
          <div className="flex items-center gap-3">
            <c.icon className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
            <span className="w-24 shrink-0 font-mono text-[13px] text-fg">{c.name}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{c.detail}</span>
            {c.found ? (
              <span className="inline-flex items-center gap-1.5 text-fg-2">
                <Check className="size-3.5" strokeWidth={2} /> Found
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warn">
                <TriangleAlert className="size-3.5" strokeWidth={1.75} /> Missing
              </span>
            )}
          </div>
          {!c.found && c.fix && (
            <div className="mt-2.5 flex items-center gap-2 pl-7">
              <CommandBlock command={c.fix} className="h-8 flex-1" />
              <Button variant="outline" size="sm" className={small}>
                Check again
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** The name the stream loads under, and the runtime's refusal when another project holds it. */
export function StreamNameInput({
  value,
  onChange,
  heldBy,
  suggestion,
}: {
  value: string
  onChange: (v: string) => void
  heldBy?: string
  suggestion: string
}) {
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!heldBy}
        spellCheck={false}
        className={cn(
          "h-7 w-full max-w-sm rounded-md border bg-window px-2.5 font-mono text-[13px] outline-none focus:border-brand",
          heldBy && "border-danger focus:border-danger",
        )}
      />
      {heldBy && (
        <div className="mt-2 flex max-w-lg items-start gap-1.5 text-danger">
          <SquareX className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0 text-[13px]">
            <span className="font-mono text-xs">{value}</span> is already used by <span className="font-mono text-xs">{heldBy}</span> — load under another name.
            <div className="mt-1.5">
              <Button variant="outline" size="sm" className={cn(small, "text-fg")} onClick={() => onChange(suggestion)}>
                Use <span className="font-mono text-xs">{suggestion}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Always on is the only mode the app can start; a dev session belongs to a terminal. */
export function RunModeChoice() {
  return (
    <div className="flex h-7 w-fit items-center rounded-md bg-well p-0.5">
      <span className="flex h-6 items-center rounded-[5px] bg-raised px-2.5 text-fg shadow-[0_0_0_0.5px_var(--line-strong),0_1px_2px_rgba(0,0,0,0.15)]">Always on</span>
      <Tooltip>
        <TooltipTrigger render={<span className="flex h-6 cursor-default items-center rounded-[5px] px-2.5 text-fg-4" />}>Dev session</TooltipTrigger>
        <TooltipContent className="max-w-60">A dev session lives as long as the terminal that runs it. Start one with tatolab dev.</TooltipContent>
      </Tooltip>
    </div>
  )
}

export interface CompileLine {
  at: string
  text: string
  tone?: "warn" | "muted"
}

/** The output of `run_stream` as it compiles, loads and starts, one line at a time. */
export function CompileLog({ lines, streaming, title }: { lines: CompileLine[]; streaming: boolean; title: string }) {
  const [shown, setShown] = useState(streaming ? 1 : lines.length)
  useEffect(() => {
    if (!streaming) return
    const id = window.setInterval(() => setShown((n) => Math.min(lines.length - 1, n + 1)), 140)
    return () => window.clearInterval(id)
  }, [streaming, lines.length])
  const visible = lines.slice(0, shown)
  return (
    <div className="overflow-hidden rounded-lg border bg-well">
      <div className="flex h-8 items-center gap-2 border-b px-3 text-xs text-fg-3">
        <span className="min-w-0 flex-1 truncate font-mono">{title}</span>
        {streaming && <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />}
      </div>
      <div className="scrollbar-thin max-h-[340px] overflow-y-auto px-3 py-2.5 font-mono text-xs leading-5">
        {visible.map((l, i) => (
          <div key={i} className="flex gap-3 whitespace-pre-wrap">
            <span className="w-11 shrink-0 text-right text-fg-4 tabular">{l.at}</span>
            <span className={cn("min-w-0", l.tone === "warn" ? "text-warn" : l.tone === "muted" ? "text-fg-3" : "text-fg")}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The `compile_warnings` a run returned, for the person to read before they move on. */
export function CompileWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null
  return (
    <div>
      <div className="label-caps mb-1.5">
        {warnings.length} compile {warnings.length === 1 ? "warning" : "warnings"}
      </div>
      <div className="overflow-hidden rounded-lg border">
        {warnings.map((w) => (
          <div key={w} className="flex items-start gap-2.5 border-b px-3 py-2.5 last:border-b-0">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" strokeWidth={1.75} />
            <span className="min-w-0 text-fg-2">{w}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const sampleFiles: { icon: LucideIcon; name: string; body: string }[] = [
  { icon: FileCode2, name: "stream.py", body: "The stream function: a test pattern. Change it, then Reload." },
  { icon: Folder, name: "nodes/", body: "Your Python nodes, one file each. Each runs in its own process." },
]

/** What `tatolab new` writes: the sample stream, a test pattern. */
export function SampleProjectContents({ directory }: { directory: string }) {
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 rounded-lg border p-3">
      <Preview scene="pattern" className="aspect-video w-full" caption={`${directory.split("/").pop()}/pattern`} />
      <div className="flex min-w-0 flex-col gap-3 py-0.5">
        {sampleFiles.map((f) => (
          <div key={f.name} className="flex gap-2.5">
            <f.icon className="mt-0.5 size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
            <div className="min-w-0">
              <div className="font-mono text-[13px] text-fg">{f.name}</div>
              <div className="text-xs text-fg-3">{f.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
