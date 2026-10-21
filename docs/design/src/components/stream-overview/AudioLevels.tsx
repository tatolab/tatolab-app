// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const ticks = [0, -6, -12, -24, -48]
const floorDb = -60

function toPct(db: number) {
  return Math.max(0, Math.min(100, ((db - floorDb) / -floorDb) * 100))
}

function levelAt(t: number, channel: number) {
  const speech = Math.abs(Math.sin(t * 2.1 + channel * 0.4)) * 0.6 + Math.abs(Math.sin(t * 7.3 + channel)) * 0.3
  const syllables = Math.sin(t * 0.7) > -0.6 ? 1 : 0.25
  return -42 + speech * syllables * 34 + Math.sin(t * 23 + channel * 2) * 2.5
}

/** Vertical L/R peak meters in dBFS, as in a DAW channel strip. */
export function AudioLevels({ live, className }: { live: boolean; className?: string }) {
  const [t, setT] = useState(4)
  const [peaks, setPeaks] = useState<[number, number]>([floorDb, floorDb])
  useEffect(() => {
    if (!live) return
    const start = performance.now()
    const id = window.setInterval(() => {
      const now = (performance.now() - start) / 1000 + 4
      setT(now)
      setPeaks(([pl, pr]) => [Math.max(pl - 0.6, levelAt(now, 0)), Math.max(pr - 0.6, levelAt(now, 1))])
    }, 50)
    return () => window.clearInterval(id)
  }, [live])
  const levels = live ? [levelAt(t, 0), levelAt(t, 1)] : [floorDb, floorDb]
  return (
    <div className={cn("flex h-full shrink-0 gap-2 select-none", className)}>
      <div className="relative w-6 text-right text-[10px] text-fg-4 tabular">
        {ticks.map((db) => (
          <span key={db} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${100 - toPct(db)}%` }}>
            {db}
          </span>
        ))}
      </div>
      {(["L", "R"] as const).map((ch, i) => (
        <div key={ch} className="flex h-full w-3 flex-col items-center gap-1.5">
          <div className="relative w-full flex-1 overflow-hidden rounded-[2px] bg-well">
            {ticks.map((db) => (
              <span key={db} className="absolute inset-x-0 h-px bg-line" style={{ top: `${100 - toPct(db)}%` }} />
            ))}
            <span
              className={cn("absolute inset-x-0 bottom-0 bg-fg-3 transition-[height] duration-75", levels[i] > -3 && "bg-warn")}
              style={{ height: `${toPct(levels[i])}%` }}
            />
            {live && <span className="absolute inset-x-0 h-0.5 bg-fg-2" style={{ bottom: `${toPct(peaks[i])}%` }} />}
          </div>
          <span className="text-[10px] leading-none text-fg-3">{ch}</span>
        </div>
      ))}
    </div>
  )
}
