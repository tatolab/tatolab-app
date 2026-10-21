// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowUpRight, Check, Copy, Eye, Lock, PanelRightClose, Pin, ScrollText, Trash2 } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { address, pinKey, useGraphUi } from "@/components/graph/context"
import { fmt, type LinkEdge } from "@/components/graph/model"
import { PanelGroup, panelRowClass } from "@/components/graph/PanelGroup"
import { PortOutputView } from "@/components/graph/PortOutputView"
import { useCopy } from "@/components/stream-overview/CopyField"
import { Segmented } from "@/components/stream/Segmented"
import { ExposureLabel, IconButton, KeyValue, KindIcon } from "@/components/stream/primitives"
import { Kbd } from "@/components/ui/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Exposure, NodeSpec, PortSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { categoryWords, exposureWords, kindWords, originWords } from "@/lib/vocab"
import { relaysReaching, type TodayStream } from "../../data"
import { refusedBy } from "./model"

function Section({ title, children, actions, className, collapsible }: { title: string; children: React.ReactNode; actions?: React.ReactNode; className?: string; collapsible?: boolean }) {
  return (
    <PanelGroup label={title} actions={actions} collapsible={collapsible} className="border-b last:border-b-0" contentClassName={cn("px-2 pb-1", className)}>
      {children}
    </PanelGroup>
  )
}

export function stepStateWord(spec: NodeSpec, loaded: boolean) {
  if (!loaded) return <span className="text-fg-3">Not loaded</span>
  if (spec.state === "starting") return <span className="text-fg-2">Starting</span>
  if (spec.state === "stopped") return <span className="text-fg-3">Stopped</span>
  return <span className="text-fg-2">Running</span>
}

/** The step card footer: state word, and the runtime's counters when above zero. */
export function TodayStepFooter({ spec, droppedIn, loaded, showCounters, stream }: { spec: NodeSpec; droppedIn: number; loaded: boolean; showCounters: boolean; stream: TodayStream }) {
  const refused = spec.ports.filter((p) => p.direction === "out").reduce((a, p) => a + refusedBy(stream, spec.id, p.name), 0)
  const problems = loaded ? [droppedIn > 0 && `${fmt(droppedIn)} dropped in`, refused > 0 && `${fmt(refused)} refused`].filter(Boolean) : []
  const word = !loaded ? "Not loaded" : spec.state === "starting" ? "Starting…" : spec.state === "stopped" ? "Stopped" : "Running"
  return (
    <div className="flex h-6 items-center gap-2 border-t px-2.5 font-mono text-[11px] whitespace-nowrap">
      <span className="text-fg-3">{word}</span>
      {showCounters && problems.length > 0 && <span className="ml-auto truncate text-warn tabular">{problems.join(" · ")}</span>}
    </div>
  )
}

function InternalPortHint({ onExpose, compact }: { onExpose: () => void; compact?: boolean }) {
  return (
    <div className={cn("grid place-items-center rounded-md bg-well ring-1 ring-line", compact ? "py-5" : "aspect-video")}>
      <div className="flex max-w-60 flex-col items-center gap-2 px-4 text-center">
        <Lock className="size-4 text-fg-3" strokeWidth={1.75} />
        <span className="text-xs leading-4 text-fg-3">Internal: only this stream's own steps read it.</span>
        <button
          onClick={onExpose}
          className="nodrag inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[13px] whitespace-nowrap text-fg transition-colors hover:bg-hover"
        >
          <Eye className="size-3.5 text-fg-3" strokeWidth={1.75} /> Expose to this machine to preview
        </button>
      </div>
    </div>
  )
}

export interface InternalPeekTarget {
  spec: NodeSpec
  port: PortSpec
  anchor: DOMRect
}

/** The hover card for an internal output: no preview, one way to get one. */
export function InternalPortPeek({ target, onExpose, onEnter, onLeave }: { target: InternalPeekTarget; onExpose: () => void; onEnter: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const { spec, port, anchor } = target
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = anchor.right + 14
    if (left + w > window.innerWidth - 8) left = anchor.left - w - 14
    const top = Math.min(Math.max(8, anchor.top + anchor.height / 2 - h / 2), window.innerHeight - h - 8)
    setPos({ left, top })
  }, [anchor])
  return createPortal(
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={pos ?? { left: -9999, top: -9999 }}
      className={cn("fixed z-50 w-[300px] rounded-lg border border-line-strong bg-popover text-[13px] shadow-[var(--shadow-pop)]", pos && "animate-in fade-in-0 zoom-in-[0.98] duration-100")}
    >
      <div className="flex h-9 items-center gap-2 px-3">
        <KindIcon kind={port.kind} />
        <span className="min-w-0 truncate font-mono text-xs text-fg">{port.name}</span>
        <span className="text-xs text-fg-3">{spec.label}</span>
      </div>
      <div className="px-3 pb-3">
        <InternalPortHint onExpose={onExpose} compact />
        <div className="mt-2 flex items-center gap-3 text-xs text-fg-3">
          <span>{kindWords[port.kind].label}</span>
          <ExposureLabel exposure="internal" className="text-xs text-fg-3" />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CopyAddress({ value }: { value: string }) {
  const { copied, copy } = useCopy()
  return <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy address"} onClick={() => copy("a", value)} className="size-6 [&_svg]:size-3.5" />
}

export function TodayNodeInspector({
  spec,
  edges,
  stream,
  editable,
  onExposure,
  onRemove,
  onClose,
}: {
  spec: NodeSpec
  edges: LinkEdge[]
  stream: TodayStream
  editable: boolean
  onExposure: (port: string, e: Exposure) => void
  onRemove: () => void
  onClose: () => void
}) {
  const ui = useGraphUi()
  const outputs = spec.ports.filter((p) => p.direction === "out")
  const [outName, setOutName] = useState<string | null>(null)
  const out = outputs.find((p) => p.name === outName) ?? outputs.find((p) => p.preview) ?? outputs[0]
  const outExposed = out && out.exposure && out.exposure !== "internal"
  const Cat = categoryWords[spec.category].icon
  const config = Object.entries(spec.config ?? {})
  const inbound = edges.filter((e) => e.target === spec.id)
  const linksOut = edges.filter((e) => e.source === spec.id).length
  return (
    <>
      <div className="flex shrink-0 items-start gap-2.5 border-b p-4 pr-2 pb-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border bg-raised">
          <Cat className="size-4 text-fg-2" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-5 font-medium">{spec.label}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs">
            {stepStateWord(spec, stream.loaded)}
            <span className="text-fg-4">·</span>
            <span className="text-fg-3">
              {inbound.length} link{inbound.length === 1 ? "" : "s"} in · {linksOut} out
            </span>
          </div>
        </div>
        <IconButton icon={PanelRightClose} label="Hide inspector" onClick={onClose} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {out && (
          <Section
            title="Output"
            actions={
              outExposed ? (
                <IconButton icon={Pin} label="Pin preview" active={ui.pinned.includes(pinKey(spec.id, out.name))} onClick={() => ui.togglePin(pinKey(spec.id, out.name))} />
              ) : undefined
            }
          >
            {outputs.length > 1 && (
              <Select value={out.name} onValueChange={(v) => setOutName(v as string)}>
                <SelectTrigger size="sm" className="mb-2 h-7 w-full rounded-md border-line-strong bg-well font-mono text-xs dark:bg-well">
                  <KindIcon kind={out.kind} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-md">
                  {outputs.map((p) => (
                    <SelectItem key={p.name} value={p.name} className="font-mono text-xs">
                      <KindIcon kind={p.kind} /> {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {outExposed ? (
              <>
                <PortOutputView spec={spec} port={out} paused={!stream.loaded} className="w-full" />
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-3">{address(ui, spec.id, out.name)}</span>
                  <CopyAddress value={address(ui, spec.id, out.name)} />
                </div>
              </>
            ) : editable ? (
              <InternalPortHint onExpose={() => onExposure(out.name, "private")} />
            ) : (
              <div className="grid aspect-video place-items-center rounded-md bg-well text-xs text-fg-3 ring-1 ring-line">Internal · no preview</div>
            )}
          </Section>
        )}
        <Section title="Step">
          <KeyValue
            className="grid-cols-[72px_minmax(0,1fr)] gap-y-2"
            rows={[
              ["Name", <span className="font-mono text-xs">{spec.id}</span>],
              ["Type", <span className="font-mono text-xs" title={spec.className}>{spec.className}</span>],
              ["Origin", originWords[spec.origin].label],
              ["Process", <span className="text-fg-2">{spec.origin === "built-in" ? "In the runtime" : "Own process"}</span>],
              ...(spec.file
                ? ([
                    [
                      "File",
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-xs">{spec.file}</span>
                        <a className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 text-xs text-brand-text hover:underline">
                          Open in editor <ArrowUpRight className="size-3" />
                        </a>
                      </span>,
                    ],
                  ] as [React.ReactNode, React.ReactNode][])
                : []),
            ]}
          />
        </Section>
        {config.length > 0 && (
          <Section title="Config" actions={<span className="pr-1 text-xs text-fg-3">Set when added</span>}>
            <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1.5 font-mono text-xs">
              {config.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-3">{k}</dt>
                  <dd className="min-w-0 truncate text-fg tabular">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}
        {outputs.length > 0 && (
          <Section title="Exposure" actions={<span className="pr-1 text-xs text-fg-3">{editable ? "Applies live" : "Start to change"}</span>}>
            <div className="flex flex-col gap-3">
              {outputs.map((p) => {
                const level = p.exposure ?? "internal"
                const reach = relaysReaching(level).length
                return (
                  <div key={p.name}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <KindIcon kind={p.kind} />
                      <span className="min-w-0 truncate font-mono text-xs text-fg">{p.name}</span>
                      {reach > 0 && (
                        <Link to="/relays" className="ml-auto shrink-0 text-xs text-fg-3 hover:text-fg">
                          {reach} relay{reach === 1 ? "" : "s"}
                        </Link>
                      )}
                    </div>
                    <Segmented<Exposure>
                      value={level}
                      onChange={(e) => editable && onExposure(p.name, e)}
                      className={cn("w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1.5 [&>button]:text-xs", !editable && "pointer-events-none opacity-60")}
                      options={(["internal", "private", "public"] as Exposure[]).map((e) => {
                        const Icon = exposureWords[e].icon
                        return {
                          id: e,
                          label: (
                            <>
                              <Icon className="size-3 opacity-70" strokeWidth={1.75} />
                              {exposureWords[e].label}
                            </>
                          ),
                        }
                      })}
                    />
                  </div>
                )
              })}
            </div>
          </Section>
        )}
        {stream.loaded && (inbound.length > 0 || outputs.length > 0) && (
          <Section title="Counters" actions={<span className="pr-1 text-xs text-fg-3">since wired</span>}>
            <div className="flex flex-col gap-1 font-mono text-xs">
              {inbound.map((e) => {
                const l = e.data!.link
                return (
                  <div key={e.id} className="flex h-6 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-fg-2" title={`${l.from.node}/${l.from.port} → ${l.to.port}`}>
                      <span className="text-fg-3">{l.from.node}/</span>
                      {l.from.port}
                    </span>
                    <span className="shrink-0 text-fg-3">dropped</span>
                    <span className={cn("w-12 shrink-0 text-right tabular", l.dropped > 0 ? "text-warn" : "text-fg-2")}>{fmt(l.dropped)}</span>
                  </div>
                )
              })}
              {outputs.map((p) => {
                const n = refusedBy(stream, spec.id, p.name)
                return (
                  <div key={p.name} className="flex h-6 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-fg-2">{p.name}</span>
                    <span className="shrink-0 text-fg-3">refused</span>
                    <span className={cn("w-12 shrink-0 text-right tabular", n > 0 ? "text-warn" : "text-fg-2")}>{fmt(n)}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}
        <div className="flex gap-1.5 p-4 pt-3">
          {editable && (
            <button onClick={onRemove} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[13px] hover:bg-hover">
              <Trash2 className="size-3.5 text-fg-3" /> Remove step
            </button>
          )}
          <Link
            to={`/streams/${stream.id}/logs?step=${stream.id}/${spec.id}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[13px] hover:bg-hover"
          >
            <ScrollText className="size-3.5 text-fg-3" /> Logs
          </Link>
        </div>
      </div>
    </>
  )
}

export function TodayStreamSummary({ steps, edges, stream, onClose, onSelect }: { steps: NodeSpec[]; edges: LinkEdge[]; stream: TodayStream; onClose: () => void; onSelect: (id: string) => void }) {
  const exposed = steps.flatMap((n) => n.ports.filter((p) => p.direction === "out" && p.exposure && p.exposure !== "internal").map((p) => ({ n, p })))
  const dropped = edges.reduce((a, e) => a + (e.data?.link.dropped ?? 0), 0)
  const own = steps.filter((n) => n.origin !== "built-in").length
  return (
    <>
      <div className="flex shrink-0 items-start gap-2.5 border-b p-4 pr-2 pb-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-5 font-medium">{stream.title}</div>
          <div className="mt-0.5 truncate text-xs text-fg-3">Nothing selected · the whole stream</div>
        </div>
        <IconButton icon={PanelRightClose} label="Hide inspector" onClick={onClose} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <Section title="Summary">
          <KeyValue
            className="grid-cols-[112px_minmax(0,1fr)] gap-y-2"
            rows={[
              ["Steps", <span className="tabular">{steps.length}{own > 0 && <span className="text-fg-3"> · {own} in their own process</span>}</span>],
              ["Links", <span className="tabular">{edges.length}{stream.loaded && dropped > 0 && <span className="text-warn"> · {fmt(dropped)} dropped</span>}</span>],
              ["Exposed outputs", <span className="tabular">{exposed.length}</span>],
              ["Instance", stream.streamInstance ? <span className="font-mono text-xs">{stream.streamInstance}</span> : <span className="text-fg-3">Not loaded</span>],
              ["Entry", <span className="font-mono text-xs">{stream.project}/stream.py</span>],
            ]}
          />
        </Section>
        {exposed.length > 0 && (
          <Section title="Exposed outputs" className="px-0">
            {exposed.map(({ n, p }) => (
              <button key={`${n.id}.${p.name}`} onClick={() => onSelect(n.id)} className={panelRowClass()}>
                <KindIcon kind={p.kind} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">
                  <span className="text-fg-3">{n.id}/</span>
                  {p.name}
                </span>
                <ExposureLabel exposure={p.exposure!} className="text-xs" />
              </button>
            ))}
          </Section>
        )}
        <Section title="Keyboard" collapsible>
          <div className="flex flex-col gap-1.5 text-fg-2">
            {[
              ["Add step", ["⌘", "K"]],
              ["Remove selection", ["⌫"]],
              ["Fit to view", ["F"]],
              ["Undo", ["⌘", "Z"]],
            ].map(([label, keys]) => (
              <div key={label as string} className="flex h-6 items-center justify-between">
                <span>{label}</span>
                <span className="flex gap-1">
                  {(keys as string[]).map((k) => (
                    <Kbd key={k} className="min-w-5 border border-line bg-well text-xs text-fg-2">
                      {k}
                    </Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-4 text-fg-3">
            Hover an exposed output to peek at it; click it to pin a preview. Internal outputs have no track to watch until you expose them.
          </p>
        </Section>
      </div>
    </>
  )
}
