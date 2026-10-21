// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Activity, Camera, Check, ChevronRight, Cpu, FolderOpen, Info, LayoutTemplate, LoaderCircle, type LucideIcon, Mic, Radio } from "lucide-react"
import { useEffect, useState } from "react"
import { Mascot } from "@/components/brand/brand"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { CommandBlock } from "./CommandBlock"

export function StepHeading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="mb-7">
      <h1 className="title-xl">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-5 text-fg-2">{lead}</p>
    </div>
  )
}

export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center">
      <Mascot className="size-[140px]" />
      <h1 className="title-xl mt-5">Welcome to Tatolab</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-5 text-fg-2">Run live video, audio and AI streams on this Mac, and on every machine beside a camera or behind a screen.</p>
    </div>
  )
}

type CheckState = "waiting" | "checking" | "done" | "needs-allow"

interface CheckRow {
  id: string
  icon: LucideIcon
  label: string
  detail: string
  allow?: boolean
}

const checks: CheckRow[] = [
  { id: "runtime", icon: Activity, label: "Runtime started", detail: "tatolabd 0.46.0 · pid 4121" },
  { id: "gpu", icon: Cpu, label: "GPU found", detail: "Apple M4 Max · 40-core GPU · Metal 4" },
  { id: "camera", icon: Camera, label: "Camera access", detail: "FaceTime HD Camera, Studio Display Camera", allow: true },
  { id: "mic", icon: Mic, label: "Microphone access", detail: "Shure MV7+, MacBook Pro Microphone", allow: true },
  { id: "relay", icon: Radio, label: "Local relay", detail: "moq://localhost:4443" },
]

export function RuntimeCheckStep() {
  const [tick, setTick] = useState(0)
  const [allowed, setAllowed] = useState<Set<string>>(new Set())
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t >= 10 ? t : t + 1)), 450)
    return () => window.clearInterval(id)
  }, [])
  const stateOf = (row: CheckRow, i: number): CheckState => {
    const reached = tick >= i * 2
    if (!reached) return "waiting"
    if (tick < i * 2 + 2) return "checking"
    if (row.allow && !allowed.has(row.id)) return "needs-allow"
    return "done"
  }
  return (
    <>
      <StepHeading title="Checking this Mac" lead="The runtime runs your streams in the background, even when this window is closed." />
      <div className="overflow-hidden rounded-lg border">
        {checks.map((row, i) => {
          const state = stateOf(row, i)
          return (
            <div key={row.id} className="flex h-14 items-center gap-3 border-b px-4 last:border-b-0">
              <row.icon className={cn("size-4 shrink-0", state === "waiting" ? "text-fg-4" : "text-fg-3")} strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className={state === "waiting" ? "text-fg-3" : "text-fg"}>{row.label}</div>
                <div className="truncate font-mono text-xs text-fg-3">{state === "done" || state === "needs-allow" ? row.detail : state === "checking" ? "Checking…" : "Waiting"}</div>
              </div>
              {state === "checking" && <LoaderCircle className="size-4 animate-spin text-fg-3" strokeWidth={1.75} />}
              {state === "done" && <Check className="size-4 text-fg-2" strokeWidth={2} />}
              {state === "needs-allow" && (
                <Button size="sm" className="h-7 px-3 text-[13px]" onClick={() => setAllowed((s) => new Set(s).add(row.id))}>
                  Allow
                </Button>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-fg-3">You can change access later in Settings → Devices & permissions.</p>
    </>
  )
}

export function MachineStep() {
  const [name, setName] = useState("studio-mac")
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "this-mac"
  return (
    <>
      <StepHeading title="Name this machine" lead="Every output on this Mac is addressed by this name, by you, your scripts and other machines." />
      <label className="flex flex-col gap-1.5">
        <span className="text-fg-2">Machine name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 rounded-md border bg-window px-3 font-mono text-[15px] outline-none focus:border-brand focus:ring-3 focus:ring-ring/30"
        />
      </label>
      <div className="mt-3 rounded-md border bg-well px-3 py-2.5">
        <div className="text-xs text-fg-3">Outputs are read at</div>
        <div className="mt-0.5 font-mono text-[13px] text-fg">
          {clean}
          <span className="text-fg-3">/&lt;stream&gt;/&lt;node&gt;/&lt;port&gt;</span>
        </div>
        <div className="mt-1 font-mono text-xs text-fg-3">e.g. {clean}/front-door/camera/video</div>
      </div>
      <div className="mt-5 flex gap-3 rounded-md border px-3.5 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
        <div>
          <div className="text-fg">Tailscale is running</div>
          <p className="text-xs text-fg-3">
            Your other machines on <span className="font-mono">tail3e9f.ts.net</span> will reach this one at <span className="font-mono text-fg-2">{clean}.tail3e9f.ts.net</span>. Nothing leaves your tailnet unless you add a relay.
          </p>
        </div>
      </div>
    </>
  )
}

export function CliStep() {
  const [mcp, setMcp] = useState(true)
  const [agent, setAgent] = useState<"claude" | "cursor" | "codex">("claude")
  const configPath = { claude: "~/.claude.json", cursor: "~/.cursor/mcp.json", codex: "~/.codex/config.toml" }[agent]
  return (
    <>
      <StepHeading title="Install the command line" lead="tatolab new, run, dev, logs and tap. Everything in this app is also a command." />
      <CommandBlock command="brew install --cask tatolab/tap/tatolab" />
      <p className="mt-2 text-xs text-fg-3">
        Without Homebrew: <span className="font-mono text-fg-2">curl -fsSL https://get.tatolab.com/install.sh | sh</span>
      </p>

      <div className="mt-8 overflow-hidden rounded-lg border">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-fg">Connect your coding agent</div>
            <p className="text-xs text-fg-3">Adds the Tatolab MCP server, so your agent can list streams, read logs, tap ports and restart nodes.</p>
          </div>
          <Switch checked={mcp} onCheckedChange={setMcp} />
        </div>
        {mcp && (
          <div className="flex items-center gap-3 border-t px-4 py-3">
            <Segmented
              value={agent}
              onChange={setAgent}
              options={[
                { id: "claude", label: "Claude Code" },
                { id: "cursor", label: "Cursor" },
                { id: "codex", label: "Codex" },
              ]}
            />
            <span className="ml-auto font-mono text-xs text-fg-3">writes {configPath}</span>
          </div>
        )}
      </div>
    </>
  )
}

const starts: { id: string; icon: LucideIcon; title: string; body: string }[] = [
  { id: "template", icon: LayoutTemplate, title: "Start from a template", body: "Camera + effect, spot people, go live, podcast mic." },
  { id: "folder", icon: FolderOpen, title: "Open a folder with stream.py", body: "Run a project you already have." },
  { id: "relay", icon: Radio, title: "Read from a relay", body: "Watch and process a broadcast another machine publishes." },
]

export function FirstStreamStep({ choice, onChoice }: { choice: string; onChoice: (id: string) => void }) {
  return (
    <>
      <StepHeading title="Create your first stream" lead="A stream is a Python project. Its stream.py wires nodes together; the runtime runs it." />
      <div className="overflow-hidden rounded-lg border">
        {starts.map((s) => {
          const active = choice === s.id
          return (
            <button
              key={s.id}
              onClick={() => onChoice(s.id)}
              className={cn("flex h-16 w-full items-center gap-3.5 border-b px-4 text-left transition-colors last:border-b-0 hover:bg-hover", active && "bg-selected hover:bg-selected")}
            >
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border bg-raised", active && "border-brand")}>
                <s.icon className={cn("size-4", active ? "text-brand-text" : "text-fg-2")} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-fg">{s.title}</span>
                <span className="block truncate text-xs text-fg-3">{s.body}</span>
              </span>
              {active ? <Check className="size-4 text-brand-text" strokeWidth={2} /> : <ChevronRight className="size-4 text-fg-4" strokeWidth={1.75} />}
            </button>
          )
        })}
      </div>
    </>
  )
}
