// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Tv as TvIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LivePreview } from "@/components/live/LivePreview"
import { HintBar, KeyCap, TvIdle, TvPair, TvStatus, TvTile, useClock } from "@/components/tv/TvParts"
import { machineById, type StreamSpec, streams } from "@/data/mock"

const onThisTv = streams.filter((s) => s.machine === "lobby-tv")
const fromMachines = streams.filter((s) => s.machine !== "lobby-tv" && s.status !== "paused")
const shelves: { title: string; items: StreamSpec[] }[] = [
  { title: "On this TV", items: onThisTv },
  { title: "From your machines", items: fromMachines },
]

function TvHome({ onOpen }: { onOpen: (id: string) => void }) {
  const { time, date } = useClock()
  const [focus, setFocus] = useState<[number, number]>([0, 0])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const [row, col] = focus
      if (e.key === "ArrowRight") setFocus([row, Math.min(shelves[row].items.length - 1, col + 1)])
      else if (e.key === "ArrowLeft") setFocus([row, Math.max(0, col - 1)])
      else if (e.key === "ArrowDown" && row < shelves.length - 1) setFocus([row + 1, Math.min(col, shelves[row + 1].items.length - 1)])
      else if (e.key === "ArrowUp" && row > 0) setFocus([row - 1, Math.min(col, shelves[row - 1].items.length - 1)])
      else if (e.key === "Enter") onOpen(shelves[row].items[col].id)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus, onOpen])

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between px-24 pt-14">
        <div>
          <div className="text-[56px] leading-[60px] font-light text-white tabular">{time}</div>
          <div className="mt-1 text-[22px] leading-8 text-white/50">{date}</div>
        </div>
        <div className="flex items-center gap-3 pt-3 text-[22px] leading-8 text-white/60">
          <TvIcon className="size-6 text-white/45" strokeWidth={1.5} />
          <span className="font-mono text-[20px]">lobby-tv</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-10 overflow-hidden">
        {shelves.map((shelf, row) => {
          const col = focus[0] === row ? focus[1] : 0
          const offset = Math.max(0, col - 1) * (400 + 40)
          return (
            <section key={shelf.title}>
              <h2 className="px-24 text-[24px] leading-8 font-medium text-white/70">{shelf.title}</h2>
              <div className="overflow-visible px-24 pt-5 pb-2">
                <div className="flex gap-10 transition-transform duration-300 ease-out" style={{ transform: `translateX(-${offset}px)` }}>
                  {shelf.items.map((s, i) => (
                    <TvTile
                      key={s.id}
                      stream={s}
                      index={row * 10 + i}
                      focused={focus[0] === row && focus[1] === i}
                      onFocus={() => setFocus([row, i])}
                      onOpen={() => onOpen(s.id)}
                    />
                  ))}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <footer className="flex shrink-0 items-center px-24 pb-12">
        <HintBar
          hints={[
            [
              <span className="inline-flex gap-1.5">
                <KeyCap>←</KeyCap>
                <KeyCap>→</KeyCap>
                <KeyCap>↑</KeyCap>
                <KeyCap>↓</KeyCap>
              </span>,
              "Move",
            ],
            [<KeyCap>Enter</KeyCap>, "Open"],
            [<KeyCap>Menu</KeyCap>, "Settings"],
          ]}
        />
      </footer>
    </div>
  )
}

function TvPlayer({ stream, onBack }: { stream: StreamSpec; onBack: () => void }) {
  const machine = machineById(stream.machine)!
  const live = stream.status === "live" || stream.status === "attention"
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") onBack()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onBack])
  return (
    <div className="relative h-full">
      <LivePreview scene={stream.hero} paused={!live} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-24 pt-40 pb-14">
        <div className="flex items-end gap-10">
          <div className="min-w-0 flex-1">
            <div className="text-[40px] leading-[48px] font-semibold text-white">{stream.title}</div>
            <div className="mt-2 flex items-center gap-4 text-[22px] leading-8">
              <TvStatus stream={stream} />
              <span className="text-white/30">·</span>
              <span className="font-mono text-[20px] text-white/55">{machine.name}</span>
            </div>
          </div>
          <div className="flex gap-10 text-right text-[22px] leading-8 text-white/60 tabular">
            <div>
              <div className="text-[18px] leading-6 text-white/40">Frame rate</div>
              {live ? `${stream.fps} fps` : "—"}
            </div>
            <div>
              <div className="text-[18px] leading-6 text-white/40">Latency</div>
              {live ? `${stream.endToEndMs} ms` : "—"}
            </div>
            <div>
              <div className="text-[18px] leading-6 text-white/40">Resolution</div>
              {stream.resolution}
            </div>
          </div>
        </div>
        <HintBar className="mt-10" hints={[[<KeyCap>Esc</KeyCap>, "Back"], [<KeyCap>Enter</KeyCap>, "Show steps"]]} />
      </div>
    </div>
  )
}

export default function Tv() {
  const [params, setParams] = useSearchParams()
  const openId = params.get("open")
  const opened = useMemo(() => streams.find((s) => s.id === openId), [openId])
  const runningCount = onThisTv.filter((s) => s.status === "live" || s.status === "attention").length + fromMachines.length

  let body: React.ReactNode
  if (params.get("pair") === "1") body = <TvPair />
  else if (params.get("idle") === "1") body = <TvIdle streamCount={runningCount} />
  else if (opened) body = <TvPlayer stream={opened} onBack={() => setParams({})} />
  else body = <TvHome onOpen={(id) => setParams({ open: id })} />

  return <div className="dark h-screen w-screen overflow-hidden bg-[#0c0c0d] font-sans text-white select-none">{body}</div>
}
