// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy, Radio } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { LivePreview } from "@/components/live/LivePreview"
import { RelayLogo } from "@/components/relays/RelayLogo"
import { CopyField, useCopy } from "@/components/stream-overview/CopyField"
import { isRunning, type StreamOutput, streamOutputs } from "@/components/stream-overview/model"
import { IconButton, KindIcon } from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { type Exposure, machineById, relayById, type StreamSpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { exposureWords, kindWords } from "@/lib/vocab"
import { useStream } from "@/pages/StreamLayout"

const exposureOrder: Exposure[] = ["internal", "private", "public"]
const exposureFlag: Record<Exposure, string> = { internal: "--internal", private: "--machine", public: "--public" }

function Thumb({ output, live }: { output: StreamOutput; live: boolean }) {
  if (output.scene)
    return (
      <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-[5px] bg-black ring-1 ring-line">
        <LivePreview scene={output.scene} paused={!live} />
      </div>
    )
  return (
    <div className="grid h-9 w-16 shrink-0 place-items-center rounded-[5px] bg-well ring-1 ring-line">
      <KindIcon kind={output.port.kind} className="size-4" />
    </div>
  )
}

function relayPath(stream: StreamSpec, o: StreamOutput) {
  return `${stream.id}/${o.node.id}/${o.port.name}`
}

function addressesFor(stream: StreamSpec, o: StreamOutput, exposure: Exposure, relayIds: string[]) {
  const machine = machineById(stream.machine)!
  const path = relayPath(stream, o)
  const rows: { label: React.ReactNode; value: string }[] = []
  if (exposure === "private") rows.push({ label: "This machine", value: `moq://localhost:4443/${path}` })
  if (exposure === "public") {
    rows.push({ label: "Tailnet", value: `moq://${machine.address}:4443/${path}` })
    for (const id of relayIds) {
      const relay = relayById(id)
      if (!relay || relay.provider === "local") continue
      const host = relay.url.replace(/^https?:\/\//, "")
      rows.push({
        label: (
          <span className="inline-flex items-center gap-1.5">
            <RelayLogo provider={relay.provider} className="size-3.5" /> {relay.name}
          </span>
        ),
        value: `moq://${host}/${machine.name}/${path}`,
      })
    }
    if (relayIds.some((id) => relayById(id)?.provider !== "local") && o.port.kind !== "data")
      rows.push({ label: "Watch link", value: `https://watch.tatolab.dev/${machine.name}/${stream.id}/${o.node.id}` })
  }
  return rows
}

function SharingBody({ stream }: { stream: StreamSpec }) {
  const machine = machineById(stream.machine)!
  const outputs = streamOutputs(stream)
  const live = isRunning(stream)
  const [exposure, setExposure] = useState<Record<string, Exposure>>(() => Object.fromEntries(outputs.map((o) => [o.key, o.exposure])))
  const [published, setPublished] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(outputs.map((o) => [o.key, stream.relays.filter((r) => machine.relays.includes(r))])),
  )
  const { copied, copy } = useCopy()
  const shared = outputs.filter((o) => exposure[o.key] !== "internal")
  const commands = shared.map((o) => {
    const relays = exposure[o.key] === "public" ? published[o.key] : []
    const relayFlags = exposure[o.key] === "public" && relays.length !== machine.relays.length ? relays.map((r) => ` --relay ${r}`).join("") : ""
    return `tatolab expose ${relayPath(stream, o)} ${exposureFlag[exposure[o.key]]}${relayFlags}`
  })
  const toggleRelay = (key: string, relay: string, on: boolean) =>
    setPublished((p) => ({ ...p, [key]: on ? [...p[key], relay].sort((a, b) => machine.relays.indexOf(a) - machine.relays.indexOf(b)) : p[key].filter((r) => r !== relay) }))

  return (
    <div className="pb-10">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div>
          <h2 className="font-medium">Who can read each output</h2>
          <p className="text-fg-3">Changes apply to the running stream; no restart.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-7 gap-1.5 px-2.5 text-[13px]" nativeButton={false} render={<Link to="/sharing" />}>
          <Radio className="size-3.5" /> Relays
        </Button>
      </div>

      <table className="w-full border-collapse border-y text-left">
        <thead>
          <tr className="border-b text-xs text-fg-3">
            <th className="h-8 pr-3 pl-5 font-normal">Output</th>
            <th className="px-3 font-normal">Kind</th>
            <th className="px-3 font-normal">Readable by</th>
            <th className="pr-5 pl-3 font-normal">Published to</th>
          </tr>
        </thead>
        <tbody>
          {outputs.map((o) => {
            const ex = exposure[o.key]
            return (
              <tr key={o.key} className="h-[52px] border-b last:border-b-0">
                <td className="pr-3 pl-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb output={o} live={live} />
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
                    onChange={(v) => setExposure((e) => ({ ...e, [o.key]: v }))}
                    options={exposureOrder.map((id) => {
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
                    className="w-fit"
                  />
                </td>
                <td className="pr-5 pl-3">
                  {ex === "public" ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {machine.relays.map((id) => {
                        const relay = relayById(id)!
                        const on = published[o.key].includes(id)
                        return (
                          <label key={id} className="inline-flex cursor-default items-center gap-2">
                            <RelayLogo provider={relay.provider} className="size-3.5" />
                            <span className={on ? "text-fg" : "text-fg-3"}>{relay.name}</span>
                            <Switch size="sm" checked={on} onCheckedChange={(c) => toggleRelay(o.key, id, c)} />
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-fg-4">{ex === "private" ? "Not published" : "—"}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="grid gap-8 px-5 pt-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-0.5 font-medium">Addresses</h2>
          <p className="mb-3 text-fg-3">Read an output from another stream, the CLI, or a MoQ player.</p>
          {shared.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-6 text-center text-fg-3">Every output is internal. Nothing can be read from outside this stream.</div>
          ) : (
            <div className="divide-y rounded-md border">
              {shared.map((o) => (
                <div key={o.key} className="px-3 py-2.5">
                  <div className="mb-2 flex items-center gap-2">
                    <KindIcon kind={o.port.kind} />
                    <span className="font-mono text-xs text-fg">
                      {o.node.id}/{o.port.name}
                    </span>
                    <span className="ml-auto text-xs text-fg-3">{exposureWords[exposure[o.key]].label}</span>
                  </div>
                  <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
                    {addressesFor(stream, o, exposure[o.key], published[o.key]).map((row, i) => (
                      <div key={i} className="contents">
                        <span className="truncate text-xs text-fg-3">{row.label}</span>
                        <CopyField value={row.value} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <h2 className="mb-0.5 font-medium">From the terminal</h2>
          <p className="mb-3 text-fg-3">The same settings with the CLI. Updates as you change them above.</p>
          <div className="relative rounded-md border bg-well">
            <div className="absolute top-1 right-1">
              <IconButton icon={copied === "cli" ? Check : Copy} label={copied === "cli" ? "Copied" : "Copy commands"} onClick={() => copy("cli", commands.join("\n"))} />
            </div>
            <pre className="scrollbar-thin overflow-x-auto py-2.5 pr-10 pl-3 font-mono text-xs leading-5 text-fg">
              {commands.length === 0 ? (
                <span className="text-fg-3"># every output is internal</span>
              ) : (
                commands.map((c) => (
                  <div key={c}>
                    <span className="text-fg-4 select-none">$ </span>
                    {c}
                  </div>
                ))
              )}
            </pre>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function StreamSharing() {
  const stream = useStream()
  return <SharingBody key={stream.id} stream={stream} />
}
