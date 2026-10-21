// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Play } from "lucide-react"
import { useState } from "react"
import { IconButton } from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { type Exposure, machines } from "@/data/mock"
import { exposureWords, machineKindIcon } from "@/lib/vocab"
import { ConnectionTestList, useConnectionTest } from "./ConnectionTest"
import { RelayLogo } from "./RelayLogo"
import { allRelays, credentialSecrets, type RelaySetup, relayLookup } from "./relayData"

function Group({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b px-5 py-4">
      <div className="mb-2.5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          {hint && <p className="text-xs text-fg-3">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function MaskedSecret({ value }: { value: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border bg-well pr-0.5 pl-2.5 font-mono text-xs">
      <span className="min-w-0 flex-1 truncate text-fg-2">{shown ? value : `${value.slice(0, 6)}${"*".repeat(12)}`}</span>
      <IconButton icon={shown ? EyeOff : Eye} label={shown ? "Hide" : "Show"} onClick={() => setShown((s) => !s)} className="size-6" />
    </div>
  )
}

export function RelaySetupSheet({ setup, onClose }: { setup: RelaySetup | undefined; onClose: () => void }) {
  return (
    <Sheet open={!!setup} onOpenChange={(o) => !o && onClose()}>
      <SheetContent initialFocus={false} className="gap-0 bg-chrome p-0 data-[side=right]:w-[480px] data-[side=right]:sm:max-w-[480px]">
        {setup && <SetupEditor key={setup.id} setup={setup} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function SetupEditor({ setup, onClose }: { setup: RelaySetup; onClose: () => void }) {
  const [name, setName] = useState(setup.name)
  const [order, setOrder] = useState<string[]>(() => [...setup.relays, ...allRelays.map((r) => r.id).filter((id) => !setup.relays.includes(id))])
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(setup.relays))
  const [joined, setJoined] = useState<Set<string>>(() => new Set(setup.machines))
  const [exposure, setExposure] = useState<Exposure>(setup.exposure)
  const [runKey, setRunKey] = useState(1)
  const active = order.filter((id) => enabled.has(id)).map((id) => relayLookup(id)!)
  const progress = useConnectionTest(runKey, active.length)

  const move = (id: string, by: number) => {
    setOrder((o) => {
      const i = o.indexOf(id)
      const j = i + by
      if (j < 0 || j >= o.length) return o
      const next = [...o]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-5 pt-4 pb-4">
        <SheetTitle className="text-[15px] leading-5 font-semibold">Relay setup</SheetTitle>
        <SheetDescription className="text-[13px] text-fg-3">Machines in a setup join its relays, in this order.</SheetDescription>
        <label className="mt-3 flex h-8 items-center gap-2 rounded-md border bg-window px-2.5 focus-within:border-line-strong">
          <span className="text-fg-3">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
          {setup.isDefault && <span className="text-xs text-fg-3">Default</span>}
        </label>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <Group title="Relays" hint="Outputs publish to every relay that is on. The first one is preferred for reading.">
          <div className="overflow-hidden rounded-md border bg-window">
            {order.map((id) => {
              const r = relayLookup(id)!
              const on = enabled.has(id)
              const rank = order.filter((x) => enabled.has(x)).indexOf(id) + 1
              return (
                <div key={id} className="group flex h-10 items-center gap-2 border-b pr-2 pl-1.5 last:border-b-0">
                  <GripVertical className="size-3.5 shrink-0 cursor-grab text-fg-4" strokeWidth={1.75} />
                  <span className="w-3 text-center text-xs text-fg-3 tabular">{on ? rank : ""}</span>
                  <RelayLogo provider={r.provider} />
                  <div className="min-w-0 flex-1">
                    <div className={on ? "truncate text-fg" : "truncate text-fg-3"}>{r.name}</div>
                  </div>
                  <div className="hidden items-center group-hover:flex">
                    <IconButton icon={ChevronUp} label="Move up" onClick={() => move(id, -1)} className="size-6" />
                    <IconButton icon={ChevronDown} label="Move down" onClick={() => move(id, 1)} className="size-6" />
                  </div>
                  <Switch size="sm" checked={on} onCheckedChange={(v) => setEnabled((s) => toggle(s, id, v))} />
                </div>
              )
            })}
          </div>
        </Group>

        <Group title="Credentials" hint="Stored in the macOS keychain, sent only to that relay.">
          <div className="flex flex-col gap-2">
            {active.filter((r) => credentialSecrets[r.id]).length === 0 && <p className="text-fg-3">No relay in this setup needs a credential.</p>}
            {active
              .filter((r) => credentialSecrets[r.id])
              .map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="flex w-36 shrink-0 items-center gap-2">
                    <RelayLogo provider={r.provider} className="size-3.5" />
                    <span className="truncate text-fg-2">{credentialSecrets[r.id].label}</span>
                  </span>
                  <MaskedSecret value={credentialSecrets[r.id].value} />
                </div>
              ))}
          </div>
        </Group>

        <Group title="Machines" hint="Each machine joins one setup.">
          <div className="flex flex-col">
            {machines.map((m) => {
              const MIcon = machineKindIcon[m.kind]
              return (
                <label key={m.id} className="-mx-1.5 flex h-8 cursor-default items-center gap-2.5 rounded-md px-1.5 hover:bg-hover">
                  <Checkbox checked={joined.has(m.id)} onCheckedChange={(v) => setJoined((s) => toggle(s, m.id, v))} />
                  <MIcon className="size-3.5 text-fg-3" strokeWidth={1.75} />
                  <span className="font-mono text-xs whitespace-nowrap">{m.name}</span>
                  <span className="ml-auto max-w-44 truncate text-xs text-fg-3">{m.status === "offline" ? "Offline" : m.location}</span>
                </label>
              )
            })}
          </div>
        </Group>

        <Group title="Default exposure" hint={exposureWords[exposure].long}>
          <Segmented
            className="w-fit"
            value={exposure}
            onChange={setExposure}
            options={(["internal", "private", "public"] as Exposure[]).map((e) => ({ id: e, label: exposureWords[e].label }))}
          />
        </Group>

        <Group
          title="Test connections"
          hint="Resolves, connects and publishes a 2-second test track to each relay."
          aside={
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]" onClick={() => setRunKey((k) => k + 1)}>
              <Play className="size-3.5" /> Run again
            </Button>
          }
        >
          <ConnectionTestList relays={active} progress={progress} started={runKey > 0} />
        </Group>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
        <span className="text-xs text-fg-3">
          {joined.size} {joined.size === 1 ? "machine" : "machines"} · {active.length} {active.length === 1 ? "relay" : "relays"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-[13px]" onClick={onClose}>
            Save setup
          </Button>
        </div>
      </div>
    </div>
  )
}
