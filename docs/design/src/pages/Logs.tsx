// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronDown } from "lucide-react"
import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { machineLogs } from "@/components/logs-stats/logData"
import { LogViewer } from "@/components/logs-stats/LogViewer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { machineById, machines, streams } from "@/data/mock"
import { machineKindIcon } from "@/lib/vocab"

export default function Logs() {
  const [params, setParams] = useSearchParams()
  const here = machines.find((m) => m.isThisMachine)!
  const machine = machineById(params.get("machine") ?? "") ?? here
  const MIcon = machineKindIcon[machine.kind]
  const lines = useMemo(() => machineLogs(machine.id), [machine.id])
  const onMachine = streams.filter((s) => s.machine === machine.id)
  const live = onMachine.filter((s) => s.status === "live" || s.status === "attention")
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h1 className="title-lg">Logs</h1>
          <p className="text-fg-3">
            The runtime and every stream on <span className="font-mono text-xs text-fg-2">{machine.name}</span> · {live.length} of {onMachine.length} streams
            running
          </p>
        </div>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button className="flex h-7 items-center gap-2 rounded-md border px-2 text-fg-2 transition-colors hover:border-line-strong hover:text-fg" />}
            >
              <MIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
              <span className="font-mono text-xs text-fg">{machine.name}</span>
              <span className="text-xs text-fg-3">{machine.isThisMachine ? "This Mac" : machine.location}</span>
              <ChevronDown className="size-3.5 text-fg-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Machine</DropdownMenuLabel>
                {machines.map((m) => {
                  const Icon = machineKindIcon[m.kind]
                  return (
                    <DropdownMenuItem key={m.id} disabled={m.status === "offline"} onClick={() => setParams(m.isThisMachine ? {} : { machine: m.id })}>
                      <Icon />
                      <span className="font-mono text-xs">{m.name}</span>
                      <span className="ml-auto text-xs text-fg-3">{m.isThisMachine ? "This Mac" : m.status === "offline" ? "Offline" : ""}</span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <LogViewer key={machine.id} lines={lines} scope="machine" live={live} className="h-auto flex-1" />
    </div>
  )
}
