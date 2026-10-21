// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { File, FolderOpen, LayoutTemplate, type LucideIcon, Radio } from "lucide-react"
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FolderPanel, publicOutputs, RelayPanel, TemplateGrid } from "@/components/newstream/SourcePanels"
import { CommandBlock } from "@/components/setup/CommandBlock"
import { SettingsSelect } from "@/components/settings/SettingsForm"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { machines, templates } from "@/data/mock"
import { machineKindIcon } from "@/lib/vocab"

type Mode = "template" | "folder" | "relay" | "blank"

const sources: { id: Mode; label: string; icon: LucideIcon; lead: string }[] = [
  { id: "template", label: "Templates", icon: LayoutTemplate, lead: "A working stream.py you can run now and change after." },
  { id: "folder", label: "Open folder", icon: FolderOpen, lead: "Run a project that already has a stream.py." },
  { id: "relay", label: "Read from relay", icon: Radio, lead: "Start from another machine's public output." },
  { id: "blank", label: "Blank", icon: File, lead: "An empty stream.py with one test pattern node." },
]

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-4 py-2.5">
      <div className="pt-1 text-fg-2">{label}</div>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-1 text-xs text-fg-3">{hint}</div>}
      </div>
    </div>
  )
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "my-stream"

export default function NewStream() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const mode = (sources.find((s) => s.id === params.get("mode"))?.id ?? "template") as Mode
  const source = sources.find((s) => s.id === mode)!
  const [template, setTemplate] = useState("detect")
  const [folder, setFolder] = useState("~/code/porch-cam")
  const [output, setOutput] = useState(publicOutputs[0]?.address ?? "")
  const [names, setNames] = useState<Record<Mode, string>>({ template: "front-door", folder: "", relay: "lobby-view", blank: "my-stream" })
  const name = names[mode]
  const setName = (v: string) => setNames((n) => ({ ...n, [mode]: v }))
  const [machine, setMachine] = useState("studio-mac")
  const [runMode, setRunMode] = useState<"always-on" | "manual">("always-on")
  const id = slug(mode === "folder" ? folder.split("/").pop() ?? name : name)
  const machineFlag = machine !== "studio-mac" ? ` --machine ${machine}` : ""
  const command =
    mode === "template"
      ? `tatolab new ${id} --template ${template}${machineFlag}`
      : mode === "folder"
        ? `tatolab run ${folder}${machineFlag}`
        : mode === "relay"
          ? `tatolab new ${id} --from ${output}${machineFlag}`
          : `tatolab new ${id}${machineFlag}`
  const chosenTemplate = templates.find((t) => t.id === template)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r bg-chrome">
          <div className="px-4 pt-5 pb-2">
            <h1 className="title-lg">New stream</h1>
          </div>
          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Start from</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {sources.map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton isActive={s.id === mode} onClick={() => setParams({ mode: s.id })} className="h-7 data-active:font-normal">
                      <s.icon strokeWidth={1.75} className="text-fg-3" />
                      <span>{s.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </aside>

        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[860px] px-8 pt-5 pb-10">
            <div className="mb-4">
              <h2 className="text-[15px] leading-5 font-semibold">{source.label}</h2>
              <p className="text-fg-3">{source.lead}</p>
            </div>
            {mode === "template" && <TemplateGrid selected={template} onSelect={setTemplate} />}
            {mode === "folder" && <FolderPanel selected={folder} onSelect={setFolder} />}
            {mode === "relay" && <RelayPanel selected={output} onSelect={setOutput} />}

            <div className="mt-8">
              <div className="label-caps mb-1">Configuration</div>
              <div className="divide-y border-y">
                {mode !== "folder" && (
                  <Field label="Name" hint={<span className="font-mono">{`${machine}/${id}/<node>/<port>`}</span>}>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-full max-w-sm rounded-md border bg-window px-2.5 outline-none focus:border-brand" />
                  </Field>
                )}
                {mode !== "folder" && (
                  <Field label="Location">
                    <div className="flex max-w-sm items-center gap-2">
                      <span className="flex h-7 min-w-0 flex-1 items-center rounded-md border bg-well px-2.5 font-mono text-xs text-fg-2">~/streams/{id}</span>
                      <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]">
                        Change…
                      </Button>
                    </div>
                  </Field>
                )}
                <Field label="Machine" hint={machine === "studio-mac" ? "This Mac." : "The project is copied to the machine and runs there."}>
                  <div className="max-w-sm">
                    <MachineSelect value={machine} onChange={setMachine} />
                  </div>
                </Field>
                <Field label="Run mode" hint={runMode === "always-on" ? "Starts with the runtime and restarts if it exits." : "Runs only when you start it."}>
                  <Segmented
                    className="w-fit"
                    value={runMode}
                    onChange={setRunMode}
                    options={[
                      { id: "always-on", label: "Always on" },
                      { id: "manual", label: "Manual" },
                    ]}
                  />
                </Field>
                {mode !== "folder" && (
                  <Field label="Python">
                    <SettingsSelect value="3.12" options={["3.13", "3.12", "3.11"]} className="min-w-28" />
                  </Field>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="flex h-14 shrink-0 items-center gap-3 border-t bg-chrome px-5">
        <CommandBlock command={command} className="h-8 w-[min(560px,55%)]" />
        <span className="truncate text-xs text-fg-3">
          {mode === "template" && chosenTemplate ? `${chosenTemplate.title} · ${chosenTemplate.steps} steps` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-7 px-3 text-[13px]" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 px-3 text-[13px]" onClick={() => navigate("/")}>
            {mode === "folder" ? "Open and run" : "Create stream"}
          </Button>
        </div>
      </footer>
    </div>
  )
}

function MachineSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger size="sm" className="h-7 w-full rounded-md font-mono text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {machines.map((m) => {
          const MIcon = machineKindIcon[m.kind]
          return (
            <SelectItem key={m.id} value={m.id} disabled={m.status === "offline"} className="text-[13px]">
              <MIcon className="text-fg-3" strokeWidth={1.75} />
              <span className="font-mono text-xs">{m.name}</span>
              <span className="text-fg-3">{m.isThisMachine ? "This Mac" : m.status === "offline" ? "Offline" : m.location.split(",")[0]}</span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
