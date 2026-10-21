// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { IconButton, KeyValue } from "@/components/stream/primitives"
import { machineById, type StreamSpec } from "@/data/mock"
import { environmentFor, packagesFor, venvPath } from "./model"

function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={`inspect-${id}`} className="scroll-mt-4 border-b px-5 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="font-medium">{title}</h2>
        {aside && <span className="text-xs text-fg-3">{aside}</span>}
      </div>
      <div className="max-w-[860px]">{children}</div>
    </section>
  )
}

const sourceLabel = { runtime: "Set by tatolabd", project: "stream.py", machine: "Machine" } as const

export function EnvironmentView({ stream }: { stream: StreamSpec }) {
  const machine = machineById(stream.machine)!
  const vars = environmentFor(stream)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const mono = (s: string) => <span className="font-mono text-xs">{s}</span>
  return (
    <div>
        <Section id="runtime" title="Runtime">
          <KeyValue
            className="grid-cols-[132px_minmax(0,1fr)]"
            rows={[
              ["Runtime", mono(`tatolabd ${machine.runtimeVersion}`)],
              ["Machine", mono(machine.address)],
              ["Operating system", machine.os],
              ["GPU", machine.gpu],
              ["Python steps", "Each in its own process, one interpreter per step"],
            ]}
          />
        </Section>
        <Section id="python" title="Python">
          <KeyValue
            className="grid-cols-[132px_minmax(0,1fr)]"
            rows={[
              ["Version", <span className="tabular">{stream.python}</span>],
              ["Interpreter", mono(`${venvPath(stream)}/bin/python${stream.python}`)],
              ["Virtual env", mono(venvPath(stream))],
              ["Lockfile", mono(`${stream.project}/uv.lock`)],
              ["Entry", mono(`${stream.project}/${stream.entry}`)],
            ]}
          />
        </Section>
        <Section id="variables" title="Variables" aside={`${vars.length} set for every step's process`}>
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[38%]" />
              <col />
              <col className="w-[132px]" />
              <col className="w-8" />
            </colgroup>
            <thead>
              <tr className="border-b text-xs text-fg-3">
                <th className="h-7 font-normal">Name</th>
                <th className="px-3 font-normal">Value</th>
                <th className="px-3 font-normal">Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vars.map((v) => {
                const shown = !v.secret || revealed.has(v.name)
                return (
                  <tr key={v.name} className="h-8 border-b last:border-b-0">
                    <td className="truncate font-mono text-xs text-fg">{v.name}</td>
                    <td className="truncate px-3 font-mono text-xs text-fg-2" title={shown ? v.value : undefined}>
                      {shown ? v.value : <span className="font-sans text-fg-3 italic">hidden</span>}
                    </td>
                    <td className="truncate px-3 text-xs text-fg-3">{v.secret ? "Machine secret" : sourceLabel[v.source]}</td>
                    <td>
                      {v.secret && (
                        <IconButton
                          icon={shown ? EyeOff : Eye}
                          label={shown ? "Hide" : "Reveal"}
                          className="size-6"
                          onClick={() =>
                            setRevealed((prev) => {
                              const next = new Set(prev)
                              if (next.has(v.name)) next.delete(v.name)
                              else next.add(v.name)
                              return next
                            })
                          }
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
        <Section id="packages" title="Packages" aside="from uv.lock">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 sm:max-w-md">
            {packagesFor(stream).map(([name, version]) => (
              <div key={name} className="contents">
                <span className="truncate font-mono text-xs text-fg">{name}</span>
                <span className="text-right font-mono text-xs text-fg-3">{version}</span>
              </div>
            ))}
          </div>
        </Section>
    </div>
  )
}

export const environmentSections = [
  { id: "runtime", label: "Runtime" },
  { id: "python", label: "Python" },
  { id: "variables", label: "Variables" },
  { id: "packages", label: "Packages" },
]
