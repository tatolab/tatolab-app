// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy, FileCode2, Filter, type LucideIcon, PanelRightClose, ScrollText, Workflow } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { IconButton, KeyValue } from "@/components/stream/primitives"
import { streamById } from "@/data/mock"
import { cn } from "@/lib/utils"
import { type FieldValue, type LogLine, toRecord } from "./logData"
import { LevelWord } from "./LogRow"

export function useCopied() {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return [copied, copy] as const
}

function JsonValue({ value, indent }: { value: unknown; indent: number }) {
  const pad = "  ".repeat(indent)
  if (value === null) return <span className="text-fg-3">null</span>
  if (typeof value === "string") {
    const s = JSON.stringify(value)
    return <span className="text-fg-2">{s}</span>
  }
  if (typeof value === "number" || typeof value === "boolean") return <span className="text-fg">{String(value)}</span>
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length) return <span className="text-fg-3">{"{}"}</span>
  return (
    <>
      {"{"}
      {"\n"}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {pad}
          {"  "}
          <span className="text-fg-3">{JSON.stringify(k)}</span>
          <span className="text-fg-4">: </span>
          <JsonValue value={v} indent={indent + 1} />
          {i < entries.length - 1 && <span className="text-fg-4">,</span>}
          {"\n"}
        </span>
      ))}
      {pad}
      {"}"}
    </>
  )
}

function fieldText(v: FieldValue) {
  return typeof v === "string" ? v : String(v)
}

function DetailGroup({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-3 pb-3">
      <div className="flex h-8 items-center">
        <span className="label-caps">{label}</span>
        {action && <div className="ml-auto flex items-center">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function DetailMenuItem({ icon: Icon, children, onClick, to }: { icon: LucideIcon; children: React.ReactNode; onClick?: () => void; to?: string }) {
  const cls = "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-fg-2 transition-colors hover:bg-hover hover:text-fg"
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{children}</span>
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

function CopyAction({ text, label }: { text: string; label: string }) {
  const [copied, copy] = useCopied()
  return <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : label} onClick={() => copy(text)} className="size-6" />
}

export function LogLineDetails({
  line,
  onClose,
  onOnlyStep,
}: {
  line: LogLine | null
  onClose: () => void
  onOnlyStep: (key: string) => void
}) {
  const header = (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <span className="font-medium">Line</span>
      <div className="ml-auto flex items-center">
        {line && <CopyAction text={JSON.stringify(toRecord(line))} label="Copy as JSON" />}
        <IconButton icon={PanelRightClose} label="Hide details" onClick={onClose} className="size-6" />
      </div>
    </div>
  )
  if (!line) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <ScrollText className="mx-auto size-5 text-fg-4" strokeWidth={1.5} />
            <div className="mt-2 text-fg-2">No line selected</div>
            <div className="mt-0.5 text-xs text-fg-3">Select a line to see its full record.</div>
          </div>
        </div>
      </div>
    )
  }
  const stream = line.stream ? streamById(line.stream) : undefined
  const node = stream?.nodes.find((n) => n.id === line.node)
  const ownProcess = node && node.origin !== "built-in"
  const record = toRecord(line)
  const fields = Object.entries(line.fields)
  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pt-1 pb-4">
        <DetailGroup label="Message">
          <div className="flex items-start gap-2">
            <LevelWord level={line.level} className="text-xs leading-5" />
            <div className="min-w-0 font-mono text-[12.5px] leading-5 break-words text-fg">{line.msg}</div>
          </div>
        </DetailGroup>

        <DetailGroup label="Source">
          <KeyValue
            className="grid-cols-[64px_minmax(0,1fr)] text-[12.5px]"
            rows={[
              ["Time", <span className="font-mono text-xs tabular">{line.ts.replace("T", " ").replace("Z", "")}</span>],
              [
                "Stream",
                stream ? (
                  <Link to={`/streams/${stream.id}/logs`} className="hover:text-brand-text">
                    {stream.title}
                  </Link>
                ) : (
                  <span className="text-fg-2">Runtime</span>
                ),
              ],
              [
                "Step",
                node ? (
                  <span>
                    <span className="font-mono text-xs">{node.id}</span>
                    <span className="text-fg-3"> · {node.label}</span>
                  </span>
                ) : (
                  <span className="font-mono text-xs text-fg-2">tatolabd</span>
                ),
              ],
              [
                "Process",
                <span>
                  <span className="font-mono text-xs tabular">{line.pid}</span>
                  <span className="text-fg-3"> · {ownProcess ? `Python ${stream?.python} · own process` : "runtime"}</span>
                </span>,
              ],
            ]}
          />
        </DetailGroup>

        {stream && (
          <DetailGroup label="Go to">
            <div className="-mx-2 flex flex-col gap-px">
              {node && (
                <DetailMenuItem icon={Workflow} to={`/streams/${stream.id}/graph?node=${node.id}`}>
                  Show in graph
                </DetailMenuItem>
              )}
              <DetailMenuItem icon={Filter} onClick={() => onOnlyStep(`${line.stream}/${line.node ?? ""}`)}>
                Only lines from <span className="font-mono text-xs">{line.node ?? "runtime"}</span>
              </DetailMenuItem>
              {node?.file && (
                <DetailMenuItem icon={FileCode2}>
                  Open <span className="font-mono text-xs">{node.file}</span>
                </DetailMenuItem>
              )}
            </div>
          </DetailGroup>
        )}

        {fields.length > 0 && (
          <DetailGroup label="Fields" action={<CopyAction text={JSON.stringify(line.fields)} label="Copy fields" />}>
            <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-xs">
              {fields.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-3">{k}</dt>
                  <dd className={cn("min-w-0 break-all text-fg", typeof v === "number" && "tabular")}>{fieldText(v)}</dd>
                </div>
              ))}
            </dl>
          </DetailGroup>
        )}

        {line.traceback && (
          <DetailGroup label="Traceback" action={<CopyAction text={line.traceback} label="Copy traceback" />}>
            <pre className="scrollbar-thin overflow-x-auto rounded-md border bg-window p-2.5 font-mono text-[11px] leading-4 text-fg-2">{line.traceback}</pre>
          </DetailGroup>
        )}

        <DetailGroup label="Record" action={<CopyAction text={JSON.stringify(record)} label="Copy as JSONL" />}>
          <pre className="scrollbar-thin overflow-x-auto rounded-md border bg-window p-2.5 font-mono text-[11px] leading-4 whitespace-pre">
            <JsonValue value={record} indent={0} />
          </pre>
        </DetailGroup>
      </div>
    </div>
  )
}
