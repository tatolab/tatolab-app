// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Copy, Settings2 } from "lucide-react"
import { Link } from "react-router-dom"
import { ExposureLabel, formatMemory, IconButton, KeyValue, KindIcon, Meter, RunModeLabel, Sparkline } from "@/components/stream/primitives"
import { machineById, relayById, series, type StreamSpec } from "@/data/mock"
import { machineKindIcon } from "@/lib/vocab"
import { Group } from "./Group"
import { isRunning, portAddress, streamOutputs } from "./model"

function seedOf(id: string) {
  return [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
}

function ResourceRow({ label, value, meter, meterMax, values }: { label: string; value: string; meter: number; meterMax?: number; values: number[] }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-fg-3">{label}</span>
        <span className="ml-auto text-fg tabular">{value}</span>
        <Meter value={meter} max={meterMax} className="w-14" />
      </div>
      <Sparkline values={values} className="mt-1 h-7" height={28} />
    </div>
  )
}

export function DetailsPanel({ stream }: { stream: StreamSpec }) {
  const machine = machineById(stream.machine)!
  const MIcon = machineKindIcon[machine.kind]
  const live = isRunning(stream)
  const seed = seedOf(stream.id)
  const exposed = streamOutputs(stream).filter((o) => o.exposure !== "internal")
  const flat = Array.from({ length: 40 }, () => 0)
  return (
    <aside className="w-80 shrink-0 border-l bg-chrome py-1">
      <Group label="Details" actions={<IconButton icon={Copy} label="Copy as JSON" className="size-6" />}>
        <KeyValue
          className="grid-cols-[72px_minmax(0,1fr)] px-2 pt-0.5 pb-1"
          rows={[
            ["Project", <span className="font-mono text-xs" title={stream.project}>{stream.project}</span>],
            ["Entry", <span className="font-mono text-xs">{stream.entry}</span>],
            ["Python", <span className="tabular">{stream.python}</span>],
            [
              "Machine",
              <Link to="/machines" className="inline-flex items-center gap-1.5 hover:text-brand-text">
                <MIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
                <span className="font-mono text-xs">{machine.name}</span>
              </Link>,
            ],
            ["Run mode", <RunModeLabel mode={stream.runMode} className="text-fg" />],
            ["Created", stream.createdAgo],
            ["Uptime", <span className="tabular">{live ? stream.uptime : "—"}</span>],
            ["Restarts", <span className={stream.restarts >= 5 ? "text-warn tabular" : "tabular"}>{stream.restarts}</span>],
          ]}
        />
      </Group>

      <Group
        label="Outputs"
        actions={
          <Link
            to={`/streams/${stream.id}/sharing`}
            className="grid size-6 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg"
            aria-label="Edit sharing"
            title="Edit sharing"
          >
            <Settings2 className="size-3.5" strokeWidth={1.75} />
          </Link>
        }
      >
        {exposed.length === 0 ? (
          <p className="px-2 text-fg-3">Nothing leaves this stream.</p>
        ) : (
          <ul className="flex flex-col gap-px">
            {exposed.map((o) => (
              <li key={o.key}>
                <Link to={`/streams/${stream.id}/sharing`} className="block rounded-md px-2 py-1.5 transition-colors hover:bg-hover">
                  <div className="flex min-w-0 items-center gap-2">
                    <KindIcon kind={o.port.kind} />
                    <span className="truncate font-mono text-xs text-fg" title={portAddress(stream, o.node.id, o.port.name)}>
                      {o.node.id}/{o.port.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-[22px] text-xs">
                    <ExposureLabel exposure={o.exposure} />
                    {o.exposure === "public" && (
                      <span className="truncate text-fg-3">· {stream.relays.map((r) => relayById(r)?.name ?? r).join(", ")}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group label="Resources" actions={<span className="text-xs text-fg-4">last 15 min</span>}>
        <div className="space-y-3 px-2 pt-0.5 pb-2">
          <ResourceRow label="CPU" value={live ? `${stream.cpu}%` : "—"} meter={live ? stream.cpu : 0} values={live ? series(seed, 40, stream.cpu, stream.cpu * 0.35) : flat} />
          <ResourceRow
            label="GPU"
            value={live && stream.gpu ? `${stream.gpu}%` : "—"}
            meter={live ? stream.gpu : 0}
            values={live && stream.gpu ? series(seed + 7, 40, stream.gpu, stream.gpu * 0.2) : flat}
          />
          <ResourceRow
            label="Memory"
            value={live ? formatMemory(stream.memoryMb) : "—"}
            meter={live ? stream.memoryMb : 0}
            meterMax={8192}
            values={live ? series(seed + 13, 40, stream.memoryMb, stream.memoryMb * 0.04) : flat}
          />
        </div>
      </Group>
    </aside>
  )
}
