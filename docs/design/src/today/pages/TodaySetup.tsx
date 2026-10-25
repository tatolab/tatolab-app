// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, ChevronLeft, Hourglass, LoaderCircle, type LucideIcon, SquareX, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Mascot } from "@/components/brand/brand"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center text-center">
      <Mascot className="size-[140px]" />
      <h1 className="title-xl mt-5">Welcome to Tatolab</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-5 text-fg-2">
        Tatolab runs your live video, audio and AI streams in a runtime in the background. This window is where you see and control it.
      </p>
    </div>
  )
}

type StepProgress = "waiting" | "in_progress" | "done" | "needs_you" | "failed"

const progressIcons: Record<StepProgress, { icon: LucideIcon; className: string }> = {
  waiting: { icon: Hourglass, className: "text-fg-3" },
  in_progress: { icon: LoaderCircle, className: "animate-spin text-fg-3" },
  done: { icon: Check, className: "text-fg-2" },
  needs_you: { icon: TriangleAlert, className: "text-warn" },
  failed: { icon: SquareX, className: "text-danger" },
}

interface SetupStep {
  title: string
  progressWords: string
  explanation?: string
  progress: StepProgress
  action?: string
}

/** What macOS is doing with the runtime: starting it, done, waiting for the person's approval, or blocked. */
type RuntimeOnFirstRun = "starting" | "done" | "approval" | "blocked"

function stepsFor(runtime: RuntimeOnFirstRun): SetupStep[] {
  switch (runtime) {
    case "starting":
      return [{ title: "Start the runtime", progressWords: "Starting…", progress: "in_progress" }]
    case "done":
      return [{ title: "Start the runtime", progressWords: "Running", progress: "done" }]
    case "approval":
      return [
        { title: "Start the runtime", progressWords: "Starts once you approve it", progress: "waiting" },
        {
          title: "Needs your approval",
          progressWords: "Waiting for you",
          explanation: "macOS asks before the runtime runs in the background. In Login Items, turn on Tatolab under Allow in the Background.",
          progress: "needs_you",
          action: "Open Login Items…",
        },
      ]
    case "blocked":
      return [
        { title: "Start the runtime", progressWords: "Starts once macOS lets it", progress: "waiting" },
        {
          title: "Blocked by macOS",
          progressWords: "Stopped",
          explanation: "macOS stopped the runtime from starting and won't try again by itself. Try Again hands it to macOS afresh.",
          progress: "failed",
          action: "Try Again",
        },
      ]
  }
}

function GettingSetUpScreen({ runtime }: { runtime: RuntimeOnFirstRun }) {
  return (
    <>
      <h1 className="title-lg">Getting set up</h1>
      <p className="mt-1 mb-5 text-fg-2">The runtime starts in the background. Tatolab asks you for something only when macOS needs you.</p>
      <ol className="flex flex-col divide-y rounded-lg border">
        {stepsFor(runtime).map((step) => {
          const { icon: ProgressIcon, className } = progressIcons[step.progress]
          return (
            <li key={step.title} className="flex items-start gap-3 px-4 py-3">
              <ProgressIcon className={cn("mt-0.5 size-4 shrink-0", className)} strokeWidth={step.progress === "done" ? 2 : 1.75} />
              <div className="min-w-0 flex-1">
                <div className={step.progress === "waiting" ? "text-fg-3" : "text-fg"}>{step.title}</div>
                <div className={cn("text-xs", step.progress === "needs_you" ? "text-warn-text" : step.progress === "failed" ? "text-danger-text" : "text-fg-3")}>
                  {step.progressWords}
                </div>
                {step.explanation && <p className="mt-1 max-w-[52ch] text-xs text-fg-2">{step.explanation}</p>}
              </div>
              {step.action && (
                <Button size="sm" variant={step.progress === "needs_you" ? "default" : "outline"} className="h-7 px-3 text-[13px]">
                  {step.action}
                </Button>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

const runtimesOnFirstRun: RuntimeOnFirstRun[] = ["starting", "done", "approval", "blocked"]

export default function TodaySetup() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const step = params.get("step") === "2" ? 2 : 1
  const runtimeInTheQuery = runtimesOnFirstRun.find((runtime) => runtime === params.get("runtime"))
  const [runtime, setRuntime] = useState<RuntimeOnFirstRun>(runtimeInTheQuery ?? "starting")
  useEffect(() => {
    if (step !== 2 || runtimeInTheQuery !== undefined || runtime !== "starting") return
    const started = window.setTimeout(() => setRuntime("done"), 2400)
    return () => window.clearTimeout(started)
  }, [step, runtimeInTheQuery, runtime])

  return (
    <div className="flex h-screen flex-col bg-window text-fg">
      <div className="h-11 shrink-0" />
      <main className="scrollbar-thin flex min-h-0 flex-1 overflow-y-auto">
        <div className={step === 1 ? "m-auto w-[560px] py-10" : "mx-auto w-[560px] pt-[8vh] pb-10"}>
          {step === 1 ? <WelcomeScreen /> : <GettingSetUpScreen runtime={runtime} />}
        </div>
      </main>
      <footer className="shrink-0 border-t bg-chrome">
        <div className="mx-auto flex h-14 w-[560px] items-center gap-2">
          {step === 1 ? (
            <span className="text-fg-3">Takes about a minute.</span>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2.5 text-[13px] text-fg-2" onClick={() => setParams({ step: "1" })}>
                <ChevronLeft className="size-3.5" /> Back
              </Button>
              <span className="text-xs text-fg-3">{runtime === "done" ? "The runtime is running." : "Get Started opens once the runtime answers."}</span>
            </>
          )}
          <div className="ml-auto">
            {step === 1 ? (
              <Button size="sm" className="h-8 px-4 text-[13px]" onClick={() => setParams({ step: "2" })}>
                Continue
              </Button>
            ) : (
              <Button size="sm" className="h-8 px-4 text-[13px]" disabled={runtime !== "done"} onClick={() => navigate("/")}>
                Get Started
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
