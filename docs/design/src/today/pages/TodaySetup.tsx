// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Activity, Camera, Check, ChevronLeft, ChevronRight, Cpu, FolderOpen, LoaderCircle, type LucideIcon, Mic, Power, Radio, Sparkles, SquareTerminal } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Mascot, TatolabMark } from "@/components/brand/brand"
import { CodeBlock, CommandBlock } from "@/components/setup/CommandBlock"
import { StepHeading } from "@/components/setup/SetupSteps"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { thisMachine, todayRelays } from "../data"

const stepNames = ["Welcome", "Start the runtime", "Command line & agents", "First stream"]

function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center">
      <Mascot className="size-[140px]" />
      <h1 className="title-xl mt-5">Welcome to Tatolab</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-5 text-fg-2">Run live video, audio and AI streams on this Mac. You write a stream in Python; the runtime runs it.</p>
    </div>
  )
}

type CheckState = "waiting" | "checking" | "done" | "needs-allow"

interface RuntimeCheck {
  id: string
  icon: LucideIcon
  label: string
  detail: string
  allow?: boolean
}

const localRelays = todayRelays.filter((r) => r.adapter === "local")

const runtimeChecks: RuntimeCheck[] = [
  { id: "service", icon: Power, label: "Runtime installed", detail: "tatolabd · a login service, so it starts with this Mac" },
  { id: "runtime", icon: Activity, label: "Runtime started", detail: `tatolabd ${thisMachine.runtimeVersion} · local API socket ready` },
  {
    id: "relay",
    icon: Radio,
    label: "Local relay listeners joined",
    detail: localRelays.map((r) => `${r.relayId} :${r.settings.port}`).join(" · "),
  },
  { id: "gpu", icon: Cpu, label: "GPU found", detail: "Apple M4 Max · 40-core GPU · Metal" },
  { id: "camera", icon: Camera, label: "Camera access", detail: "FaceTime HD Camera, Studio Display Camera", allow: true },
  { id: "mic", icon: Mic, label: "Microphone access", detail: "Shure MV7+, MacBook Pro Microphone", allow: true },
]

function RuntimeStep() {
  const [tick, setTick] = useState(0)
  const [allowed, setAllowed] = useState<Set<string>>(new Set())
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t >= runtimeChecks.length * 2 ? t : t + 1)), 300)
    return () => window.clearInterval(id)
  }, [])
  const stateOf = (row: RuntimeCheck, i: number): CheckState => {
    if (tick < i * 2) return "waiting"
    if (tick < i * 2 + 2) return "checking"
    if (row.allow && !allowed.has(row.id)) return "needs-allow"
    return "done"
  }
  return (
    <>
      <StepHeading title="Start the runtime" lead="tatolabd runs your streams in the background, even when this window is closed. Always-on streams come back with it." />
      <div className="overflow-hidden rounded-lg border">
        {runtimeChecks.map((row, i) => {
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
      <p className="mt-3 text-xs text-fg-3">Streams use the camera and microphone through the runtime, so macOS asks once, here.</p>
    </>
  )
}

const mcpConfig = `{
  "mcpServers": {
    "tatolab": {
      "command": "tatolab",
      "args": ["mcp"]
    }
  }
}`

function CommandLineStep() {
  const [agent, setAgent] = useState<"claude" | "cursor">("claude")
  return (
    <>
      <StepHeading title="Command line & agents" lead="Everything this app does is also a tatolab command, for your terminal, your scripts and your coding agent." />
      <div className="overflow-hidden rounded-lg border">
        <div className="flex h-14 items-center gap-3 px-4">
          <SquareTerminal className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <div className="text-fg">
              <span className="font-mono text-[13px]">tatolab</span> is installed
            </div>
            <div className="truncate font-mono text-xs text-fg-3">/opt/homebrew/bin/tatolab · {thisMachine.runtimeVersion}</div>
          </div>
          <Check className="size-4 text-fg-2" strokeWidth={2} />
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-3">
        It came with the app: <span className="font-mono text-fg-2">brew install --cask tatolab/tap/tatolab</span> includes it. Try:
      </p>
      <CommandBlock command="tatolab streams" className="mt-2" />

      <div className="mt-8">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-fg">Connect a coding agent</h2>
            <p className="text-xs text-fg-3">
              <span className="font-mono text-fg-2">tatolab mcp</span> serves this runtime to your agent over stdio: streams, graphs and logs.
            </p>
          </div>
          <Segmented
            value={agent}
            onChange={setAgent}
            options={[
              { id: "claude", label: "Claude Code" },
              { id: "cursor", label: "Cursor" },
            ]}
          />
        </div>
        <CodeBlock code={mcpConfig} language="json" caption={agent === "claude" ? ".mcp.json" : ".cursor/mcp.json"} className="mt-3" />
      </div>
    </>
  )
}

const firstStreamChoices: { id: "sample" | "folder"; icon: LucideIcon; title: string; body: string }[] = [
  { id: "sample", icon: Sparkles, title: "Create the sample stream", body: "A test pattern you can edit, in ~/streams/hello. Runs Always on." },
  { id: "folder", icon: FolderOpen, title: "Open a project folder", body: "A folder with a stream.py and its own .venv." },
]

function FirstStreamStep({ choice, onChoice }: { choice: "sample" | "folder"; onChoice: (id: "sample" | "folder") => void }) {
  return (
    <>
      <StepHeading title="Your first stream" lead="A stream is a Python project. Its stream.py wires nodes together; the runtime compiles it and runs it." />
      <div className="overflow-hidden rounded-lg border">
        {firstStreamChoices.map((s) => {
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
      {choice === "sample" && (
        <>
          <p className="mt-4 mb-2 text-xs text-fg-3">The app runs this, then keeps the stream running Always on:</p>
          <CommandBlock command="tatolab new ~/streams/hello" />
        </>
      )}
    </>
  )
}

export default function TodaySetup() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<"sample" | "folder">("sample")
  const total = stepNames.length
  const step = Math.min(total, Math.max(1, Number(params.get("step")) || 1))
  const go = (n: number) => setParams({ step: String(n) })
  const last = step === total
  const finish = () => navigate(choice === "sample" ? "/new?source=new&step=compiling" : "/new")

  return (
    <div className="flex h-screen flex-col bg-window text-fg">
      <header className="no-drag flex h-11 shrink-0 items-center gap-2.5 border-b px-4">
        <TatolabMark className="text-fg" />
        <span className="font-medium">Set up Tatolab</span>
        {step > 1 && (
          <span className="text-fg-3">
            Step {step} of {total} · {stepNames[step - 1]}
          </span>
        )}
        <Link to="/" className="ml-auto text-fg-3 hover:text-fg">
          Skip for now
        </Link>
      </header>
      <div className="h-0.5 shrink-0 bg-line">
        <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${(step / total) * 100}%` }} />
      </div>

      <main className="scrollbar-thin flex min-h-0 flex-1 overflow-y-auto">
        <div className={step === 1 ? "m-auto w-[560px] py-10" : "mx-auto w-[560px] pt-[10vh] pb-10"}>
          {step === 1 && <WelcomeStep />}
          {step === 2 && <RuntimeStep />}
          {step === 3 && <CommandLineStep />}
          {step === 4 && <FirstStreamStep choice={choice} onChoice={setChoice} />}
        </div>
      </main>

      <footer className="shrink-0 border-t bg-chrome">
        <div className="mx-auto flex h-14 w-[560px] items-center gap-2">
          {step > 1 ? (
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2.5 text-[13px] text-fg-2" onClick={() => go(step - 1)}>
              <ChevronLeft className="size-3.5" /> Back
            </Button>
          ) : (
            <span className="text-fg-3">Takes about a minute.</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" className="h-8 px-4 text-[13px]" onClick={() => (last ? finish() : go(step + 1))}>
              {step === 1 ? "Get started" : last ? (choice === "sample" ? "Create and run" : "Choose folder") : "Continue"}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
