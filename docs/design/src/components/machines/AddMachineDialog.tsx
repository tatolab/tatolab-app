// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import { CommandBlock } from "@/components/setup/CommandBlock"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

type Platform = "mac" | "linux" | "jetson" | "set-top" | "container"

const platforms: { id: Platform; label: string; install: string; note: string }[] = [
  { id: "mac", label: "macOS", install: "brew install --cask tatolab/tap/tatolab", note: "Apple silicon, macOS 15 or later." },
  { id: "linux", label: "Linux", install: "curl -fsSL https://get.tatolab.com/install.sh | sh", note: "x86_64 or arm64 with a Vulkan 1.3 driver." },
  { id: "jetson", label: "Jetson", install: "curl -fsSL https://get.tatolab.com/install.sh | sh", note: "Detects JetPack and installs the CUDA build." },
  { id: "set-top", label: "Set-top", install: "curl -fsSL https://get.tatolab.com/install.sh | sh -s -- --tv", note: "Or flash Tatolab OS. The TV shows this code on its pairing screen." },
  { id: "container", label: "Container", install: "docker run -d --gpus all ghcr.io/tatolab/tatolabd:0.46.0", note: "Runs headless. Pass --device for cameras." },
]

const pairingCode = "TATO-4F2K"

function StepNumber({ n }: { n: number }) {
  return <span className="grid size-5 shrink-0 place-items-center rounded-[4px] border border-line-strong text-xs font-medium text-fg-2 tabular">{n}</span>
}

export function AddMachineDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [platform, setPlatform] = useState<Platform>("linux")
  const current = platforms.find((p) => p.id === platform)!
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={false} className="gap-0 overflow-hidden p-0 sm:max-w-[540px]">
        <div className="px-5 pt-4 pb-4">
          <DialogTitle className="text-[15px] leading-5 font-semibold">Add a machine</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-fg-3">
            Install the runtime on the machine, then pair it. It joins your tailnet and the Local relay.
          </DialogDescription>
          <Segmented className="mt-4 w-fit dark:bg-white/[0.06]" value={platform} onChange={setPlatform} options={platforms.map((p) => ({ id: p.id, label: p.label }))} />
        </div>

        <div className="flex flex-col gap-5 border-t px-5 py-5">
          <section className="flex gap-3">
            <StepNumber n={1} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Install the runtime</div>
              <p className="mb-2.5 text-xs text-fg-3">{current.note}</p>
              <CommandBlock command={current.install} />
            </div>
          </section>
          <section className="flex gap-3">
            <StepNumber n={2} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{platform === "set-top" ? "Check the code on the TV" : "Pair it with this code"}</div>
              <p className="mb-2.5 text-xs text-fg-3">
                {platform === "set-top" ? "The TV shows the same code once the runtime starts." : "Run this on the machine. The code expires in 10 minutes."}
              </p>
              <div className="flex items-center gap-4 rounded-md border px-4 py-3">
                <span className="font-mono text-[20px] leading-[26px] font-medium tracking-[0.18em] text-fg">{pairingCode}</span>
                <span className="ml-auto text-xs text-fg-3">expires 21:24</span>
              </div>
              {platform !== "set-top" && <CommandBlock className="mt-2" command={`tatolab pair ${pairingCode}`} />}
            </div>
          </section>
        </div>

        <div className="flex items-center gap-2 border-t bg-chrome px-5 py-3">
          <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} />
          <span className="text-fg-2">Waiting for the machine…</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
