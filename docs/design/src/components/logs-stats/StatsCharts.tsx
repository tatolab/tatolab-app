// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { TriangleAlert } from "lucide-react"
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { StreamSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { linkDropRate, linkLabel, seriesColor, type StepStats, targetFps } from "./statsData"

const tick = { fill: "var(--fg-3)", fontSize: 11 }

type TooltipRow = { name: string; value: number | string; color: string; strong?: boolean }

function ChartTooltip({ label, rows, unit }: { label?: string | number; rows: TooltipRow[]; unit: string }) {
  return (
    <div className="min-w-44 rounded-md bg-popover px-2.5 py-2 text-xs text-fg shadow-[var(--shadow-pop)]">
      <div className="mb-1 font-mono text-[11px] text-fg-3">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex h-5 items-center gap-2">
          <span className="h-0.5 w-2.5 shrink-0" style={{ background: r.color }} />
          <span className={cn("truncate font-mono text-[11px]", r.strong ? "text-fg" : "text-fg-2")}>{r.name}</span>
          <span className="ml-auto pl-4 tabular">
            {r.value}
            <span className="text-fg-3"> {unit}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function ChartPanel({
  title,
  aside,
  children,
  className,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0 px-5 pt-3 pb-4", className)}>
      <div className="flex h-7 items-center gap-3">
        <h2 className="font-medium">{title}</h2>
        {aside && <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-fg-3">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

function LegendSwatch({ color, square }: { color: string; square?: boolean }) {
  return <span className={cn("block shrink-0", square ? "size-2.5 rounded-[2px]" : "h-0.5 w-3")} style={{ background: color }} />
}

const fpsHeight = 188
const fpsMargin = { top: 8, bottom: 0 }
const xAxisHeight = 30

/** Pixel nudges so end-of-line labels never overlap. */
function labelNudges(values: { id: string; v: number }[], lo: number, hi: number) {
  const plot = fpsHeight - fpsMargin.top - fpsMargin.bottom - xAxisHeight
  const placed = values
    .map((x) => ({ ...x, y: fpsMargin.top + (1 - (x.v - lo) / (hi - lo || 1)) * plot }))
    .sort((a, b) => a.y - b.y)
  const out: Record<string, number> = {}
  let prev = -Infinity
  for (const p of placed) {
    const y = Math.max(p.y, prev + 13)
    out[p.id] = y - p.y
    prev = y
  }
  return out
}

export function FpsChart({
  stream,
  data,
  selected,
  onSelect,
}: {
  stream: StreamSpec
  data: Record<string, number | string>[]
  selected: string
  onSelect: (id: string) => void
}) {
  const target = targetFps(stream)
  const order = stream.nodes.map((n) => n.id)
  const color = (id: string) => seriesColor(order.indexOf(id))
  const drawn = [...stream.nodes.filter((n) => n.id !== selected), ...stream.nodes.filter((n) => n.id === selected)]
  const direct = stream.nodes.length <= 4
  const min = Math.min(...data.flatMap((row) => order.map((id) => row[id] as number)))
  const lo = Math.max(0, Math.floor(min - 3))
  const hi = Math.ceil(target + 2)
  const last = data[data.length - 1] ?? {}
  const nudges = direct ? labelNudges(order.map((id) => ({ id, v: last[id] as number })), lo, hi) : {}
  return (
    <>
      <div className="mt-2" style={{ height: fpsHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ ...fpsMargin, right: direct ? 104 : 4, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={0.7} />
            <XAxis dataKey="t" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={48} height={xAxisHeight} />
            <YAxis tick={tick} tickLine={false} axisLine={false} domain={[lo, hi]} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)" }}
              isAnimationActive={false}
              content={({ active, label, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    label={label}
                    unit="fps"
                    rows={stream.nodes.map((n) => ({
                      name: n.id,
                      value: (payload.find((p) => p.dataKey === n.id)?.value as number) ?? 0,
                      color: color(n.id),
                      strong: n.id === selected,
                    }))}
                  />
                ) : null
              }
            />
            {drawn.map((n) => (
              <Line
                key={n.id}
                dataKey={n.id}
                type="monotone"
                stroke={color(n.id)}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              >
                {direct && (
                  <LabelList
                    dataKey={n.id}
                    content={(p) => {
                      const { index, x, y } = p as { index?: number; x?: number; y?: number }
                      if (index !== data.length - 1 || x === undefined || y === undefined) return null
                      return (
                        <text x={x + 8} y={y + (nudges[n.id] ?? 0)} dy={4} fontSize={11} fill={n.id === selected ? "var(--fg)" : "var(--fg-2)"} className="font-mono">
                          {n.id}
                        </text>
                      )
                    }}
                  />
                )}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-1 gap-y-0.5">
        {stream.nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] text-fg-2 transition-colors hover:bg-hover hover:text-fg",
              n.id === selected && "bg-selected text-fg",
            )}
          >
            <LegendSwatch color={color(n.id)} />
            {n.id}
          </button>
        ))}
      </div>
    </>
  )
}

export function DroppedChart({ stream, data }: { stream: StreamSpec; data: ({ t: string; dropped: number } & Record<string, number | string>)[] }) {
  const any = data.some((d) => d.dropped > 0)
  const peak = Math.max(...data.map((d) => d.dropped), 0)
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((x) => Math.ceil(peak / x) <= 5) ?? 1000
  const top = Math.max(4, Math.ceil(peak / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const color = (id: string) => seriesColor(stream.links.findIndex((l) => l.id === id))
  const dropping = stream.links.filter((l) => linkDropRate(stream, l) > 0)
  const quiet = stream.links.filter((l) => linkDropRate(stream, l) === 0)
  return (
    <>
      <div className="relative mt-2 h-[132px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: -18 }} barCategoryGap={1}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={0.7} />
            <XAxis dataKey="t" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={40} />
            <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, top]} ticks={ticks} />
            <Tooltip
              cursor={{ fill: "var(--hover)" }}
              isAnimationActive={false}
              content={({ active, label, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    label={label}
                    unit="dropped"
                    rows={dropping.map((l) => ({
                      name: `${l.to.node}.${l.to.port}`,
                      value: (payload.find((p) => p.dataKey === l.id)?.value as number) ?? 0,
                      color: color(l.id),
                    }))}
                  />
                ) : null
              }
            />
            {dropping.map((l) => (
              <Bar key={l.id} dataKey={l.id} stackId="drops" fill={color(l.id)} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        {!any && <div className="absolute inset-x-0 top-10 text-center text-xs text-fg-3">No messages dropped in this range</div>}
      </div>
      <div className="mt-3 flex flex-col">
        {[...dropping, ...quiet].slice(0, 4).map((l) => {
          const rate = linkDropRate(stream, l)
          return (
            <div key={l.id} className="flex h-6 items-center gap-2 text-xs">
              {rate ? <LegendSwatch color={color(l.id)} square /> : <span className="size-2.5 shrink-0" />}
              <span className={cn("min-w-0 truncate font-mono text-[11px]", rate ? "text-fg-2" : "text-fg-3")}>{linkLabel(stream, l)}</span>
              <span className={cn("ml-auto shrink-0 tabular", rate ? "text-warn" : "text-fg-3")}>{rate ? `${rate}/min` : "0"}</span>
            </div>
          )
        })}
        {stream.links.length > 4 && <div className="h-6 pl-[18px] text-xs leading-6 text-fg-3">{stream.links.length - 4} more links, none dropping</div>}
      </div>
    </>
  )
}

export function LatencyBreakdown({
  stream,
  steps,
  selected,
  onSelect,
}: {
  stream: StreamSpec
  steps: StepStats[]
  selected: string
  onSelect: (id: string) => void
}) {
  const sum = steps.reduce((a, s) => a + s.latencyMs, 0)
  const transport = Math.max(0, +(stream.endToEndMs - sum).toFixed(1))
  const total = sum + transport
  const segments = [
    ...steps.map((s, i) => ({ id: s.node.id, name: s.node.label, ms: s.latencyMs, fill: seriesColor(i), step: s })),
    { id: "__transport", name: "Transport and queueing", ms: transport, fill: "var(--line-strong)", step: undefined },
  ]
  const row = Object.fromEntries(segments.map((s) => [s.id, s.ms]))
  return (
    <>
      <div className="mt-2 h-[52px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[{ name: "latency", ...row }]} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }} barSize={22}>
            <XAxis type="number" domain={[0, Math.ceil(total)]} tick={tick} tickLine={false} axisLine={false} unit=" ms" tickCount={6} />
            <YAxis type="category" dataKey="name" hide />
            {segments.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId="latency"
                fill={s.fill}
                stroke="var(--window)"
                strokeWidth={1}
                isAnimationActive={false}
                onClick={() => s.step && onSelect(s.id)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-2 w-full border-collapse text-left">
        <tbody>
          {segments.map((s) => {
            const over = s.step?.bottleneck
            return (
              <tr
                key={s.id}
                onClick={() => s.step && onSelect(s.id)}
                className={cn("h-7 border-t first:border-t-0 hover:bg-hover", s.id === selected && "bg-selected hover:bg-selected", !s.step && "text-fg-3")}
              >
                <td className="w-5 pl-1">
                  <LegendSwatch color={s.fill} square />
                </td>
                <td className="pr-3">
                  {s.step ? (
                    <span className="inline-flex items-center gap-2">
                      {s.name}
                      <span className="font-mono text-xs text-fg-3">{s.id}</span>
                      {over && <TriangleAlert className="size-3.5 text-warn" strokeWidth={1.75} aria-label="Bottleneck" />}
                    </span>
                  ) : (
                    s.name
                  )}
                </td>
                <td className={cn("w-64 pr-3 text-right text-xs whitespace-nowrap", over ? "text-warn" : "text-fg-3")}>
                  {over ? `over its ${s.step!.budgetMs.toFixed(1)} ms budget per frame` : ""}
                </td>
                <td className={cn("w-24 pr-3 text-right tabular", over ? "text-warn" : "text-fg-2")}>{s.ms.toFixed(1)} ms</td>
                <td className="w-28 pr-1">
                  <div className="flex items-center justify-end gap-2 text-xs text-fg-3 tabular">
                    {total ? Math.round((s.ms / total) * 100) : 0}%
                    <span className="block h-1 w-14 overflow-hidden rounded-[1px] bg-well">
                      <span className="block h-full bg-fg-3" style={{ width: `${total ? (s.ms / total) * 100 : 0}%` }} />
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
