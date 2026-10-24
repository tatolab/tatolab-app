// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { FileCode2, FolderOpen, FolderPlus, LoaderCircle, type LucideIcon, Package, Workflow } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CommandBlock } from "@/components/setup/CommandBlock"
import { Preview } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { thisMachine, todayStreamById, todayStreams } from "../data"
import {
  AddStreamField,
  type CompileLine,
  CompileLog,
  CompileWarnings,
  ProjectChecks,
  ProjectFolderPicker,
  RunModeChoice,
  SampleProjectContents,
  StreamNameInput,
} from "../components/streams/AddStreamParts"

type Source = "folder" | "new"
type Step = "form" | "compiling" | "done"

const sources: { id: Source; label: string; icon: LucideIcon; lead: React.ReactNode }[] = [
  { id: "folder", label: "Run a project folder", icon: FolderOpen, lead: "A folder with a stream.py and its own .venv. The runtime compiles it there, then loads and starts it." },
  {
    id: "new",
    label: "Create a new project",
    icon: FolderPlus,
    lead: (
      <>
        <span className="font-mono text-xs">tatolab new</span> writes the sample stream into a new folder, then the app runs it Always on.
      </>
    ),
  },
]

const button = "h-7 gap-1.5 px-3 text-[13px]"

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "my-stream"

function folderLines(folder: string, name: string, fn: string, warnings: string[]): CompileLine[] {
  return [
    { at: "0.00", text: `run_stream ${folder}  name=${name}  keep=true`, tone: "muted" },
    { at: "0.02", text: `compiling stream.py in ${folder}/.venv/bin/python (3.12.7)` },
    { at: "0.58", text: `${fn}() built a graph: 4 nodes, 3 links` },
    { at: "0.63", text: "describing Python types: HeatFrame, ZoneCount" },
    ...warnings.map((w) => ({ at: "0.70", text: `warning: ${w}`, tone: "warn" as const })),
    { at: "0.74", text: `loading graph as ${name}#9` },
    { at: "0.91", text: "starting 4 steps: camera, heat_render, zone_counter, display" },
    { at: "1.36", text: `${name} is running; kept, so it loads again whenever the runtime starts` },
  ]
}

function newProjectLines(directory: string, name: string): CompileLine[] {
  return [
    { at: "0.00", text: `$ tatolab new ${directory}`, tone: "muted" },
    { at: "0.21", text: `wrote the sample stream to ${directory}: stream.py, nodes/` },
    { at: "0.22", text: `run_stream ${directory}  keep=true`, tone: "muted" },
    { at: "0.24", text: `compiling stream.py in ${directory}/.venv/bin/python (3.12.7)` },
    { at: "0.71", text: `${name.replace(/-/g, "_")}() built a graph: 2 nodes, 1 link` },
    { at: "0.77", text: `loading graph as ${name}#1` },
    { at: "0.88", text: "starting 2 steps: pattern, display" },
    { at: "1.14", text: `${name} is running; kept, so it loads again whenever the runtime starts` },
  ]
}

export default function TodayNewStream() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const source: Source = params.get("source") === "new" ? "new" : "folder"
  const step: Step = params.get("step") === "compiling" ? "compiling" : params.get("step") === "done" ? "done" : "form"
  const conflict = params.get("conflict") === "1"
  const venvMissing = params.get("venv") === "missing"

  const folder = conflict ? "~/code/front-door-v2" : "~/code/heat-map"
  const streamFunction = conflict ? "front_door" : "heat_map"
  // The runtime names a stream after its function, underscores kept; the conflict frame shows a name typed over it.
  const initialName = conflict ? "front-door" : streamFunction
  const [name, setName] = useState(initialName)
  useEffect(() => setName(initialName), [initialName])
  const heldBy = todayStreams.find((s) => s.id === name)?.project

  const [directory, setDirectory] = useState("~/streams/hello")
  const newName = slug(directory.split("/").pop() ?? "hello")

  const warnings = source === "folder" ? (todayStreamById("dock-4")?.compileWarnings ?? []) : []
  const runName = source === "folder" ? name : newName
  const lines = source === "folder" ? folderLines(folder, name, streamFunction, warnings) : newProjectLines(directory, newName)

  const go = (next: Partial<Record<"source" | "step", string>>) => {
    const p: Record<string, string> = { source, ...next }
    if (conflict) p.conflict = "1"
    if (venvMissing) p.venv = "missing"
    if (p.source === "folder") delete p.source
    if (p.step === "form") delete p.step
    setParams(p)
  }

  useEffect(() => {
    if (step !== "compiling") return
    const id = window.setTimeout(() => go({ step: "done" }), 2600)
    return () => window.clearTimeout(id)
  })

  const current = sources.find((s) => s.id === source)!
  const canRun = source === "new" || (!heldBy && !venvMissing && !!name)
  const command = `cd ${folder} && tatolab run -d`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r bg-chrome">
          <div className="px-4 pt-5 pb-2">
            <h1 className="title-lg">Add stream</h1>
          </div>
          <SidebarGroup className="py-1">
            <SidebarGroupLabel>Start from</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {sources.map((s) => (
                  <SidebarMenuItem key={s.id}>
                  <SidebarMenuButton
                    isActive={s.id === source}
                    disabled={step !== "form"}
                    onClick={() => go({ source: s.id, step: "form" })}
                    className="h-7 data-active:font-normal"
                  >
                    <s.icon strokeWidth={1.75} className="text-fg-3" />
                    <span>{s.label}</span>
                  </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <p className="mt-auto px-4 pb-4 text-xs text-fg-3">
            Streams run on this machine, <span className="font-mono">{thisMachine.name}</span>.
          </p>
        </aside>

        <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-8 pt-5 pb-10">
            {step === "form" && source === "folder" && (
              <>
                <div className="mb-4">
                  <h2 className="text-[15px] leading-5 font-semibold">{current.label}</h2>
                  <p className="text-fg-3">{current.lead}</p>
                </div>
                <div className="flex flex-col gap-3">
                  <ProjectFolderPicker path={folder} />
                  <ProjectChecks
                    checks={[
                      { icon: FileCode2, name: "stream.py", found: true, detail: `Stream function ${streamFunction}()` },
                      venvMissing
                        ? {
                            icon: Package,
                            name: ".venv",
                            found: false,
                            detail: "The stream compiles in the project's own .venv/bin/python.",
                            fix: "uv venv && uv pip install tatolab-stream",
                          }
                        : { icon: Package, name: ".venv", found: true, detail: "Python 3.12.7 · tatolab-stream 0.46.0" },
                    ]}
                  />
                </div>
                <div className="mt-8">
                  <div className="label-caps mb-1">Configuration</div>
                  <div className="divide-y border-y">
                    <AddStreamField label="Name" hint={heldBy ? undefined : <>From the stream function. One name per stream on this machine.</>}>
                      <StreamNameInput value={name} onChange={setName} heldBy={heldBy} suggestion={`${name}-2`} />
                    </AddStreamField>
                    <AddStreamField
                      label="Run mode"
                      hint={
                        <>
                          Kept by the runtime: it loads again whenever the runtime starts. A dev session that reloads on save runs from a terminal — <span className="font-mono">tatolab dev</span> in the project folder.
                        </>
                      }
                    >
                      <RunModeChoice />
                    </AddStreamField>
                  </div>
                </div>
              </>
            )}

            {step === "form" && source === "new" && (
              <>
                <div className="mb-4">
                  <h2 className="text-[15px] leading-5 font-semibold">{current.label}</h2>
                  <p className="text-fg-3">{current.lead}</p>
                </div>
                <div className="divide-y border-y">
                  <AddStreamField label="Directory" hint={<>Loads as <span className="font-mono">{newName}</span>. The folder must not exist yet.</>}>
                    <div className="flex max-w-md items-center gap-2">
                      <input
                        value={directory}
                        onChange={(e) => setDirectory(e.target.value)}
                        spellCheck={false}
                        className="h-7 min-w-0 flex-1 rounded-md border bg-window px-2.5 font-mono text-[13px] outline-none focus:border-brand"
                      />
                      <Button variant="outline" size="sm" className={button}>
                        Choose…
                      </Button>
                    </div>
                  </AddStreamField>
                  <AddStreamField label="Runs" hint="The app runs this for you, then compiles and starts the project.">
                    <CommandBlock command={`tatolab new ${directory}`} className="h-8 max-w-md" />
                  </AddStreamField>
                  <AddStreamField label="Run mode" hint="Kept by the runtime: it loads again whenever the runtime starts.">
                    <RunModeChoice />
                  </AddStreamField>
                </div>
                <div className="mt-8">
                  <div className="label-caps mb-1.5">What you get</div>
                  <SampleProjectContents directory={directory} />
                </div>
              </>
            )}

            {step === "compiling" && (
              <>
                <div className="mb-4">
                  <h2 className="text-[15px] leading-5 font-semibold">
                    {source === "new" ? "Creating" : "Compiling"} <span className="font-mono text-[14px]">{runName}</span>
                  </h2>
                  <p className="text-fg-3">
                    {source === "new" ? `tatolab new, then compiling stream.py in ${directory}` : `Compiling stream.py in ${folder}/.venv/bin/python`}
                  </p>
                </div>
                <CompileLog lines={lines} streaming title={source === "new" ? directory : folder} />
              </>
            )}

            {step === "done" && (
              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-5">
                  <Preview
                    scene={source === "new" ? "pattern" : "thermal"}
                    className="aspect-video w-[300px] shrink-0"
                    caption={`${runName}/${source === "new" ? "pattern" : "heat_render"}/video`}
                  />
                  <div className="min-w-0 pt-1">
                    <h2 className="title-lg">
                      <span className="font-mono text-[19px]">{runName}</span> is running
                    </h2>
                    <p className="mt-1 text-fg-3">
                      Always on · {source === "new" ? 2 : 4} steps · <span className="font-mono text-xs">{source === "new" ? directory : folder}</span>
                    </p>
                    <p className="mt-3 max-w-sm text-fg-2">
                      {warnings.length
                        ? "It compiled with a warning. Read it before you rely on this stream."
                        : "It compiled cleanly. Change stream.py and choose Reload to run it again."}
                    </p>
                  </div>
                </div>
                <CompileWarnings warnings={warnings} />
                <CompileLog lines={lines} streaming={false} title="Compile output" />
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="flex h-14 shrink-0 items-center gap-3 border-t bg-chrome px-5">
        {step === "form" && (
          <>
            {source === "folder" ? (
              <>
                <CommandBlock command={command} className="h-8 w-[min(460px,50%)]" />
                <span className="truncate text-xs text-fg-3">the same, from a terminal</span>
              </>
            ) : (
              <span className="truncate text-fg-3">
                Creates <span className="font-mono text-xs text-fg-2">{directory}</span>, then compiles and starts it.
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className={button} onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button size="sm" className={button} disabled={!canRun} onClick={() => go({ step: "compiling" })}>
                {source === "new" ? "Create and run" : "Compile and run"}
              </Button>
            </div>
          </>
        )}
        {step === "compiling" && (
          <>
            <span className="inline-flex items-center gap-2 text-fg-2">
              <LoaderCircle className="size-3.5 animate-spin text-fg-3" strokeWidth={1.75} />
              {source === "new" ? "Creating and compiling…" : "Compiling…"}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className={button} onClick={() => go({ step: "form" })}>
                Cancel
              </Button>
            </div>
          </>
        )}
        {step === "done" && (
          <>
            <Button variant="ghost" size="sm" className={`${button} text-fg-2`} onClick={() => go({ step: "form" })}>
              Add another
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className={button} onClick={() => navigate("/streams/dock-4/graph")}>
                <Workflow className="size-3.5" /> Open graph
              </Button>
              <Button size="sm" className={button} onClick={() => navigate("/streams/dock-4")}>
                Open stream
              </Button>
            </div>
          </>
        )}
      </footer>
    </div>
  )
}
