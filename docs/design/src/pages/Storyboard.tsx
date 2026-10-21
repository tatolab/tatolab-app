// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowRight, ExternalLink, ImageOff, Moon, Sun } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import manifest from "@/storyboard/frames.json"

interface Frame {
  id: string
  title: string
  route: string
  caption: string
  dark?: boolean
  viewport?: number[]
}
interface Flow {
  id: string
  edition: "today" | "direction"
  title: string
  summary: string
  frames: Frame[]
}

const allFlows = manifest.flows as Flow[]

const editionCopy = {
  today: "What the app can be with the runtime as it ships today: one machine, streams, graph, logs, outputs and relays.",
  direction: "The long-term direction: machines, stats, a library, relay setups, TV mode.",
}

function liveRoute(frame: Frame) {
  return `${frame.route}${frame.route.includes("?") ? "&" : "?"}theme=${frame.dark ? "dark" : "light"}`
}

function FrameImage({ frame, className }: { frame: Frame; className?: string }) {
  const [missing, setMissing] = useState(false)
  const wide = frame.viewport && frame.viewport[0] / frame.viewport[1] > 1.7
  if (missing) {
    return (
      <div className={cn("grid place-items-center bg-well", wide ? "aspect-video" : "aspect-[16/10]", className)}>
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          <ImageOff className="size-3.5" /> Run <span className="font-mono">pnpm storyboard</span>
        </span>
      </div>
    )
  }
  return (
    <img
      src={`/storyboard/${frame.id}.jpg`}
      alt={frame.title}
      loading="lazy"
      onError={() => setMissing(true)}
      className={cn("block w-full object-cover object-top", wide ? "aspect-video" : "aspect-[16/10]", className)}
    />
  )
}

export default function Storyboard() {
  const [open, setOpen] = useState<Frame | null>(null)
  const [params, setParams] = useSearchParams()
  const edition = params.get("edition") === "direction" ? "direction" : "today"
  const flows = allFlows.filter((f) => f.edition === edition)
  const total = flows.reduce((n, f) => n + f.frames.length, 0)
  return (
    <div className="min-h-full">
      <div className="flex items-end gap-6 border-b px-5 pt-5 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="title-lg">Storyboard</h1>
            <Segmented
              value={edition}
              onChange={(e) => setParams(e === "today" ? {} : { edition: e })}
              options={[
                { id: "today", label: "Today", count: allFlows.filter((f) => f.edition === "today").reduce((n, f) => n + f.frames.length, 0) },
                { id: "direction", label: "Direction", count: allFlows.filter((f) => f.edition === "direction").reduce((n, f) => n + f.frames.length, 0) },
              ]}
            />
          </div>
          <p className="mt-1 text-fg-3">
            {editionCopy[edition]} {flows.length} flows · {total} frames. Cite a frame by its file name in a ticket.
          </p>
        </div>
        <nav className="ml-auto flex flex-wrap justify-end gap-1">
          {flows.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-fg-2 hover:bg-hover hover:text-fg">
              {f.title}
              <span className="text-fg-3 tabular">{f.frames.length}</span>
            </a>
          ))}
        </nav>
      </div>

      {flows.map((flow, fi) => (
        <section key={flow.id} id={flow.id} className="scroll-mt-2 border-b py-6 last:border-b-0">
          <div className="flex items-baseline gap-3 px-5">
            <span className="font-mono text-xs text-fg-3">{String(fi + 1).padStart(2, "0")}</span>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{flow.title}</h2>
            <p className="text-fg-3">{flow.summary}</p>
          </div>
          <div className="scrollbar-thin mt-4 overflow-x-auto px-5 pb-2">
            <div className="flex items-start gap-2">
              {flow.frames.map((frame, i) => (
                <div key={frame.id} className="flex items-start gap-2">
                  {i > 0 && <ArrowRight className="mt-[84px] size-3.5 shrink-0 text-fg-4" />}
                  <button onClick={() => setOpen(frame)} className="group w-[288px] shrink-0 text-left">
                    <div className="overflow-hidden rounded-md ring-1 ring-line transition-shadow group-hover:ring-line-strong">
                      <FrameImage frame={frame} />
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="font-medium">{frame.title}</span>
                      {frame.dark ? <Moon className="size-3 text-fg-4" /> : <Sun className="size-3 text-fg-4" />}
                      <span className="ml-auto font-mono text-[11px] text-fg-4">{frame.id}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-4 text-fg-3">{frame.caption}</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[min(1280px,94vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1280px,94vw)]">
          {open && (
            <>
              <FrameImage frame={open} className="aspect-auto" />
              <div className="flex items-center gap-4 border-t p-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-[14px]">{open.title}</DialogTitle>
                  <DialogDescription className="text-fg-3">{open.caption}</DialogDescription>
                </div>
                <span className="font-mono text-xs text-fg-3">{open.id}.jpg</span>
                <Button size="sm" className="h-7 text-[13px]" nativeButton={false} render={<a href={liveRoute(open)} />}>
                  Open live <ExternalLink className="size-3.5" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
