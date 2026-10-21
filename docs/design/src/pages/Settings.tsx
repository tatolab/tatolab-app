// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Code2, Cpu, Info, type LucideIcon, Paintbrush, Radio, RefreshCw, Search, SlidersHorizontal, Webcam } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import {
  AboutSection,
  AppearanceSection,
  DeveloperSection,
  DevicesSection,
  GeneralSection,
  RelaysSection,
  RuntimeSection,
  UpdatesSection,
} from "@/components/settings/sections"
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type SectionId = "general" | "appearance" | "runtime" | "devices" | "relays" | "developer" | "updates" | "about"

const groups: { label: string; items: { id: SectionId; label: string; icon: LucideIcon; render: () => React.ReactNode; blurb?: string }[] }[] = [
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
      { id: "runtime", label: "Runtime", icon: Cpu, render: RuntimeSection, blurb: "The tatolabd process that runs your streams on studio-mac." },
      { id: "devices", label: "Devices & permissions", icon: Webcam, render: DevicesSection },
      { id: "relays", label: "Relays", icon: Radio, render: RelaysSection },
    ],
  },
  {
    label: "Advanced",
    items: [
      { id: "developer", label: "Developer", icon: Code2, render: DeveloperSection },
      { id: "updates", label: "Updates", icon: RefreshCw, render: UpdatesSection },
      { id: "about", label: "About", icon: Info, render: AboutSection },
    ],
  },
]

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const all = groups.flatMap((g) => g.items)
  const current = all.find((s) => s.id === params.get("section")) ?? all[0]
  const Section = current.render
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[240px] shrink-0 flex-col border-r bg-chrome">
        <div className="shrink-0 px-3 pt-4 pb-1">
          <label className="flex h-7 items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
            <Search className="size-3.5 text-fg-3" strokeWidth={1.75} />
            <input placeholder="Search settings" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3" />
          </label>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
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
        </div>
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
