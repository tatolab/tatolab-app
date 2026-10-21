// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Ellipsis, Plus, RotateCw, Search, SquareTerminal } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AddMachineDialog } from "@/components/machines/AddMachineDialog"
import { MachineInspector } from "@/components/machines/MachineInspector"
import { hasUpdate, machineFacts, streamsOn } from "@/components/machines/machineFacts"
import { RelayLogoRow } from "@/components/relays/RelayLogo"
import { IconButton, Meter } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { type MachineSpec, machines } from "@/data/mock"
import { cn } from "@/lib/utils"
import { machineKindIcon } from "@/lib/vocab"

function LoadCell({ value, online, label }: { value: number; online: boolean; label?: string }) {
  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap text-fg-2 tabular">
      {online ? (label ?? `${value}%`) : "—"}
      <Meter value={online ? value : 0} />
    </div>
  )
}

function MachineRow({ machine, selected, compact, onSelect }: { machine: MachineSpec; selected: boolean; compact: boolean; onSelect: () => void }) {
  const MIcon = machineKindIcon[machine.kind]
  const online = machine.status === "online"
  const update = hasUpdate(machine)
  const facts = machineFacts[machine.id]
  return (
    <tr onClick={onSelect} className={cn("group h-[52px] cursor-default border-b transition-colors last:border-b-0", selected ? "bg-selected" : "hover:bg-hover")}>
      <td className="pr-3 pl-5">
        <div className="flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md border bg-chrome">
            <MIcon className={cn("size-4", online ? "text-fg-2" : "text-fg-4")} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("truncate font-mono text-[13px]", online ? "text-fg" : "text-fg-3")}>{machine.name}</span>
              {machine.isThisMachine && <span className="shrink-0 rounded-[4px] border px-1 text-xs text-fg-3">This Mac</span>}
            </div>
            <div className="truncate text-xs text-fg-3">{machine.location}</div>
          </div>
        </div>
      </td>
      <td className="px-3">
        <div className={online ? "text-fg-2" : "text-fg-3"}>{online ? "Online" : "Offline"}</div>
        <div className="text-xs whitespace-nowrap">
          {update ? (
            <span className="text-brand-text">Update available</span>
          ) : !online ? (
            <span className="text-fg-3">Seen {facts.lastSeen}</span>
          ) : (
            <span className="text-fg-3 tabular">up {facts.uptime}</span>
          )}
        </div>
      </td>
      {!compact && <td className="max-w-44 truncate px-3 text-fg-2">{machine.os}</td>}
      {!compact && <td className="max-w-52 truncate px-3 text-fg-2">{machine.gpu}</td>}
      <td className="px-3 font-mono text-xs text-fg-2">{machine.runtimeVersion}</td>
      <td className="px-3 text-right text-fg-2 tabular">{streamsOn(machine.id).length}</td>
      <td className="px-3">
        <LoadCell value={machine.cpu} online={online} />
      </td>
      <td className="px-3">
        <LoadCell value={machine.gpuLoad} online={online} />
      </td>
      {!compact && (
        <td className="px-3">
          <LoadCell value={machine.memory} online={online} label={`${((machine.memory / 100) * facts.memoryTotalGb).toFixed(1)} GB`} />
        </td>
      )}
      {!compact && (
        <td className="px-3">
          <RelayLogoRow relayIds={machine.relays} />
        </td>
      )}
      <td className="pr-4 pl-3">
        <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {!compact && <IconButton icon={SquareTerminal} label="Open terminal" />}
          {!compact && <IconButton icon={RotateCw} label="Restart runtime" />}
          <IconButton icon={Ellipsis} label="More" />
        </div>
      </td>
    </tr>
  )
}

export default function Machines() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState("")
  const selectedId = params.get("machine")
  const selected = machines.find((m) => m.id === selectedId)
  const addOpen = params.get("add") === "1"
  const compact = !!selected
  const online = machines.filter((m) => m.status === "online").length
  const visible = machines.filter((m) => !query || `${m.name} ${m.location} ${m.os} ${m.gpu}`.toLowerCase().includes(query.toLowerCase()))

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <div>
            <h1 className="title-lg">Machines</h1>
            <p className="text-fg-3">
              {online} of {machines.length} online · tailnet <span className="font-mono text-xs">tail3e9f.ts.net</span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex h-7 w-52 items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
              <Search className="size-3.5 text-fg-3" strokeWidth={1.75} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3" />
            </label>
            <Button size="sm" className="h-7 gap-1 px-2.5 text-[13px]" onClick={() => update({ add: "1" })}>
              <Plus className="size-3.5" /> Add machine
            </Button>
          </div>
        </div>
        <div className="border-t">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-fg-3">
                <th className="h-8 pr-3 pl-5 font-normal">Name</th>
                <th className="px-3 font-normal">Status</th>
                {!compact && <th className="px-3 font-normal">OS</th>}
                {!compact && <th className="px-3 font-normal">GPU</th>}
                <th className="px-3 font-normal">Runtime</th>
                <th className="px-3 text-right font-normal">Streams</th>
                <th className="px-3 text-right font-normal">CPU</th>
                <th className="px-3 text-right font-normal">GPU</th>
                {!compact && <th className="px-3 text-right font-normal">Memory</th>}
                {!compact && <th className="px-3 font-normal">Relays</th>}
                <th className="pr-4 pl-3 font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <MachineRow
                  key={m.id}
                  machine={m}
                  compact={compact}
                  selected={m.id === selectedId}
                  onSelect={() => update({ machine: m.id === selectedId ? null : m.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <MachineInspector machine={selected} onClose={() => update({ machine: null })} />}
      <AddMachineDialog open={addOpen} onOpenChange={(o) => update({ add: o ? "1" : null })} />
    </div>
  )
}
