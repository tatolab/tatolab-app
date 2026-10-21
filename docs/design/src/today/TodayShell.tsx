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
  Moon,
  Palette,
  Plus,
  Radio,
  ScrollText,
  Search,
  Settings,
  Sun,
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
import { editionHome } from "@/edition"
import { thisMachine, todayRelays, todayStreams as streams, type TodayStream } from "./data"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/shell/theme"

const workspaceNav = [
  { to: "/", label: "Streams", icon: Boxes, end: true, count: streams.length },
  { to: "/relays", label: "Relays", icon: Radio, count: todayRelays.length },
]

const prototypeNav = [
  { to: "/storyboard", label: "Storyboard", icon: LayoutGrid },
  { to: "/design", label: "Design language", icon: Palette },
  { to: "/setup", label: "First run", icon: BookOpen },
]

function streamIcon(stream: TodayStream) {
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
              <span className="truncate font-mono text-xs text-fg-3">{thisMachine.name}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-fg-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Runtime on {thisMachine.name}</DropdownMenuLabel>
              <DropdownMenuItem>
                <Activity /> Running · tatolabd {thisMachine.runtimeVersion}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ScrollText /> Open the runtime's logs folder
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function StreamList() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Streams</SidebarGroupLabel>
      <SidebarGroupAction title="Add stream" onClick={() => navigate("/new")}>
        <Plus />
        <span className="sr-only">Add stream</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {streams.map((s) => {
            const Icon = streamIcon(s)
            const active = pathname.startsWith(`/streams/${s.id}`)
            return (
              <SidebarMenuItem key={s.id}>
                <SidebarMenuButton isActive={active} tooltip={s.title} render={<NavLink to={`/streams/${s.id}`} />}>
                  <Icon strokeWidth={1.75} />
                  <span className={cn("min-w-0 flex-1 truncate", !s.loaded && "text-fg-3")}>{s.title}</span>
                </SidebarMenuButton>
                {s.status === "failed" && (
                  <SidebarMenuBadge>
                    <StatusIcon status={s.status} />
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
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
            <DropdownMenuItem onClick={() => window.location.assign(editionHome.direction)}>
              <Compass /> Long-term direction
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
        <StreamList />
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
                <CommandShortcut className="font-mono">{s.id}</CommandShortcut>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandGroup heading="Commands">
          <CommandItem onSelect={() => go("/new")}>
            <Plus /> Add stream
          </CommandItem>
          <CommandItem onSelect={() => go("/relays?add=cloudflare")}>
            <Radio /> Add relay
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
        <Plus className="size-3.5" /> Add stream
      </Button>
    </header>
  )
}

function StatusBar() {
  const running = streams.filter((s) => s.loaded).length
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t px-3 text-[11.5px] text-fg-3">
      <span className="flex items-center gap-1.5">
        <Activity className="size-3" strokeWidth={2} /> Runtime running
      </span>
      <span>
        {running} of {streams.length} streams loaded
      </span>
      <span className="ml-auto font-mono">tatolabd {thisMachine.runtimeVersion}</span>
    </footer>
  )
}

export function TodayShell() {
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
