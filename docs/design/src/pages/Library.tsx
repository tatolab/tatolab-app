// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight, Package, Plus, Search } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { installedPacks } from "@/components/library/libraryData"
import { LibraryDetail, type LibraryTab } from "@/components/library/LibraryDetail"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { type CatalogEntry, type NodeCategory, type NodeOrigin, nodeCatalog } from "@/data/mock"
import { cn } from "@/lib/utils"
import { categoryWords } from "@/lib/vocab"

const categoryOrder: NodeCategory[] = ["source", "effect", "ai", "analysis", "codec", "relay", "sink"]
type OriginFilter = "all" | NodeOrigin

function originLine(e: CatalogEntry) {
  if (e.origin === "pack") return e.pack
  return e.origin === "built-in" ? "Built-in" : "Python"
}

function EntryRow({ entry, active, onSelect }: { entry: CatalogEntry; active: boolean; onSelect: () => void }) {
  const Icon = categoryWords[entry.category].icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} onClick={onSelect} className="h-11 gap-2.5 px-2 data-active:font-normal">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-md border bg-raised", active && "border-line-strong")}>
          <Icon className="size-3.5! text-fg-2" strokeWidth={1.75} />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-fg">{entry.label}</span>
            <span className="ml-auto shrink-0 font-mono text-xs text-fg-3">{originLine(entry)}</span>
          </span>
          <span className="truncate text-xs text-fg-3">{entry.description}</span>
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function CollapsibleGroup({ label, count, children, action }: { label: string; count: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Collapsible defaultOpen render={<SidebarGroup className="py-1" />}>
      <SidebarGroupLabel render={<CollapsibleTrigger />} className="group/label w-full cursor-default gap-1 hover:text-fg">
        <ChevronRight className="size-3.5! transition-transform group-data-panel-open/label:rotate-90" strokeWidth={2} />
        {label}
        <span className="ml-1 font-normal text-fg-3 tabular">{count}</span>
      </SidebarGroupLabel>
      {action}
      <CollapsibleContent>
        <SidebarGroupContent>{children}</SidebarGroupContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function Library() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState("")
  const [origin, setOrigin] = useState<OriginFilter>("all")
  const selected = nodeCatalog.find((e) => e.className === params.get("node")) ?? nodeCatalog.find((e) => e.className === "vision_pack:ObjectDetector")!
  const tab = (params.get("tab") as LibraryTab) || "overview"
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p)
  }
  const visible = nodeCatalog
    .filter((e) => origin === "all" || e.origin === origin)
    .filter((e) => !query || `${e.label} ${e.className} ${e.description} ${e.pack ?? ""}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[340px] shrink-0 flex-col border-r bg-chrome">
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-baseline gap-2">
            <h1 className="title-lg">Library</h1>
            <span className="text-fg-3">{nodeCatalog.length} nodes</span>
          </div>
          <label className="mt-3 flex h-7 items-center gap-2 rounded-md border bg-window px-2 focus-within:border-line-strong">
            <Search className="size-3.5 text-fg-3" strokeWidth={1.75} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search nodes and packs" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3" />
          </label>
          <Segmented
            className="mt-2 w-full [&>button]:flex-1 [&>button]:justify-center"
            value={origin}
            onChange={setOrigin}
            options={[
              { id: "all", label: "All" },
              { id: "built-in", label: "Built-in" },
              { id: "python", label: "Python" },
              { id: "pack", label: "Packs" },
            ]}
          />
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto border-t pb-3">
          {!query && (origin === "all" || origin === "pack") && (
            <CollapsibleGroup
              label="Installed packs"
              count={installedPacks.length}
              action={
                <SidebarGroupAction title="Browse packs" className="top-2.5 right-3 text-fg-3">
                  <Plus strokeWidth={1.75} />
                </SidebarGroupAction>
              }
            >
              <SidebarMenu>
                {installedPacks.map((p) => (
                  <SidebarMenuItem key={p.name}>
                    <div className="flex h-8 items-center gap-2.5 rounded-md px-2 hover:bg-hover">
                      <Package className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} />
                      <span className="truncate font-mono text-xs text-fg">{p.name}</span>
                      <span className="text-xs text-fg-3 tabular">{p.version}</span>
                      {p.update ? (
                        <Button variant="outline" size="xs" className="ml-auto h-5 px-1.5 text-xs text-brand-text">
                          Update to {p.update}
                        </Button>
                      ) : (
                        <span className="ml-auto text-xs text-fg-3">
                          {p.nodes} {p.nodes === 1 ? "node" : "nodes"}
                        </span>
                      )}
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </CollapsibleGroup>
          )}
          {categoryOrder.map((cat) => {
            const entries = visible.filter((e) => e.category === cat)
            if (!entries.length) return null
            return (
              <CollapsibleGroup key={cat} label={categoryWords[cat].label} count={entries.length}>
                <SidebarMenu className="gap-px">
                  {entries.map((e) => (
                    <EntryRow key={e.className} entry={e} active={e.className === selected.className} onSelect={() => set({ node: e.className, tab: null })} />
                  ))}
                </SidebarMenu>
              </CollapsibleGroup>
            )
          })}
          {!visible.length && <p className="px-4 py-6 text-center text-fg-3">No nodes match “{query}”.</p>}
        </div>
      </aside>
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <LibraryDetail key={selected.className} entry={selected} tab={tab} onTab={(t) => set({ tab: t === "overview" ? null : t })} />
      </div>
    </div>
  )
}
