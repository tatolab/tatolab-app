// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, Ellipsis, LoaderCircle, SquareX, Plus, RotateCw, TriangleAlert } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { AddRelayDialog } from "@/components/relays/AddRelayDialog"
import { RelayLogo, RelayLogoRow } from "@/components/relays/RelayLogo"
import { RelaySetupSheet } from "@/components/relays/RelaySetupSheet"
import { allRelays, relaySetups } from "@/components/relays/relayData"
import { ExposureLabel, IconButton, Sparkline } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type RelaySpec, series } from "@/data/mock"
import { cn } from "@/lib/utils"

function RelayStatus({ relay }: { relay: RelaySpec }) {
  if (relay.status === "connected") return <span className="text-fg-2">Connected</span>
  if (relay.status === "connecting")
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} /> Connecting…
      </span>
    )
  if (relay.status === "off") return <span className="text-fg-3">Off</span>
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-default items-center gap-1.5 text-danger" />}>
        <SquareX className="size-3.5" strokeWidth={1.75} /> TLS failed
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{relay.note}</TooltipContent>
    </Tooltip>
  )
}

function Credential({ relay }: { relay: RelaySpec }) {
  if (relay.credential === "expiring")
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-warn">
        <TriangleAlert className="size-3.5" strokeWidth={1.75} /> Key expires in 6 days
      </span>
    )
  const words = { none: relay.provider === "local" ? "Tailnet identity" : "None", token: "API token", key: "API key" } as const
  return <span className="whitespace-nowrap text-fg-2">{words[relay.credential]}</span>
}

function MachineNames({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="text-fg-3">None</span>
  const shown = ids.slice(0, 2)
  return (
    <span className="font-mono text-xs whitespace-nowrap text-fg-2">
      {shown.join(", ")}
      {ids.length > 2 && <span className="font-sans text-fg-3"> +{ids.length - 2}</span>}
    </span>
  )
}

function num(relay: RelaySpec, value: string) {
  return relay.status === "connected" ? value : "—"
}

export default function Sharing() {
  const [params, setParams] = useSearchParams()
  const setup = relaySetups.find((s) => s.id === params.get("setup"))
  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p)
  }
  const connected = allRelays.filter((r) => r.status === "connected")
  const egress = connected.reduce((sum, r) => sum + r.egressMbps, 0)

  return (
    <div className="flex min-h-full flex-col pb-8">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div>
          <h1 className="title-lg">Relays</h1>
          <p className="text-fg-3">
            {connected.length} connected · {egress.toFixed(1)} Mb/s out · MoQ servers your machines publish public outputs to
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" className="h-7 gap-1 px-2.5 text-[13px]" onClick={() => update({ add: "1" })}>
            <Plus className="size-3.5" /> Add relay
          </Button>
        </div>
      </div>

      <div className="border-t">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-xs text-fg-3">
              <th className="h-8 pr-3 pl-5 font-normal">Relay</th>
              <th className="px-3 font-normal">Region</th>
              <th className="px-3 font-normal">Status</th>
              <th className="px-3 text-right font-normal">Latency</th>
              <th className="px-3 text-right font-normal">Tracks</th>
              <th className="px-3 text-right font-normal">Egress</th>
              <th className="px-3 font-normal">Machines</th>
              <th className="px-3 font-normal">Credential</th>
              <th className="pr-4 pl-3 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {allRelays.map((r, i) => (
              <tr key={r.id} className="group h-[52px] border-b transition-colors last:border-b-0 hover:bg-hover">
                <td className="pr-3 pl-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-chrome">
                      <RelayLogo provider={r.provider} />
                    </span>
                    <div className="min-w-0">
                      <div className={cn("truncate", r.status === "off" ? "text-fg-2" : "text-fg")}>{r.name}</div>
                      <div className="max-w-72 truncate font-mono text-xs text-fg-3">{r.url}</div>
                    </div>
                  </div>
                </td>
                <td className="max-w-48 truncate px-3 text-fg-2">{r.region}</td>
                <td className="px-3 whitespace-nowrap">
                  <RelayStatus relay={r} />
                </td>
                <td className="px-3 text-right text-fg-2 tabular">{num(r, `${r.latencyMs} ms`)}</td>
                <td className="px-3 text-right text-fg-2 tabular">{num(r, `${r.tracks}`)}</td>
                <td className="px-3">
                  <div className="flex items-center justify-end gap-2.5 whitespace-nowrap text-fg-2 tabular">
                    {num(r, `${r.egressMbps.toFixed(1)} Mb/s`)}
                    <span className="w-16">
                      {r.status === "connected" && <Sparkline values={series(i * 7 + 3, 30, r.egressMbps, r.egressMbps * 0.35)} color={`var(--series-${(i % 8) + 1})`} className="h-5" />}
                    </span>
                  </div>
                </td>
                <td className="px-3">
                  <MachineNames ids={r.joinedBy} />
                </td>
                <td className="px-3">
                  <Credential relay={r} />
                </td>
                <td className="pr-4 pl-3">
                  <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <IconButton icon={RotateCw} label="Reconnect" />
                    <IconButton icon={Ellipsis} label="More" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-end gap-3 px-5 pb-3">
        <div>
          <h2 className="text-[15px] leading-5 font-semibold">Relay setups</h2>
          <p className="text-fg-3">A setup is the set of relays a machine joins, in order, and the exposure its new outputs get.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 px-2.5 text-[13px]">
          <Plus className="size-3.5" /> New setup
        </Button>
      </div>
      <div className="mx-5 overflow-hidden rounded-lg border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b bg-chrome text-xs text-fg-3">
              <th className="h-8 pr-3 pl-4 font-normal">Setup</th>
              <th className="px-3 font-normal">Relays</th>
              <th className="px-3 font-normal">Machines</th>
              <th className="px-3 font-normal">Default exposure</th>
              <th className="w-8 pr-3" />
            </tr>
          </thead>
          <tbody>
            {relaySetups.map((s) => (
              <tr key={s.id} onClick={() => update({ setup: s.id })} className="group h-12 cursor-default border-b transition-colors last:border-b-0 hover:bg-hover">
                <td className="pr-3 pl-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    {s.isDefault && <span className="rounded-[4px] border px-1 text-xs text-fg-3">Default</span>}
                  </div>
                  <div className="truncate text-xs text-fg-3">{s.description}</div>
                </td>
                <td className="px-3">
                  <div className="flex items-center gap-2">
                    <RelayLogoRow relayIds={s.relays} />
                    <span className="truncate text-fg-2">{s.relays.map((id) => allRelays.find((r) => r.id === id)!.name).join(" → ")}</span>
                  </div>
                </td>
                <td className="px-3">
                  <MachineNames ids={s.machines} />
                </td>
                <td className="px-3">
                  <ExposureLabel exposure={s.exposure} />
                </td>
                <td className="pr-3">
                  <ChevronRight className="size-4 text-fg-4 group-hover:text-fg-3" strokeWidth={1.75} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RelaySetupSheet setup={setup} onClose={() => update({ setup: null })} />
      <AddRelayDialog open={params.get("add") === "1"} autoTest={params.get("test") === "1"} onOpenChange={(o) => update({ add: o ? "1" : null, test: null })} />
    </div>
  )
}
