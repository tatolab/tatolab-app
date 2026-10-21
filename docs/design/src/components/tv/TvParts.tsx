// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { LoaderCircle, SquareX, TriangleAlert } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { Mascot, TatolabMark } from "@/components/brand/brand"
import { LivePreview } from "@/components/live/LivePreview"
import type { StreamSpec } from "@/data/mock"
import { machineById } from "@/data/mock"
import { cn } from "@/lib/utils"

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return {
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
  }
}

const running = (s: StreamSpec) => s.status === "live" || s.status === "attention"

export function TvStatus({ stream, className }: { stream: StreamSpec; className?: string }) {
  if (stream.status === "attention")
    return (
      <span className={cn("inline-flex items-center gap-2 text-[#f0a63a]", className)}>
        <TriangleAlert className="size-5" strokeWidth={1.75} /> Degraded
      </span>
    )
  if (stream.status === "failed")
    return (
      <span className={cn("inline-flex items-center gap-2 text-[#f2554d]", className)}>
        <SquareX className="size-5" strokeWidth={1.75} /> Exited
      </span>
    )
  if (stream.status === "starting")
    return (
      <span className={cn("inline-flex items-center gap-2 text-white/60", className)}>
        <LoaderCircle className="size-5 animate-spin" strokeWidth={1.75} /> Starting
      </span>
    )
  if (stream.status === "paused") return <span className={cn("text-white/45", className)}>Stopped</span>
  return <span className={cn("text-white/60", className)}>Running · {stream.uptime}</span>
}

export function TvTile({ stream, focused, index, onFocus, onOpen }: { stream: StreamSpec; focused: boolean; index: number; onFocus: () => void; onOpen: () => void }) {
  const machine = machineById(stream.machine)!
  return (
    <motion.button
      onMouseEnter={onFocus}
      onClick={onOpen}
      animate={{ scale: focused ? 1.06 : 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="w-[400px] shrink-0 origin-center text-left outline-none"
    >
      <div className={cn("relative aspect-video overflow-hidden rounded-xl bg-[#141416] transition-shadow", focused ? "shadow-[0_0_0_2px_#fff,0_24px_60px_rgba(0,0,0,0.6)]" : "shadow-[0_0_0_1px_rgba(255,255,255,0.08)]")}>
        <LivePreview scene={stream.hero} paused={!running(stream)} seed={index * 5} />
      </div>
      <div className={cn("mt-4 transition-opacity", focused ? "opacity-100" : "opacity-70")}>
        <div className="text-[24px] leading-8 font-semibold text-white">{stream.title}</div>
        <div className="mt-1 flex items-center gap-3 text-[20px] leading-7">
          <TvStatus stream={stream} />
          <span className="text-white/30">·</span>
          <span className="font-mono text-[18px] text-white/45">{machine.name}</span>
        </div>
      </div>
    </motion.button>
  )
}

export function KeyCap({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-white/20 bg-white/[0.06] px-2.5 font-sans text-[18px] leading-6 text-white/80">{children}</kbd>
}

export function HintBar({ hints, className }: { hints: [React.ReactNode, string][]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-10 text-[20px] leading-7 text-white/55", className)}>
      {hints.map(([keys, label]) => (
        <span key={label} className="inline-flex items-center gap-3">
          {keys}
          {label}
        </span>
      ))}
    </div>
  )
}

export function TvIdle({ streamCount }: { streamCount: number }) {
  const { time, date } = useClock()
  return (
    <div className="relative flex h-full flex-col overflow-hidden px-28 py-24">
      <div className="text-[200px] leading-[200px] font-extralight tracking-[-0.02em] text-white tabular">{time}</div>
      <div className="mt-6 text-[36px] leading-[44px] text-white/55">{date}</div>
      <motion.div
        className="absolute"
        style={{ right: 260, bottom: 200 }}
        animate={{ x: [0, -120, -40, 60, 0], y: [0, -50, -110, -40, 0] }}
        transition={{ duration: 48, repeat: Infinity, ease: "easeInOut" }}
      >
        <Mascot variant="pixel" scale={2} />
      </motion.div>
      <div className="mt-auto flex items-center gap-4 text-[22px] leading-8 text-white/40">
        <TatolabMark className="size-7 text-white/60" />
        <span className="font-mono text-[20px]">lobby-tv</span>
        <span>·</span>
        <span>
          {streamCount} streams running · press any key
        </span>
      </div>
    </div>
  )
}

export function TvPair() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Mascot className="size-[200px]" />
      <h1 className="mt-8 text-[40px] leading-[48px] font-semibold text-white">Pair this TV</h1>
      <p className="mt-3 max-w-[900px] text-[24px] leading-9 text-white/60">
        On your Mac, open Tatolab, go to Machines → Add machine → Set-top, and check that it shows this code.
      </p>
      <div className="mt-12 rounded-2xl border border-white/15 bg-white/[0.04] px-14 py-8 font-mono text-[64px] leading-[72px] font-medium tracking-[0.12em] text-white">TATO-4F2K</div>
      <p className="mt-8 text-[22px] leading-8 text-white/45">
        Or run <span className="font-mono text-white/75">tatolab pair TATO-4F2K</span> on any machine signed in to your account.
      </p>
      <div className="mt-14 flex items-center gap-3 text-[22px] leading-8 text-white/55">
        <LoaderCircle className="size-6 animate-spin" strokeWidth={1.75} />
        Waiting for your Mac… <span className="font-mono text-[20px] text-white/40">lobby-tv · 192.168.1.48</span>
      </div>
    </div>
  )
}
