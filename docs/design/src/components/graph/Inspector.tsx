// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowUpRight, Copy, PanelRightClose, Pin, RotateCw, ScrollText } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Segmented } from "@/components/stream/Segmented"
import { ExposureLabel, IconButton, KeyValue, KindIcon, Sparkline } from "@/components/stream/primitives"
import { Kbd } from "@/components/ui/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { type Exposure, type NodeSpec, series } from "@/data/mock"
import { cn } from "@/lib/utils"
import { categoryWords, exposureWords, originWords } from "@/lib/vocab"
import { address, pinKey, useGraphUi } from "./context"
import { PanelGroup, panelRowClass } from "./PanelGroup"
import { fmt, type LinkEdge } from "./model"
import { PortOutputView } from "./PortOutputView"

function Section({
  title,
  children,
  actions,
  className,
  collapsible,
}: {
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
  collapsible?: boolean
}) {
  return (
    <PanelGroup label={title} actions={actions} collapsible={collapsible} className="border-b last:border-b-0" contentClassName={cn("px-2 pb-1", className)}>
      {children}
    </PanelGroup>
  )
}

function stateWord(spec: NodeSpec, stopped: boolean) {
  if (spec.state === "crashed") return <span className="text-danger">Exited · exit 1</span>
  if (stopped || spec.state === "stopped") return <span className="text-fg-3">Stopped</span>
  if (spec.state === "stalled") return <span className="text-warn">Stalled</span>
  if (spec.state === "starting") return <span className="text-fg-2">Starting</span>
  return <span className="text-fg-2">Running</span>
}

function ConfigField({ name, value, onChange }: { name: string; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  const label = <span className="truncate font-mono text-xs text-fg-2">{name}</span>
  if (typeof value === "boolean")
    return (
      <div className="flex h-7 items-center justify-between gap-3">
        {label}
        <Switch size="sm" checked={value} onCheckedChange={(v) => onChange(v)} />
      </div>
    )
  if (typeof value === "number" && value > 0 && value < 1)
    return (
      <div className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3">
        {label}
        <Slider value={[value]} min={0} max={1} step={0.01} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
        <span className="text-right font-mono text-xs text-fg tabular">{value.toFixed(2)}</span>
      </div>
    )
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
      {label}
      <input
        value={String(value)}
        onChange={(e) => onChange(typeof value === "number" ? Number(e.target.value) || 0 : e.target.value)}
        className={cn(
          "h-7 w-full min-w-0 rounded-md border border-line-strong bg-well px-2 text-[13px] text-fg outline-none focus:border-brand/70 focus:ring-2 focus:ring-brand-soft",
          typeof value === "number" ? "font-mono tabular" : "font-mono",
        )}
      />
    </div>
  )
}

function Metric({ label, value, values, warn, color }: { label: string; value: string; values: number[]; warn?: boolean; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-fg-3">{label}</span>
        <span className={cn("font-mono text-xs tabular", warn ? "text-warn" : "text-fg")}>{value}</span>
      </div>
      <Sparkline values={values} color={color} className="mt-1 h-7" height={28} />
    </div>
  )
}

export function NodeInspector({
  spec,
  edges,
  onConfig,
  onExposure,
  onClose,
}: {
  spec: NodeSpec
  edges: LinkEdge[]
  onConfig: (key: string, v: string | number | boolean) => void
  onExposure: (port: string, e: Exposure) => void
  onClose: () => void
}) {
  const ui = useGraphUi()
  const outputs = spec.ports.filter((p) => p.direction === "out")
  const [outName, setOutName] = useState<string | null>(null)
  const out = outputs.find((p) => p.name === outName) ?? outputs.find((p) => p.preview) ?? outputs[0]
  const Cat = categoryWords[spec.category].icon
  const stopped = ui.stopped || spec.state === "stopped" || spec.state === "crashed"
  const m = spec.metrics
  const seed = spec.id.length * 7
  const config = Object.entries(spec.config ?? {})
  const linksIn = edges.filter((e) => e.target === spec.id).length
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
            {stateWord(spec, ui.stopped)}
            <span className="text-fg-4">·</span>
            <span className="text-fg-3">
              {linksIn} link{linksIn === 1 ? "" : "s"} in · {linksOut} out
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
              <IconButton
                icon={Pin}
                label="Pin preview"
                active={ui.pinned.includes(pinKey(spec.id, out.name))}
                onClick={() => ui.togglePin(pinKey(spec.id, out.name))}
              />
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
            <PortOutputView spec={spec} port={out} paused={stopped} className="w-full" />
            <div className="mt-2 flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-3">{address(ui, spec.id, out.name)}</span>
              <IconButton icon={Copy} label="Copy address" className="size-6 [&_svg]:size-3.5" />
            </div>
          </Section>
        )}
        <Section title="Step">
          <KeyValue
            className="grid-cols-[72px_minmax(0,1fr)] gap-y-2"
            rows={[
              ["Class", <span className="font-mono text-xs" title={spec.className}>{spec.className}</span>],
              ["Origin", <span>{originWords[spec.origin].label}{spec.pack && <span className="text-fg-3"> · {spec.pack}</span>}</span>],
              [
                "Process",
                spec.origin === "built-in" ? (
                  <span className="text-fg-2">Runs in the runtime</span>
                ) : spec.pid && !stopped ? (
                  <span className="font-mono text-xs">pid {spec.pid}</span>
                ) : (
                  <span className="text-fg-3">Not running</span>
                ),
              ],
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
          <p className="mt-2.5 text-xs leading-4 text-fg-3">{spec.description}</p>
        </Section>
        {config.length > 0 && (
          <Section title="Config" actions={<span className="pr-1 text-xs text-fg-3">{ui.stream.runMode === "dev-session" ? "Saved to stream.py" : "Applies live"}</span>}>
            <div className="flex flex-col gap-2">
              {config.map(([k, v]) => (
                <ConfigField key={k} name={k} value={v} onChange={(nv) => onConfig(k, nv)} />
              ))}
            </div>
          </Section>
        )}
        {outputs.length > 0 && (
          <Section title="Outputs">
            <div className="flex flex-col gap-3">
              {outputs.map((p) => (
                <div key={p.name}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <KindIcon kind={p.kind} />
                    <span className="truncate font-mono text-xs text-fg">{p.name}</span>
                  </div>
                  <Segmented<Exposure>
                    value={p.exposure ?? "internal"}
                    onChange={(e) => onExposure(p.name, e)}
                    className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1.5 [&>button]:text-xs"
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
              ))}
            </div>
          </Section>
        )}
        <Section title="Metrics" actions={<span className="pr-1 text-xs text-fg-3">last 60 s</span>}>
          {stopped ? (
            <div className="py-2 text-fg-3">No samples while the step is not running.</div>
          ) : (
            <div className="flex flex-col gap-3">
              <Metric color="var(--series-1)" label="Frame rate" value={`${m.fps} fps`} values={series(seed, 40, m.fps, Math.max(0.6, m.fps * 0.04))} />
              <Metric color="var(--series-2)" label="Latency" value={`${m.latencyMs} ms`} values={series(seed + 3, 40, m.latencyMs, m.latencyMs * 0.4)} warn={m.latencyMs > 40} />
              <Metric color="var(--series-3)" label="CPU" value={`${m.cpu}%`} values={series(seed + 5, 40, m.cpu, Math.max(2, m.cpu * 0.5))} />
              {m.dropped > 0 && (
                <div className="flex items-center justify-between rounded-md bg-warn-soft px-2.5 py-1.5 text-xs">
                  <span className="text-warn">Dropped</span>
                  <span className="font-mono text-xs text-warn tabular">{fmt(m.dropped)} · newest-wins</span>
                </div>
              )}
            </div>
          )}
        </Section>
        <div className="flex gap-1.5 p-4 pt-3">
          <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[13px] hover:bg-hover">
            <RotateCw className="size-3.5 text-fg-3" /> Restart step
          </button>
          <Link
            to={`/streams/${ui.stream.id}/logs?node=${spec.id}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2.5 text-[13px] hover:bg-hover"
          >
            <ScrollText className="size-3.5 text-fg-3" /> Logs
          </Link>
        </div>
      </div>
    </>
  )
}

export function StreamSummary({ steps, edges, onClose, onSelect }: { steps: NodeSpec[]; edges: LinkEdge[]; onClose: () => void; onSelect: (id: string) => void }) {
  const ui = useGraphUi()
  const s = ui.stream
  const exposed = steps.flatMap((n) => n.ports.filter((p) => p.direction === "out" && p.exposure && p.exposure !== "internal").map((p) => ({ n, p })))
  const dropped = edges.reduce((a, e) => a + (e.data?.link.dropped ?? 0), 0)
  const pythonSteps = steps.filter((n) => n.origin !== "built-in").length
  return (
    <>
      <div className="flex shrink-0 items-start gap-2.5 border-b p-4 pr-2 pb-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] leading-5 font-medium">{s.title}</div>
          <div className="mt-0.5 truncate text-xs text-fg-3">Nothing selected · the whole stream</div>
        </div>
        <IconButton icon={PanelRightClose} label="Hide inspector" onClick={onClose} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <Section title="Summary">
          <KeyValue
            className="grid-cols-[112px_minmax(0,1fr)] gap-y-2"
            rows={[
              ["Steps", <span className="tabular">{steps.length} <span className="text-fg-3">· {pythonSteps} in their own process</span></span>],
              ["Links", <span className="tabular">{edges.length}{dropped > 0 && <span className="text-warn"> · {fmt(dropped)} dropped</span>}</span>],
              ["Exposed outputs", <span className="tabular">{exposed.length}</span>],
              ["End-to-end", <span className="font-mono text-xs tabular">{ui.stopped || !s.endToEndMs ? "—" : `${s.endToEndMs} ms`}</span>],
              ["Frame rate", <span className="font-mono text-xs tabular">{ui.stopped || !s.fps ? "—" : `${s.fps} fps · ${s.resolution}`}</span>],
              ["Entry", <span className="font-mono text-xs">{s.project}/{s.entry}</span>],
            ]}
          />
        </Section>
        {exposed.length > 0 && (
          <Section title="Exposed outputs" className="px-0">
            {exposed.map(({ n, p }) => (
              <button
                key={`${n.id}.${p.name}`}
                onClick={() => onSelect(n.id)}
                className={panelRowClass()}
              >
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
              ["Delete selection", ["⌫"]],
              ["Duplicate", ["⌘", "D"]],
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
          <p className="mt-3 text-xs leading-4 text-fg-3">Hover an output port to peek at it. Click the port to pin a preview over the canvas.</p>
        </Section>
      </div>
    </>
  )
}
