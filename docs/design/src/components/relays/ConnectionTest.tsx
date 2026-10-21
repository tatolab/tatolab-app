// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, LoaderCircle, Minus, SquareX } from "lucide-react"
import { useEffect, useState } from "react"
import type { RelaySpec } from "@/data/mock"
import { cn } from "@/lib/utils"
import { RelayLogo } from "./RelayLogo"

const steps = ["DNS", "TLS", "MoQ handshake", "Publish test track"] as const

function timingFor(relay: RelaySpec, step: number) {
  const base = relay.provider === "local" ? 1 : Math.max(relay.latencyMs, 18)
  return [Math.round(base * 0.4) || 1, Math.round(base * 1.2) || 1, Math.round(base * 1.6) || 1, Math.round(base * 2.1) || 2][step]
}

/** Runs the four connection checks for each relay, one after another. */
export function useConnectionTest(runKey: number, relayCount: number) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (runKey === 0) return
    setProgress(0)
    const total = relayCount * steps.length
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      setProgress(n)
      if (n >= total) window.clearInterval(id)
    }, 260)
    return () => window.clearInterval(id)
  }, [runKey, relayCount])
  return progress
}

export function ConnectionTestList({ relays, progress, started }: { relays: RelaySpec[]; progress: number; started: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {relays.map((relay, ri) => {
        const failAt = relay.status === "error" ? 1 : -1
        return (
          <div key={relay.id} className="rounded-md border">
            <div className="flex h-8 items-center gap-2 border-b px-3">
              <RelayLogo provider={relay.provider} className="size-3.5" />
              <span className="font-medium">{relay.name}</span>
              <span className="ml-auto truncate font-mono text-xs text-fg-3">{relay.url}</span>
            </div>
            <ol className="flex flex-col py-1">
              {steps.map((step, si) => {
                const index = ri * steps.length + si
                const failedBefore = failAt >= 0 && si > failAt
                const done = started && progress > index && !failedBefore
                const running = started && progress === index && !failedBefore
                const failed = done && si === failAt
                return (
                  <li key={step} className="flex h-7 items-center gap-2.5 px-3">
                    {failed ? (
                      <SquareX className="size-3.5 text-danger" strokeWidth={1.75} />
                    ) : done ? (
                      <Check className="size-3.5 text-fg-2" strokeWidth={2} />
                    ) : running ? (
                      <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} />
                    ) : (
                      <Minus className="size-3.5 text-fg-4" strokeWidth={1.75} />
                    )}
                    <span className={cn(done || running ? "text-fg" : "text-fg-3", failed && "text-danger")}>{step}</span>
                    <span className="ml-auto font-mono text-xs text-fg-3 tabular">
                      {failed ? "certificate expired" : done ? `${timingFor(relay, si)} ms` : failedBefore && started && progress > index ? "skipped" : ""}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </div>
  )
}
