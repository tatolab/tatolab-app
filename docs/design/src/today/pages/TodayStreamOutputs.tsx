// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Radio } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { LivePreview } from "@/components/live/LivePreview"
import { RelayLogo } from "@/components/relays/RelayLogo"
import { CopyField } from "@/components/stream-overview/CopyField"
import { type StreamOutput, streamOutputs } from "@/components/stream-overview/model"
import { KindIcon } from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Exposure } from "@/data/mock"
import { cn } from "@/lib/utils"
import { exposureWords, kindWords } from "@/lib/vocab"
import { relaysReaching, type TodayStream } from "../data"
import { CommandBlock } from "../components/stream/CommandBlock"
import { exposeCommand, portAddress, sceneWhenExposed, watchUrl } from "../components/stream/model"
import { useTodayStream } from "./TodayStreamLayout"

const levels: Exposure[] = ["internal", "private", "public"]

function Thumb({ stream, output, level }: { stream: TodayStream; output: StreamOutput; level: Exposure }) {
  const scene = level !== "internal" && output.port.kind !== "data" ? sceneWhenExposed(stream, output.node.id, output.port.name) : undefined
  if (scene && stream.loaded)
    return (
      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-[5px] bg-black ring-1 ring-line">
        <LivePreview scene={scene} />
      </div>
    )
  return (
    <div className="grid h-9 w-16 shrink-0 place-items-center rounded-[5px] bg-well ring-1 ring-line">
      <KindIcon kind={output.port.kind} className="size-4" />
    </div>
  )
}

function RelayChips({ level }: { level: Exposure }) {
  const relays = relaysReaching(level)
  if (!relays.length) return <span className="text-fg-4">—</span>
  return (
    <div className="flex flex-wrap items-center gap-1">
      {relays.map((r) => (
        <Link
          key={r.relayId}
          to="/relays"
          className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-window px-1.5 text-xs text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
        >
          <RelayLogo provider={r.adapter} className="size-3.5" />
          <span className="font-mono">{r.relayId}</span>
          {r.connection.state === "lost" && <span className="text-warn">lost</span>}
        </Link>
      ))}
    </div>
  )
}

function RecordedWord({ stream, recorded }: { stream: TodayStream; recorded: boolean }) {
  if (stream.state === "attached")
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="cursor-default text-fg-3" />}>Not recorded</TooltipTrigger>
        <TooltipContent className="max-w-64">This dev session's levels reset when it ends.</TooltipContent>
      </Tooltip>
    )
  if (!recorded) return <span className="text-fg-4">—</span>
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default text-fg-2" />}>Recorded</TooltipTrigger>
      <TooltipContent className="max-w-64">
        Kept with the stream: it loads at this level after a restart.
        <span className="mt-1 block font-mono text-[10px] opacity-60">recorded: true</span>
      </TooltipContent>
    </Tooltip>
  )
}

function recordingNote(stream: TodayStream) {
  if (stream.state === "attached") return "Dev session · levels are not recorded — this dev session's levels reset when it ends."
  if (stream.state === "kept") return "Changes apply to the running stream, with no restart, and are recorded: they survive restarts."
  return "Not loaded. These are the recorded levels; they apply when the stream loads. Start it to change them."
}

function OutputsBody({ stream }: { stream: TodayStream }) {
  const outputs = streamOutputs(stream)
  const initial = Object.fromEntries(outputs.map((o) => [o.key, o.exposure])) as Record<string, Exposure>
  const [level, setLevel] = useState<Record<string, Exposure>>(initial)
  const editable = stream.loaded
  const exposed = outputs.filter((o) => level[o.key] !== "internal")
  const commands = outputs
    .filter((o) => level[o.key] !== "internal" || initial[o.key] !== "internal")
    .map((o) => exposeCommand(stream, o.node.id, o.port.name, level[o.key]))

  return (
    <div className="pb-10">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div>
          <h2 className="font-medium">Who can read each output</h2>
          <p className="text-fg-3">{recordingNote(stream)}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-7 gap-1.5 px-2.5 text-[13px]" nativeButton={false} render={<Link to="/relays" />}>
          <Radio className="size-3.5" /> Relays
        </Button>
      </div>

      <table className="w-full border-collapse border-y text-left">
        <thead>
          <tr className="border-b text-xs text-fg-3">
            <th className="h-8 pr-3 pl-5 font-normal">Output</th>
            <th className="px-3 font-normal">Kind</th>
            <th className="px-3 font-normal">Readable by</th>
            <th className="px-3 font-normal whitespace-nowrap">Across restarts</th>
            <th className="pr-5 pl-3 font-normal">Reaches</th>
          </tr>
        </thead>
        <tbody>
          {outputs.map((o) => {
            const ex = level[o.key]
            return (
              <tr key={o.key} className="h-[52px] border-b last:border-b-0">
                <td className="pr-3 pl-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb stream={stream} output={o} level={ex} />
                    <div className="min-w-0">
                      <div className="truncate text-fg">{o.node.label}</div>
                      <div className="truncate font-mono text-xs text-fg-3">
                        {o.node.id}/{o.port.name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3">
                  <span className="inline-flex items-center gap-1.5 text-fg-2">
                    <KindIcon kind={o.port.kind} />
                    {kindWords[o.port.kind].label}
                  </span>
                </td>
                <td className="px-3">
                  <Segmented
                    value={ex}
                    onChange={(v) => editable && setLevel((e) => ({ ...e, [o.key]: v }))}
                    options={levels.map((id) => {
                      const Icon = exposureWords[id].icon
                      return {
                        id,
                        label: (
                          <>
                            <Icon className={cn("size-3.5", ex === id ? "text-fg-2" : "text-fg-3")} strokeWidth={1.75} />
                            {exposureWords[id].label}
                          </>
                        ),
                      }
                    })}
                    className={cn("w-fit", !editable && "pointer-events-none opacity-60")}
                  />
                </td>
                <td className="px-3 whitespace-nowrap">
                  <RecordedWord stream={stream} recorded={ex !== "internal" || ex !== initial[o.key]} />
                </td>
                <td className="pr-5 pl-3">
                  <RelayChips level={ex} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="grid gap-8 px-5 pt-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-0.5 font-medium">Addresses</h2>
          <p className="mb-3 text-fg-3">Read an exposed output from another stream, or watch it on the runtime's loopback page.</p>
          {exposed.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-fg-3">Every output is internal. Nothing can be read from outside this stream.</div>
          ) : (
            <div className="divide-y rounded-md border">
              {exposed.map((o) => (
                <div key={o.key} className="px-3 py-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <KindIcon kind={o.port.kind} />
                    <span className="font-mono text-xs text-fg">
                      {o.node.id}/{o.port.name}
                    </span>
                    <span className="ml-auto text-xs text-fg-3">{exposureWords[level[o.key]].label}</span>
                  </div>
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs text-fg-3">Address</span>
                    <CopyField value={portAddress(stream, o.node.id, o.port.name)} />
                    {o.port.kind !== "data" && (
                      <>
                        <span className="text-xs text-fg-3">Watch</span>
                        <CopyField value={watchUrl(stream, o.node.id, o.port.name)} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="mb-0.5 font-medium">From the terminal</h2>
          <p className="mb-3 text-fg-3">The same levels with the CLI. Updates as you change them above.</p>
          <CommandBlock commands={commands} empty="# every output is internal" />
        </section>
      </div>
    </div>
  )
}

export default function TodayStreamOutputs() {
  const stream = useTodayStream()
  return <OutputsBody key={stream.id} stream={stream} />
}
