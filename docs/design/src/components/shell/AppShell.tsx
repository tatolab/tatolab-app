// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  Activity,
  AudioLines,
  BookOpen,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Compass,
  Keyboard,
  LayoutGrid,
  Library,
  Moon,
  Palette,
  Plus,
  Radio,
  ScrollText,
  Search,
  Server,
  Settings,
  Sun,
  Tv,
  Video,
} from "lucide-react"
import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { TatolabMark } from "@/components/brand/brand"
import { StatusIcon } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { machines, type StreamSpec, streams } from "@/data/mock"
import { editionHome } from "@/edition"
import { cn } from "@/lib/utils"
import { machineKindIcon } from "@/lib/vocab"
import { useTheme } from "./theme"

const workspaceNav = [
  { to: "/", label: "Streams", icon: Boxes, end: true, count: streams.length },
  { to: "/machines", label: "Machines", icon: Server, count: machines.length },
  { to: "/sharing", label: "Relays", icon: Radio },
  { to: "/library", label: "Library", icon: Library },
  { to: "/logs", label: "Logs", icon: ScrollText },
]

const prototypeNav = [
  { to: "/storyboard", label: "Storyboard", icon: LayoutGrid },
  { to: "/design", label: "Design language", icon: Palette },
  { to: "/setup", label: "First run", icon: BookOpen },
  { to: "/tv", label: "TV mode", icon: Tv },
]

function streamIcon(stream: StreamSpec) {
  return stream.hero === "waveform" || stream.hero === "spectrum" ? AudioLines : Video
}

function useActive(to: string, end?: boolean) {
  const { pathname } = useLocation()
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}

function NavItem({ to, label, icon: Icon, end, count }: { to: string; label: string; icon: typeof Boxes; end?: boolean; count?: number }) {
  const active = useActive(to, end)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={label} render={<NavLink to={to} end={end} />}>
        <Icon strokeWidth={1.75} />
        <span>{label}</span>
      </SidebarMenuButton>
      {count !== undefined && <SidebarMenuBadge className="font-normal text-fg-3">{count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  )
}

function AppSwitcher() {
  const here = machines.find((m) => m.isThisMachine)!
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised ring-1 ring-line">
              <TatolabMark className="size-[18px] text-fg" />
            </span>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-semibold">Tatolab</span>
              <span className="truncate font-mono text-xs text-fg-3">{here.name}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-fg-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Connect to a machine</DropdownMenuLabel>
              {machines.map((m) => {
                const MIcon = machineKindIcon[m.kind]
                return (
                  <DropdownMenuItem key={m.id} disabled={m.status === "offline"}>
                    <MIcon />
                    <span className="font-mono text-xs">{m.name}</span>
                    <span className="ml-auto text-xs text-fg-3">{m.isThisMachine ? "This Mac" : m.status === "offline" ? "Offline" : m.location.split(",")[0]}</span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Plus /> Add machine…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function StreamsByMachine() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const grouped = machines
    .map((m) => ({ machine: m, streams: streams.filter((s) => s.machine === m.id) }))
    .filter((g) => g.streams.length)
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Streams</SidebarGroupLabel>
      <SidebarGroupAction title="New stream" onClick={() => navigate("/new")}>
        <Plus />
        <span className="sr-only">New stream</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {grouped.map(({ machine, streams: list }) => {
            const MIcon = machineKindIcon[machine.kind]
            const problem = list.find((s) => s.status === "failed") ?? list.find((s) => s.status === "attention")
            return (
              <Collapsible key={machine.id} defaultOpen render={<SidebarMenuItem />} className="group/machine">
                <CollapsibleTrigger render={<SidebarMenuButton tooltip={machine.name} />}>
                  <MIcon strokeWidth={1.75} />
                  <span className="font-mono text-xs">{machine.name}</span>
                  <ChevronRight className="ml-auto size-3.5! text-fg-3 transition-transform group-data-open/machine:rotate-90" />
                </CollapsibleTrigger>
                {problem && (
                  <SidebarMenuBadge className="right-7 group-data-open/machine:hidden">
                    <StatusIcon status={problem.status} />
                  </SidebarMenuBadge>
                )}
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {list.map((s) => {
                      const active = pathname.startsWith(`/streams/${s.id}`)
                      return (
                        <SidebarMenuSubItem key={s.id}>
                          <SidebarMenuSubButton isActive={active} render={<NavLink to={`/streams/${s.id}`} />}>
                            <span className={cn("min-w-0 flex-1 truncate", s.status === "paused" && "text-fg-3")}>{s.title}</span>
                            <StatusIcon status={s.status} className="ml-auto" />
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function HelpMenu() {
  const navigate = useNavigate()
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton tooltip="Help" className="data-popup-open:bg-sidebar-accent" />}>
          <CircleHelp strokeWidth={1.75} />
          <span>Docs and help</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <BookOpen /> Documentation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Keyboard /> Keyboard shortcuts
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Prototype</DropdownMenuLabel>
            {prototypeNav.map((n) => (
              <DropdownMenuItem key={n.to} onClick={() => navigate(n.to)}>
                <n.icon /> {n.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => window.location.assign(editionHome.today)}>
              <Compass /> What ships today
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <AppSwitcher />
      </SidebarHeader>
      <SidebarContent className="scrollbar-thin">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceNav.map((n) => (
                <NavItem key={n.to} {...n} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <StreamsByMachine />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavItem to="/settings" label="Settings" icon={Settings} />
          <HelpMenu />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const navigate = useNavigate()
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search streams, steps, machines, commands…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Streams">
          {streams.map((s) => {
            const Icon = streamIcon(s)
            return (
              <CommandItem key={s.id} onSelect={() => go(`/streams/${s.id}`)}>
                <Icon />
                {s.title}
                <StatusIcon status={s.status} />
                <CommandShortcut className="font-mono">{s.machine}</CommandShortcut>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandGroup heading="Commands">
          <CommandItem onSelect={() => go("/new")}>
            <Plus /> New stream
          </CommandItem>
          <CommandItem onSelect={() => go("/sharing?add=1")}>
            <Radio /> Add relay
          </CommandItem>
          <CommandItem onSelect={() => go("/machines?add=1")}>
            <Server /> Add machine
          </CommandItem>
          <CommandItem onSelect={() => go("/logs")}>
            <ScrollText /> Show runtime logs
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Prototype">
          {prototypeNav.map((n) => (
            <CommandItem key={n.to} onSelect={() => go(n.to)}>
              <n.icon /> {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function TitleBar({ onSearch }: { onSearch: () => void }) {
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const iconButton = "grid size-7 place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg"
  return (
    <header className="no-drag flex h-11 shrink-0 items-center gap-1 border-b px-2">
      <SidebarTrigger className="size-7 text-fg-3" />
      <button onClick={() => navigate(-1)} className={iconButton} aria-label="Back">
        <ChevronLeft className="size-4" strokeWidth={1.75} />
      </button>
      <button onClick={() => navigate(1)} className={iconButton} aria-label="Forward">
        <ChevronRight className="size-4" strokeWidth={1.75} />
      </button>
      <button
        onClick={onSearch}
        className="mx-auto flex h-7 w-[min(420px,40%)] items-center gap-2 rounded-md border bg-well px-2.5 text-fg-3 transition-colors hover:border-line-strong"
      >
        <Search className="size-3.5" strokeWidth={1.75} />
        Search
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={iconButton} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
      </button>
      <Button size="sm" className="ml-1 h-7 gap-1 px-2.5 text-[13px]" onClick={() => navigate("/new")}>
        <Plus className="size-3.5" /> New stream
      </Button>
    </header>
  )
}

function StatusBar() {
  const here = machines.find((m) => m.isThisMachine)!
  const running = streams.filter((s) => s.machine === here.id && (s.status === "live" || s.status === "attention")).length
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t px-3 text-[11.5px] text-fg-3">
      <span className="flex items-center gap-1.5">
        <Activity className="size-3" strokeWidth={2} /> Runtime running
      </span>
      <span>
        {running} streams on {here.name}
      </span>
      <span className="ml-auto tabular">CPU {here.cpu}%</span>
      <span className="tabular">GPU {here.gpuLoad}%</span>
      <span className="tabular">Memory 6.1 / 36 GB</span>
      <span className="font-mono">v{here.runtimeVersion}</span>
    </footer>
  )
}

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const fullBleed = location.pathname.startsWith("/streams/")
  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden bg-window">
        <TitleBar onSearch={() => setPaletteOpen(true)} />
        <main className={cn("min-h-0 flex-1", fullBleed ? "overflow-hidden" : "scrollbar-thin overflow-y-auto")}>
          <Outlet />
        </main>
        <StatusBar />
      </SidebarInset>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </SidebarProvider>
  )
}
