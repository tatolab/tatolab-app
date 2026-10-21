// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Cpu, FolderOpen, Info, type LucideIcon, Paintbrush, RotateCw, SlidersHorizontal, SquareTerminal } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Mascot } from "@/components/brand/brand"
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsForm"
import { CodeBlock, CommandBlock } from "@/components/setup/CommandBlock"
import { useTheme } from "@/components/shell/theme"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import { thisMachine } from "../data"

const small = "h-7 gap-1.5 px-2.5 text-[13px]"

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs text-fg-2">{children}</span>
}

function GeneralSection() {
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Open Tatolab at login" description="The runtime starts at login either way; this opens the app too.">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Notifications">
        <SettingsRow label="When a stream fails" description="A notification with the reason the runtime gives, and a Retry button.">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="When an Always on stream is skipped at runtime start" description="It failed to load again, and stays stopped until you start it.">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [mode, setMode] = useState<"light" | "dark" | "system">(theme)
  const choose = (m: "light" | "dark" | "system") => {
    setMode(m)
    if (m === "system") setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    else setTheme(m)
  }
  return (
    <SettingsGroup>
      <SettingsRow label="Theme" description="Light is the default.">
        <Segmented
          value={mode}
          onChange={choose}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "system", label: "System" },
          ]}
        />
      </SettingsRow>
    </SettingsGroup>
  )
}

function RuntimeSection() {
  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label="Status"
          description={
            <span className="tabular">
              Running · tatolabd {thisMachine.runtimeVersion} · up {thisMachine.uptime}
            </span>
          }
        >
          <Button variant="outline" size="sm" className={small}>
            <RotateCw className="size-3.5" /> Restart runtime
          </Button>
        </SettingsRow>
        <SettingsRow label="Starts at login" description="Installed as a login service, so Always on streams load again after a restart.">
          <span className="text-fg-2">On</span>
        </SettingsRow>
        <SettingsRow label="Local API socket" description={<Mono>{thisMachine.socket}</Mono>} />
      </SettingsGroup>
      <SettingsGroup title="Logs">
        <SettingsRow label="Runtime logs" description="What tatolabd writes, and every stream's logs.">
          <Button variant="outline" size="sm" className={small}>
            <FolderOpen className="size-3.5" /> Open logs folder
          </Button>
        </SettingsRow>
      </SettingsGroup>
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

function CommandLineSection() {
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="tatolab" description={<Mono>/opt/homebrew/bin/tatolab</Mono>}>
          <Mono>{thisMachine.runtimeVersion}</Mono>
        </SettingsRow>
        <SettingsRow label="Installed with the app" description="The cask installs the app, the runtime and the command line together.">
          <Mono>brew install --cask tatolab/tap/tatolab</Mono>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Coding agents" description="The MCP server: it serves this runtime to a coding agent over stdio.">
        <div className="flex flex-col gap-3 px-4 py-3">
          <CommandBlock command="tatolab mcp" />
          <div>
            <p className="mb-2 text-xs text-fg-3">Add it to your agent's MCP config.</p>
            <CodeBlock code={mcpConfig} language="json" caption=".mcp.json" />
          </div>
        </div>
      </SettingsGroup>
    </>
  )
}

function AboutSection() {
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <Mascot className="size-[96px]" />
      <div className="mt-3 text-[20px] leading-[26px] font-semibold">Tatolab</div>
      <div className="text-fg-3 tabular">Version {thisMachine.runtimeVersion} · tatolabd {thisMachine.runtimeVersion}</div>
      <div className="mt-4 flex gap-1.5">
        {["Documentation", "Release notes", "Third-party licences"].map((l) => (
          <Button key={l} variant="outline" size="sm" className={small}>
            {l}
          </Button>
        ))}
      </div>
      <p className="mt-6 max-w-sm text-xs text-fg-3">
        Runtime licensed BUSL-1.1.
        <br />© 2025 Jonathan Fontanez
      </p>
    </div>
  )
}

type SectionId = "general" | "appearance" | "runtime" | "cli" | "about"

const groups: { label: string; items: { id: SectionId; label: string; icon: LucideIcon; render: () => React.ReactNode; blurb?: React.ReactNode }[] }[] = [
  {
    label: "App",
    items: [
      { id: "general", label: "General", icon: SlidersHorizontal, render: GeneralSection },
      { id: "appearance", label: "Appearance", icon: Paintbrush, render: AppearanceSection },
    ],
  },
  {
    label: "This machine",
    items: [
      {
        id: "runtime",
        label: "Runtime",
        icon: Cpu,
        render: RuntimeSection,
        blurb: (
          <>
            The tatolabd process that runs your streams on <span className="font-mono text-xs">{thisMachine.name}</span>.
          </>
        ),
      },
      { id: "cli", label: "Command line", icon: SquareTerminal, render: CommandLineSection, blurb: "Everything in this app is also a tatolab command." },
    ],
  },
  {
    label: "Tatolab",
    items: [{ id: "about", label: "About", icon: Info, render: AboutSection }],
  },
]

export default function TodaySettings() {
  const [params, setParams] = useSearchParams()
  const all = groups.flatMap((g) => g.items)
  const current = all.find((s) => s.id === params.get("section")) ?? all[0]
  const Section = current.render
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[240px] shrink-0 flex-col border-r bg-chrome pt-3">
        {groups.map((g) => (
          <SidebarGroup key={g.label} className="py-1">
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {g.items.map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton isActive={s.id === current.id} onClick={() => setParams({ section: s.id })} className="h-7 data-active:font-normal">
                      <s.icon strokeWidth={1.75} className="text-fg-3" />
                      <span>{s.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </aside>
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-8 pt-6 pb-12">
          {current.id !== "about" && (
            <div>
              <h1 className="title-lg">{current.label}</h1>
              {current.blurb && <p className="text-fg-3">{current.blurb}</p>}
            </div>
          )}
          <Section />
        </div>
      </div>
    </div>
  )
}
