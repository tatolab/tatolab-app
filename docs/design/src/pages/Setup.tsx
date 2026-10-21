// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronLeft } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { TatolabMark } from "@/components/brand/brand"
import { CliStep, FirstStreamStep, MachineStep, RuntimeCheckStep, WelcomeStep } from "@/components/setup/SetupSteps"
import { Button } from "@/components/ui/button"

const stepNames = ["Welcome", "Runtime check", "This machine", "Command line", "First stream"]

export default function Setup() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [choice, setChoice] = useState("template")
  const step = Math.min(5, Math.max(1, Number(params.get("step")) || 1))
  const go = (n: number) => setParams({ step: String(n) })
  const last = step === 5

  return (
    <div className="flex h-screen flex-col bg-window text-fg">
      <header className="no-drag flex h-11 shrink-0 items-center gap-2.5 border-b px-4">
        <TatolabMark className="text-fg" />
        <span className="font-medium">Set up Tatolab</span>
        {step > 1 && (
          <span className="text-fg-3">
            Step {step} of 5 · {stepNames[step - 1]}
          </span>
        )}
        <Link to="/" className="ml-auto text-fg-3 hover:text-fg">
          Skip for now
        </Link>
      </header>
      <div className="h-0.5 shrink-0 bg-line">
        <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${(step / 5) * 100}%` }} />
      </div>

      <main className="scrollbar-thin flex min-h-0 flex-1 overflow-y-auto">
        <div className={step === 1 ? "m-auto w-[560px] py-10" : "mx-auto w-[560px] pt-[12vh] pb-10"}>
          {step === 1 && <WelcomeStep />}
          {step === 2 && <RuntimeCheckStep />}
          {step === 3 && <MachineStep />}
          {step === 4 && <CliStep />}
          {step === 5 && <FirstStreamStep choice={choice} onChoice={setChoice} />}
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
            {step === 4 && (
              <Button variant="ghost" size="sm" className="h-8 px-3 text-[13px] text-fg-2" onClick={() => go(5)}>
                Not now
              </Button>
            )}
            <Button size="sm" className="h-8 px-4 text-[13px]" onClick={() => (last ? navigate(`/new?mode=${choice}`) : go(step + 1))}>
              {step === 1 ? "Get started" : last ? "Finish" : "Continue"}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
