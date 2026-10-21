// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Settings2, TriangleAlert } from "lucide-react"
import { Link } from "react-router-dom"
import { Group } from "@/components/stream-overview/Group"
import { streamOutputs } from "@/components/stream-overview/model"
import { ExposureLabel, KeyValue, KindIcon } from "@/components/stream/primitives"
import { relaysReaching, type RuntimeStreamState, type TodayStream } from "../../data"
import { CommandBlock } from "./CommandBlock"
import { portAddress } from "./model"

const runModeLabel: Record<RuntimeStreamState, string> = {
  kept: "Always on",
  attached: "Dev session",
  stopped: "Kept, stopped",
  failed: "Kept, skipped",
}

export function TodayDetailsPanel({ stream }: { stream: TodayStream }) {
  const exposed = streamOutputs(stream).filter((o) => o.exposure !== "internal")
  const own = stream.nodes.filter((n) => n.origin !== "built-in").length
  return (
    <aside className="w-80 shrink-0 border-l bg-chrome py-1">
      <Group label="Details">
        <KeyValue
          className="grid-cols-[72px_minmax(0,1fr)] px-2 pt-0.5 pb-1"
          rows={[
            ["Project", <span className="font-mono text-xs" title={stream.project}>{stream.project}</span>],
            [
              "Run mode",
              <span>
                {runModeLabel[stream.state]} <span className="font-mono text-xs text-fg-3">· {stream.state}</span>
              </span>,
            ],
            ["Instance", stream.streamInstance ? <span className="font-mono text-xs">{stream.streamInstance}</span> : <span className="text-fg-3">Not loaded</span>],
            [
              "Steps",
              <span className="tabular">
                {stream.nodes.length}
                {own > 0 && <span className="text-fg-3"> · {own} Python</span>}
              </span>,
            ],
            ["Loaded", stream.loaded ? <span className="tabular">{stream.uptime} ago</span> : <span className="text-fg-3">—</span>],
          ]}
        />
      </Group>

      <Group
        label="Outputs"
        actions={
          <Link
            to={`/streams/${stream.id}/outputs`}
            className="grid size-6 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg"
            aria-label="Change exposure"
            title="Change exposure"
          >
            <Settings2 className="size-3.5" strokeWidth={1.75} />
          </Link>
        }
      >
        {exposed.length === 0 ? (
          <p className="px-2 text-fg-3">Every output is internal.</p>
        ) : (
          <ul className="flex flex-col gap-px">
            {exposed.map((o) => {
              const reach = relaysReaching(o.exposure).length
              return (
                <li key={o.key}>
                  <Link to={`/streams/${stream.id}/outputs`} className="block rounded-md px-2 py-1.5 transition-colors hover:bg-hover">
                    <div className="flex min-w-0 items-center gap-2">
                      <KindIcon kind={o.port.kind} />
                      <span className="truncate font-mono text-xs text-fg" title={portAddress(stream, o.node.id, o.port.name)}>
                        {o.node.id}/{o.port.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-[22px] text-xs">
                      <ExposureLabel exposure={o.exposure} />
                      <span className="truncate text-fg-3">
                        · {reach} relay{reach === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Group>

      {stream.compileWarnings.length > 0 && (
        <Group label="Compile warnings">
          {stream.compileWarnings.map((w) => (
            <div key={w} className="flex gap-2 px-2 pb-1 text-xs leading-4">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" strokeWidth={1.75} />
              <span className="text-fg-2">{w}</span>
            </div>
          ))}
        </Group>
      )}

      <Group label="From the terminal">
        <div className="px-2 pb-1">
          <CommandBlock wrap commands={["tatolab logs", `tatolab graph --stream ${stream.id}`]} />
        </div>
      </Group>
    </aside>
  )
}
