// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Play } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { machines, type RelayProvider, type RelaySpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { machineKindIcon } from "@/lib/vocab"
import { ConnectionTestList, useConnectionTest } from "./ConnectionTest"
import { RelayLogo } from "./RelayLogo"

const providers: { id: RelayProvider; name: string; blurb: string; url: string; credential: string }[] = [
  { id: "cloudflare", name: "Cloudflare", blurb: "MoQ on Cloudflare's edge", url: "https://relay.cloudflare.com/", credential: "API token" },
  { id: "moqpro", name: "moq.pro", blurb: "Hosted MoQ relays", url: "https://moq.pro/@", credential: "Publish key" },
  { id: "red5", name: "Red5 Cloud", blurb: "Red5's managed MoQ", url: "https://<org>.red5.net/live", credential: "API key" },
  { id: "iroh", name: "iroh", blurb: "Peer to peer, no server", url: "iroh://node/", credential: "Node secret" },
  { id: "custom", name: "Any MoQ relay", blurb: "moq-relay you run yourself", url: "https://", credential: "JWT or none" },
]

export function AddRelayDialog({ open, onOpenChange, autoTest = false }: { open: boolean; onOpenChange: (open: boolean) => void; autoTest?: boolean }) {
  const [provider, setProvider] = useState<RelayProvider>("moqpro")
  const [url, setUrl] = useState("https://moq.pro/@tatolab/field-crew")
  const [secret, setSecret] = useState("mp_live_9q2x7c4f2k")
  const [joined, setJoined] = useState<Set<string>>(new Set(["garage-jetson"]))
  const [runKey, setRunKey] = useState(autoTest ? 1 : 0)
  const current = providers.find((p) => p.id === provider)!
  const draft: RelaySpec = {
    id: "draft",
    provider,
    name: current.name,
    url,
    region: "",
    status: "connecting",
    latencyMs: provider === "moqpro" ? 38 : 24,
    subscribers: 0,
    egressMbps: 0,
    tracks: 0,
    joinedBy: [],
    credential: "token",
    note: "",
  }
  const progress = useConnectionTest(runKey, 1)
  const done = runKey > 0 && progress >= 4

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={false} className="gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <div className="border-b px-5 pt-4 pb-3.5">
          <DialogTitle className="text-[15px] leading-5 font-semibold">Add a relay</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-fg-3">
            A MoQ relay carries public outputs off your tailnet. Machines publish to it; anyone with access reads.
          </DialogDescription>
        </div>
        <div className="grid grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex flex-col gap-px border-r bg-chrome p-2">
            <div className="label-caps px-2 pt-1 pb-1.5">Provider</div>
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProvider(p.id)
                  setUrl(p.url)
                  setSecret("")
                  setRunKey(0)
                }}
                className={cn("flex h-11 items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-hover", provider === p.id && "bg-selected hover:bg-selected")}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-raised">
                  <RelayLogo provider={p.id} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-fg">{p.name}</span>
                  <span className="block truncate text-xs text-fg-3">{p.blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-4 px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-fg-2">Relay URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-8 rounded-md border bg-window px-2.5 font-mono text-xs outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-fg-2">{current.credential}</span>
              <input
                type="password"
                value={secret}
                placeholder="Paste from the provider's dashboard"
                onChange={(e) => setSecret(e.target.value)}
                className="h-8 rounded-md border bg-window px-2.5 font-mono text-xs outline-none placeholder:font-sans placeholder:text-fg-3 focus:border-brand"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-fg-2">Machines that join</span>
              <div className="grid grid-cols-2 gap-x-3">
                {machines.map((m) => {
                  const MIcon = machineKindIcon[m.kind]
                  return (
                    <label key={m.id} className="flex h-7 cursor-default items-center gap-2">
                      <Checkbox
                        checked={joined.has(m.id)}
                        onCheckedChange={(v) =>
                          setJoined((s) => {
                            const next = new Set(s)
                            if (v) next.add(m.id)
                            else next.delete(m.id)
                            return next
                          })
                        }
                      />
                      <MIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
                      <span className="truncate font-mono text-xs">{m.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            {runKey > 0 && <ConnectionTestList relays={[draft]} progress={progress} started />}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t bg-chrome px-5 py-3">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]" onClick={() => setRunKey((k) => k + 1)}>
            <Play className="size-3.5" /> Test
          </Button>
          <span className="text-xs text-fg-3">{done ? "Connected. Test track published and read back." : runKey > 0 ? "Testing…" : "Test before adding."}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 px-2.5 text-[13px]" onClick={() => onOpenChange(false)}>
              Add relay
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
