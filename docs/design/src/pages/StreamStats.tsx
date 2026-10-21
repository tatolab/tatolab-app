// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChartNoAxesColumn, TriangleAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ChartPanel, DroppedChart, FpsChart, LatencyBreakdown } from "@/components/logs-stats/StatsCharts"
import {
  dropSeries,
  fpsSeries,
  isRunning,
  linkDropRate,
  type Range,
  ranges,
  resourceSeries,
  type StepStats,
  stepStats,
  targetFps,
} from "@/components/logs-stats/statsData"
import { formatMemory, Meter, Sparkline } from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import { machineById, type StreamSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { useStream } from "@/pages/StreamLayout"

function StatBlock({
  label,
  value,
  unit,
  hint,
  values,
  problem,
}: {
  label: string
  value: string
  unit?: string
  hint: string
  values: number[]
  problem?: boolean
}) {
  return (
    <div className="min-w-0 px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="label-caps">{label}</span>
        <span className="ml-auto truncate text-xs text-fg-3">{hint}</span>
      </div>
      <div className="mt-1 flex items-end gap-4">
        <div className={cn("shrink-0 text-[20px] leading-7 font-medium tracking-[-0.01em] tabular", problem && "text-warn")}>
          {value}
          {unit && <span className="ml-0.5 text-[13px] font-normal text-fg-3">{unit}</span>}
        </div>
        {values.length > 2 && <Sparkline values={values} className="mb-1 h-7 min-w-0 flex-1" color={problem ? "var(--warn)" : "var(--fg-3)"} />}
      </div>
    </div>
  )
}

function ProcessTable({ steps, selected, onSelect }: { steps: StepStats[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b text-xs text-fg-3">
          <th className="h-8 pr-3 pl-5 font-normal">Step</th>
          <th className="px-3 text-right font-normal">PID</th>
          <th className="px-3 font-normal">Interpreter</th>
          <th className="px-3 text-right font-normal">CPU</th>
          <th className="px-3 text-right font-normal">GPU</th>
          <th className="px-3 text-right font-normal">Memory</th>
          <th className="px-3 text-right font-normal">Threads</th>
          <th className="px-3 text-right font-normal">Restarts</th>
          <th className="pr-5 pl-3 text-right font-normal">Uptime</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((s) => (
          <tr
            key={s.node.id}
            onClick={() => onSelect(s.node.id)}
            className={cn("h-10 cursor-default border-b last:border-b-0 hover:bg-hover", s.node.id === selected && "bg-selected hover:bg-selected")}
          >
            <td className="pr-3 pl-5">
              <div className="flex items-center gap-2">
                <span className="truncate text-fg">{s.node.label}</span>
                <span className="truncate font-mono text-xs text-fg-3">{s.node.id}</span>
                {s.bottleneck && <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-label="Bottleneck" />}
              </div>
            </td>
            <td className={cn("px-3 text-right font-mono text-xs tabular", s.ownProcess ? "text-fg-2" : "text-fg-3")}>{s.pid}</td>
            <td className={cn("px-3 whitespace-nowrap", s.ownProcess ? "text-fg-2" : "text-fg-3")}>{s.interpreter}</td>
            <td className="px-3">
              <div className="flex items-center justify-end gap-2 text-fg-2 tabular">
                {s.cpu ? `${s.cpu}%` : "—"}
                <Meter value={s.cpu} />
              </div>
            </td>
            <td className="px-3">
              <div className="flex items-center justify-end gap-2 text-fg-2 tabular">
                {s.gpu ? `${s.gpu}%` : "—"}
                <Meter value={s.gpu} />
              </div>
            </td>
            <td className="px-3">
              <div className="flex items-center justify-end gap-2 text-fg-2 tabular">
                {formatMemory(s.memoryMb)}
                <Meter value={s.memoryMb} max={4096} />
              </div>
            </td>
            <td className="px-3 text-right text-fg-2 tabular">{s.threads || "—"}</td>
            <td className={cn("px-3 text-right tabular", s.restarts ? "text-warn" : "text-fg-3")}>{s.restarts}</td>
            <td className="pr-5 pl-3 text-right text-fg-2 tabular">{s.uptime}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BottleneckNote({ stream, step }: { stream: StreamSpec; step: StepStats }) {
  return (
    <div className="flex h-10 items-center gap-2 border-b px-5">
      <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} />
      <span className="truncate">
        {step.node.label} is the bottleneck — {Math.round(step.latencyMs)} ms per frame
        {step.inputDropPct > 0 && `, ${Math.round(step.inputDropPct)}% dropped at its input`}
      </span>
      <Link to={`/streams/${stream.id}/graph?node=${step.node.id}`} className="shrink-0 text-brand-text hover:underline">
        Open in graph
      </Link>
    </div>
  )
}

function NotRunning({ stream }: { stream: StreamSpec }) {
  return (
    <div className="grid place-items-center border-b px-5 py-14 text-center">
      <div>
        <ChartNoAxesColumn className="mx-auto size-5 text-fg-4" strokeWidth={1.5} />
        <div className="mt-2 text-fg-2">{stream.status === "failed" ? "Exited — no samples" : "Stopped — no samples"}</div>
        <div className="mt-0.5 text-xs text-fg-3">
          {stream.statusDetail}. Start the stream to see frames per second, latency and drops per step.
        </div>
      </div>
    </div>
  )
}

export default function StreamStats() {
  const stream = useStream()
  const [params] = useSearchParams()
  const [range, setRange] = useState<Range>((params.get("range") as Range) || "5m")
  const steps = useMemo(() => stepStats(stream), [stream])
  const bottleneck = steps.find((s) => s.bottleneck)
  const defaultStep = params.get("step") ?? bottleneck?.node.id ?? steps.find((s) => s.ownProcess)?.node.id ?? steps[0]?.node.id ?? ""
  const [selectedState, setSelected] = useState<{ stream: string; step: string } | null>(null)
  const selected = selectedState?.stream === stream.id ? selectedState.step : defaultStep
  const select = (step: string) => setSelected({ stream: stream.id, step })
  const running = isRunning(stream)
  const spec = ranges.find((r) => r.id === range)!
  const machine = machineById(stream.machine)!
  const dropPerMin = stream.links.reduce((a, l) => a + linkDropRate(stream, l), 0)
  const droppingLinks = stream.links.filter((l) => linkDropRate(stream, l) > 0)
  const fps = useMemo(() => fpsSeries(stream, range), [stream, range])
  const drops = useMemo(() => dropSeries(stream, range), [stream, range])
  const ownProcesses = steps.filter((s) => s.ownProcess).length

  return (
    <div className="flex flex-col pb-6">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-5">
        <span className="text-fg-3">{running ? spec.caption : stream.status === "failed" ? "Exited · no samples" : "Stopped · no samples"}</span>
        <span className="text-fg-4">·</span>
        <span className="text-fg-3">
          {steps.length} steps, {ownProcesses} in their own Python process
        </span>
        <Segmented className="ml-auto" value={range} onChange={setRange} options={ranges.map((r) => ({ id: r.id, label: r.label }))} />
      </div>

      {bottleneck && <BottleneckNote stream={stream} step={bottleneck} />}

      <div className="grid grid-cols-4 divide-x border-b">
        <StatBlock
          label="CPU"
          value={running ? `${stream.cpu}` : "—"}
          unit={running ? "%" : undefined}
          hint={machine.name}
          values={running ? resourceSeries(stream, "cpu", range) : [0, 0]}
        />
        <StatBlock
          label="GPU"
          value={running && stream.gpu ? `${stream.gpu}` : "—"}
          unit={running && stream.gpu ? "%" : undefined}
          hint={machine.gpu.split(" · ")[0]}
          values={running && stream.gpu ? resourceSeries(stream, "gpu", range) : [0, 0]}
        />
        <StatBlock
          label="Memory"
          value={running ? formatMemory(stream.memoryMb) : "—"}
          hint={`across ${steps.length} steps`}
          values={running ? resourceSeries(stream, "memoryMb", range) : [0, 0]}
        />
        <StatBlock
          label="Dropped"
          value={running ? (dropPerMin >= 10 ? `${Math.round(dropPerMin)}` : `${dropPerMin}`) : "—"}
          unit={running ? "/min" : undefined}
          hint={droppingLinks.length ? `on ${droppingLinks.length} of ${stream.links.length} links` : `${stream.links.length} ${stream.links.length === 1 ? "link" : "links"}`}
          values={running ? drops.map((d) => d.dropped) : [0, 0]}
          problem={running && dropPerMin >= 1}
        />
      </div>

      {running ? (
        <>
          <div className="grid grid-cols-3 divide-x border-b">
            <ChartPanel
              className="col-span-2"
              title="Frames per second by step"
              aside={
                <span>
                  source <span className="text-fg-2 tabular">{targetFps(stream)}</span> fps
                </span>
              }
            >
              <FpsChart stream={stream} data={fps} selected={selected} onSelect={select} />
            </ChartPanel>
            <ChartPanel title="Dropped messages by link" aside="per sample, all links">
              <DroppedChart stream={stream} data={drops} />
            </ChartPanel>
          </div>
          <ChartPanel
            className="border-b"
            title="Latency per step"
            aside={
              <span>
                <span className="text-fg-2 tabular">{stream.endToEndMs} ms</span> end to end · share of each frame's time
              </span>
            }
          >
            <LatencyBreakdown stream={stream} steps={steps} selected={selected} onSelect={select} />
          </ChartPanel>
        </>
      ) : (
        <NotRunning stream={stream} />
      )}

      <div className="flex h-10 items-center px-5">
        <h2 className="font-medium">Processes</h2>
        <span className="ml-3 text-xs text-fg-3">Python steps run in their own process; built-ins run inside the runtime</span>
      </div>
      <div className="border-t">
        <ProcessTable steps={steps} selected={selected} onSelect={select} />
      </div>
    </div>
  )
}
