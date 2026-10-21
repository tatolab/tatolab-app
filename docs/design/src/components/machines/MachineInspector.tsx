// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowUpCircle, RotateCw, SquareTerminal, X } from "lucide-react"
import { Link } from "react-router-dom"
import { RelayLogo } from "@/components/relays/RelayLogo"
import { IconButton, KeyValue, Preview, Sparkline, StatusLabel } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { type MachineSpec, relayById, series } from "@/data/mock"
import { machineKindIcon } from "@/lib/vocab"
import { hasUpdate, latestRuntimeVersion, machineFacts, streamsOn } from "./machineFacts"

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-3.5 last:border-b-0">
      <div className="mb-2.5 flex items-center">
        <span className="label-caps">{title}</span>
        {aside && <span className="ml-auto text-xs text-fg-3">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function ResourceRow({ label, value, values, color }: { label: string; value: string; values?: number[]; color: string }) {
  return (
    <div className="grid grid-cols-[64px_56px_1fr] items-center gap-3">
      <span className="text-fg-3">{label}</span>
      <span className="text-right text-fg tabular">{value}</span>
      {values ? <Sparkline values={values} color={color} className="h-5" /> : <span className="h-5 border-b border-dashed" />}
    </div>
  )
}

export function MachineInspector({ machine, onClose }: { machine: MachineSpec; onClose: () => void }) {
  const facts = machineFacts[machine.id]
  const MIcon = machineKindIcon[machine.kind]
  const online = machine.status === "online"
  const onIt = streamsOn(machine.id)
  const update = hasUpdate(machine)
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l bg-chrome">
      <div className="flex shrink-0 items-start gap-2.5 border-b px-4 pt-3.5 pb-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-md border bg-raised">
          <MIcon className="size-4 text-fg-2" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] font-medium">{machine.name}</div>
          <div className="truncate text-xs text-fg-3">
            {machine.location}
            {machine.isThisMachine && " · This Mac"}
          </div>
        </div>
        <IconButton icon={X} label="Close" onClick={onClose} className="-mt-0.5 -mr-1.5" />
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5 border-b px-4 py-3">
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]" disabled={!online}>
          <SquareTerminal className="size-3.5" /> Open terminal
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]" disabled={!online}>
          <RotateCw className="size-3.5" /> Restart runtime
        </Button>
        {update && (
          <Button size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
            <ArrowUpCircle className="size-3.5" /> Update to {latestRuntimeVersion}
          </Button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <Section title="Details">
          <KeyValue
            className="grid-cols-[96px_minmax(0,1fr)]"
            rows={[
              ["Status", online ? <span className="text-fg-2">Online</span> : <span className="text-fg-3">Offline · last seen {facts.lastSeen}</span>],
              ["Address", <span className="font-mono text-xs">{machine.address}</span>],
              ["OS", machine.os],
              ["GPU", machine.gpu],
              [
                "Runtime",
                <span className="font-mono text-xs">
                  tatolabd {machine.runtimeVersion}
                  {update && <span className="font-sans text-brand-text"> · {latestRuntimeVersion} available</span>}
                </span>,
              ],
              ["Uptime", <span className="tabular">{facts.uptime}</span>],
              ["Temperature", online ? <span className={machine.temperature >= 72 ? "text-warn tabular" : "tabular"}>{machine.temperature} °C</span> : "—"],
            ]}
          />
        </Section>

        <Section title="Resources" aside={online ? "last 5 min" : undefined}>
          <div className="flex flex-col gap-2">
            <ResourceRow color="var(--series-1)" label="CPU" value={online ? `${machine.cpu}%` : "—"} values={online ? series(facts.seed, 40, machine.cpu, 14) : undefined} />
            <ResourceRow color="var(--series-2)" label="GPU" value={online ? `${machine.gpuLoad}%` : "—"} values={online ? series(facts.seed + 1, 40, machine.gpuLoad, 18) : undefined} />
            <ResourceRow
              color="var(--series-3)"
              label="Memory"
              value={online ? `${((machine.memory / 100) * facts.memoryTotalGb).toFixed(1)} GB` : "—"}
              values={online ? series(facts.seed + 2, 40, machine.memory, 4) : undefined}
            />
          </div>
        </Section>

        <Section title="Streams" aside={`${onIt.length}`}>
          {onIt.length === 0 ? (
            <p className="text-fg-3">No streams on this machine.</p>
          ) : (
            <div className="-mx-2 flex flex-col">
              {onIt.map((s, i) => {
                const running = s.status === "live" || s.status === "attention"
                return (
                  <Link key={s.id} to={`/streams/${s.id}`} className="flex h-11 items-center gap-2.5 rounded-md px-2 hover:bg-hover">
                    <Preview scene={s.hero} paused={!running} seed={i * 7} className="h-[27px] w-12 shrink-0 rounded-[4px]" />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <StatusLabel status={s.status} className="shrink-0 text-xs" />
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Relays joined" aside={`${machine.relays.length}`}>
          <div className="flex flex-col gap-2">
            {machine.relays.map((id) => {
              const r = relayById(id)!
              return (
                <div key={id} className="flex items-center gap-2.5">
                  <RelayLogo provider={r.provider} />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-fg-3">{!online ? "—" : r.status === "connected" ? `${r.latencyMs} ms` : r.status === "connecting" ? "Connecting…" : "Off"}</span>
                </div>
              )
            })}
          </div>
        </Section>
      </div>
    </aside>
  )
}
