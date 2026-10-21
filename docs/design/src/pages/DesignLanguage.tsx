// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  AudioLines,
  Boxes,
  Check,
  Copy,
  Cpu,
  Laptop,
  Library,
  Play,
  Plus,
  Radio,
  RotateCw,
  ScrollText,
  Server,
  Settings,
  Square,
  Video,
  Workflow,
  X,
} from "lucide-react"
import { useState } from "react"
import { Mascot, TatolabMark } from "@/components/brand/brand"
import {
  ExposureLabel,
  IconButton,
  KeyValue,
  KindIcon,
  Meter,
  Preview,
  RunModeLabel,
  Sparkline,
  StatusLabel,
} from "@/components/stream/primitives"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { type DataKind, type Exposure, type RunMode, series, type StreamStatus } from "@/data/mock"
import { cn } from "@/lib/utils"
import { exposureWords, kindWords, runModeWords, statusWords } from "@/lib/vocab"

const sections = [
  ["rules", "Rules"],
  ["why", "Why the first pass failed"],
  ["colour", "Colour"],
  ["charts", "Chart palette"],
  ["type", "Type"],
  ["words", "Words"],
  ["controls", "Controls"],
  ["lists", "Lists and panels"],
  ["previews", "Previews"],
  ["icons", "Icons"],
  ["tato", "Tato"],
] as const

function Section({ id, title, children, lede }: { id: string; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-b py-8 last:border-b-0">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      {lede && <p className="mt-1 max-w-2xl text-fg-3">{lede}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Swatch({ name, token }: { name: string; token: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="size-7 shrink-0 rounded-md ring-1 ring-line" style={{ background: `var(${token})` }} />
      <div className="min-w-0">
        <div>{name}</div>
        <div className="font-mono text-xs text-fg-3">{token}</div>
      </div>
    </div>
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1">
      {ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-fg-2" /> : <X className="mt-0.5 size-3.5 shrink-0 text-danger" />}
      <span className="text-fg-2">{children}</span>
    </div>
  )
}

export default function DesignLanguage() {
  const [seg, setSeg] = useState<"internal" | "private" | "public">("private")
  return (
    <div className="grid min-h-full grid-cols-[200px_minmax(0,1fr)]">
      <nav className="sticky top-0 h-fit border-r px-3 py-5">
        <div className="mb-3 flex items-center gap-2 px-2 font-medium">
          <TatolabMark className="size-4 text-fg" /> Design language
        </div>
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="flex h-7 items-center rounded-md px-2 text-fg-2 hover:bg-hover hover:text-fg">
            {label}
          </a>
        ))}
        <p className="mt-4 px-2 text-xs text-fg-3">
          Source: <span className="font-mono">DESIGN.md</span>, <span className="font-mono">index.css</span>,{" "}
          <span className="font-mono">vocab.ts</span>
        </p>
      </nav>
      <div className="min-w-0 max-w-[1100px] px-8 py-6">
        <h1 className="title-lg">Design language</h1>
        <p className="mt-1 max-w-2xl text-fg-3">
          Tatolab is a runtime for developers, the way Docker is. The app should feel like the tools they already live in:
          Docker Desktop, VS Code, Cursor, Linear, the Vercel dashboard.
        </p>

        <Section id="rules" title="Rules">
          <ol className="grid gap-x-10 gap-y-3 md:grid-cols-2">
            {[
              ["No dot indicators. Ever.", "No coloured status dots, badge dots, pulsing dots, bullets or round port handles. Enforced by scripts/check-no-dots.mjs."],
              ["Status is a word.", "Running, Stopped, Starting, Degraded, Exited. Only problems carry an icon, and never a round one."],
              ["Neutral chrome, colourful data.", "Greys do the interface; blue for action and selection; amber and red for problems; the series palette for charts."],
              ["Native density.", "13px Inter with optical sizing. 28px rows and controls. 20px page padding. Titles 20px at most."],
              ["Flat surfaces.", "Hairlines separate regions. Cards only for discrete objects. Shadows only on popovers."],
              ["Mono for machine words.", "Ids, paths, addresses, commands and table numbers in Geist Mono."],
              ["Previews are content.", "A plain frame with a mono caption. No LIVE tags, no badges on the picture."],
              ["Engineering metrics only.", "CPU, GPU, memory, fps, latency, drops, restarts, exit codes. No audiences."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="font-mono text-xs text-fg-3 tabular">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="font-medium">{t}</div>
                  <div className="text-fg-3">{b}</div>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="why" title="Why the first pass failed" lede="Measured against nextjs.org, Vercel's Geist, cursor.com, linear.app, cloudflare.com and Docker Desktop.">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-xs text-fg-3">
                <th className="h-8 w-28 font-normal" />
                <th className="font-normal">First pass</th>
                <th className="font-normal">References</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-2 [&_td]:align-top [&_tr]:border-b">
              {[
                ["Type", "Instrument Sans, a display face; spindly and uneven at 11–13px", "Inter / Geist at 13–14px with optical sizes, 400 and 500"],
                ["Headings", "44–60px with -0.045em hero tracking inside the app", "14–20px in apps; tight tracking only on marketing pages"],
                ["Colour", "Coloured dots, red LIVE tags, a colour per data kind", "Grey scales, one accent, colour only for problems"],
                ["Surfaces", "Rounded-2xl cards, glows, a navy bezel", "Flat panels, hairlines, filled-row selection, 6–8px radii"],
                ["Model", "Viewers and “most watched”", "Status, uptime, CPU / GPU / memory, logs, restart, inspect"],
                ["Pixels", "Pixel sprite shrunk with nearest-neighbour", "Pixel art only at integer upscales"],
              ].map(([k, a, b]) => (
                <tr key={k}>
                  <td className="text-fg-3">{k}</td>
                  <td className="pr-6 text-fg-2">{a}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="colour" title="Colour" lede="Taken from tatolab.com's neutrals and its one blue. Switch the theme in the title bar to see both.">
          <div className="grid gap-x-8 md:grid-cols-3">
            <div>
              <div className="label-caps mb-1">Surfaces</div>
              <Swatch name="Window" token="--window" />
              <Swatch name="Chrome" token="--chrome" />
              <Swatch name="Raised" token="--raised" />
              <Swatch name="Well" token="--well" />
              <Swatch name="Line" token="--line" />
            </div>
            <div>
              <div className="label-caps mb-1">Text</div>
              <Swatch name="Primary" token="--fg" />
              <Swatch name="Secondary" token="--fg-2" />
              <Swatch name="Tertiary" token="--fg-3" />
              <Swatch name="Disabled" token="--fg-4" />
            </div>
            <div>
              <div className="label-caps mb-1">Meaning</div>
              <Swatch name="Brand · action, selection" token="--brand" />
              <Swatch name="Brand text · links" token="--brand-text" />
              <Swatch name="Warn · degraded" token="--warn" />
              <Swatch name="Danger · exited" token="--danger" />
            </div>
          </div>
        </Section>

        <Section
          id="charts"
          title="Chart palette"
          lede="Charts are where colour lives. Candidates from working designers were run through the data-viz validator (colour-vision simulation, normal-vision floor, lightness band, chroma) on our real surfaces."
        >
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <div className="label-caps mb-2">Tatolab series · assign in order</div>
              <div className="grid grid-cols-8 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <div key={n}>
                    <div className="h-10 rounded-md" style={{ background: `var(--series-${n})` }} />
                    <div className="mt-1 text-center font-mono text-[11px] text-fg-3">{n}</div>
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 400 120" className="mt-4 h-32 w-full">
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1="0" x2="400" y1={20 + i * 30} y2={20 + i * 30} stroke="var(--line)" strokeWidth="1" shapeRendering="crispEdges" />
                ))}
                {[1, 2, 3, 4].map((n) => {
                  const v = series(n * 7, 24, 60 - n * 9, 18)
                  const d = v.map((y, i) => `${i ? "L" : "M"}${(i / 23) * 400} ${110 - y}`).join(" ")
                  return <path key={n} d={d} fill="none" stroke={`var(--series-${n})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                })}
              </svg>
            </div>
            <table className="w-full self-start text-left">
              <thead>
                <tr className="border-b text-xs text-fg-3">
                  <th className="h-8 font-normal">Candidate</th>
                  <th className="font-normal">By</th>
                  <th className="font-normal">Result</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2 [&_td]:align-top [&_tr]:border-b">
                <tr>
                  <td>Observable 10</td>
                  <td className="text-fg-2">Jeff Pettiross, Observable</td>
                  <td className="text-fg-2">Too light; teal and green collide</td>
                </tr>
                <tr>
                  <td>Okabe–Ito</td>
                  <td className="text-fg-2">Okabe & Ito; Wong, Nature Methods</td>
                  <td className="text-fg-2">Yellow too light on white</td>
                </tr>
                <tr>
                  <td>IBM Carbon</td>
                  <td className="text-fg-2">IBM Design</td>
                  <td className="text-fg-2">Darks out of band; teal reads grey</td>
                </tr>
                <tr>
                  <td className="font-medium">Tatolab series</td>
                  <td className="text-fg-2">Reference order, brand blue first</td>
                  <td>Passes both themes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="type" title="Type">
          <div className="divide-y rounded-lg border">
            {[
              ["title-xl · 28/34 · 600", "title-xl", "Welcome to Tatolab"],
              ["title-lg · 20/28 · 600", "title-lg", "Streams"],
              ["section · 15/20 · 600", "text-[15px] font-semibold tracking-[-0.01em]", "Steps"],
              ["body · 13/20 · 400", "", "People counter is dropping 9% of frames."],
              ["secondary · 12/16", "text-xs text-fg-3", "5 running across 4 machines"],
              ["label · 11/16 caps", "label-caps", "Outputs"],
              ["mono · 12/16", "font-mono text-xs", "garage-jetson/front-door/boxoverlay/video_to_downstream"],
            ].map(([meta, cls, text]) => (
              <div key={meta} className="grid grid-cols-[200px_minmax(0,1fr)] items-baseline gap-4 px-4 py-3">
                <span className="font-mono text-xs text-fg-3">{meta}</span>
                <span className={cn("truncate", cls)}>{text}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="words" title="Words" lede="The runtime's term lives in the tooltip, so developers can still map it.">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="label-caps mb-2">Stream state</div>
              {(Object.keys(statusWords) as StreamStatus[]).map((s) => (
                <div key={s} className="flex h-7 items-center justify-between">
                  <StatusLabel status={s} />
                  <span className="font-mono text-xs text-fg-3">{s}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="label-caps mb-2">Run mode</div>
              {(Object.keys(runModeWords) as RunMode[]).map((m) => (
                <div key={m} className="flex h-7 items-center justify-between">
                  <RunModeLabel mode={m} />
                  <span className="font-mono text-xs text-fg-3">was “{runModeWords[m].runtimeTerm}”</span>
                </div>
              ))}
            </div>
            <div>
              <div className="label-caps mb-2">Output exposure</div>
              {(Object.keys(exposureWords) as Exposure[]).map((e) => (
                <div key={e} className="flex h-7 items-center justify-between">
                  <ExposureLabel exposure={e} />
                  <span className="font-mono text-xs text-fg-3">{e}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section id="controls" title="Controls">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <Plus className="size-3.5" /> New stream
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <RotateCw className="size-3.5" /> Restart
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-[13px]">
              <Copy className="size-3.5" /> Copy address
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[13px]">
              Cancel
            </Button>
            <span className="mx-2 h-5 w-px bg-line" />
            <IconButton icon={Square} label="Stop" filled />
            <IconButton icon={Play} label="Start" filled />
            <IconButton icon={RotateCw} label="Restart" />
            <IconButton icon={Workflow} label="Open graph" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Segmented
              value={seg}
              onChange={setSeg}
              options={[
                { id: "internal", label: "Internal" },
                { id: "private", label: "This machine" },
                { id: "public", label: "Public" },
              ]}
            />
            <Input defaultValue="front-door" className="h-7 w-48 font-mono text-xs" />
            <label className="flex items-center gap-2">
              <Switch defaultChecked size="sm" /> Always on
            </label>
          </div>
        </Section>

        <Section id="lists" title="Lists and panels" lede="Rows, hairlines, and the side panel every inspector uses.">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-chrome text-xs text-fg-3">
                    <th className="h-8 pl-3 font-normal">Step</th>
                    <th className="font-normal">Status</th>
                    <th className="text-right font-normal">FPS</th>
                    <th className="pr-3 text-right font-normal">CPU</th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:h-8 [&_tr]:border-b [&_tr:last-child]:border-0">
                  {[
                    ["Camera", "live", 30, 3],
                    ["People counter", "attention", 27.3, 38],
                    ["Heat map render", "live", 27.3, 3],
                  ].map(([n, s, f, c]) => (
                    <tr key={n as string} className="hover:bg-hover">
                      <td className="pl-3">{n}</td>
                      <td>
                        <StatusLabel status={s as StreamStatus} />
                      </td>
                      <td className="text-right tabular text-fg-2">{f}</td>
                      <td className="pr-3">
                        <div className="flex items-center justify-end gap-2 tabular text-fg-2">
                          {c}% <Meter value={c as number} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border bg-chrome p-3">
              <div className="label-caps mb-2">Details</div>
              <KeyValue rows={[["Project", <span className="font-mono text-xs">~/streams/front-door</span>], ["Python", "3.12"], ["Restarts", "0"]]} />
              <div className="label-caps mt-4 mb-1">CPU</div>
              <Sparkline values={series(4, 30, 30, 8)} />
            </div>
          </div>
        </Section>

        <Section id="previews" title="Previews" lede="Photographs stand in for live tracks in this prototype (credits in public/media/CREDITS.md).">
          <div className="grid gap-4 md:grid-cols-3">
            <Preview scene="detect" className="aspect-video" caption="garage-jetson/front-door/boxoverlay/video_to_downstream" />
            <Preview scene="halftone" className="aspect-video" caption="studio-mac/halftone-booth/halftone/video_to_downstream" />
            <Preview scene="waveform" className="aspect-video" caption="studio-mac/studio-voice/roomreverb/audio_to_downstream" />
            <Preview scene="thermal" className="aspect-video" caption="dock-box/dock-4/peoplecounter/heatmap" />
            <Preview scene="drone" className="aspect-video" caption="field-drone/survey/camera/video" />
            <Preview scene="inverted" paused className="aspect-video" caption="studio-mac/test-pattern · stopped" />
          </div>
        </Section>

        <Section id="icons" title="Icons" lede="Lucide, 16px, stroke 1.75, in the tertiary text colour. Data kinds are told apart by icon, never by colour.">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {[
              [Boxes, "Streams"],
              [Server, "Machines"],
              [Radio, "Relays"],
              [Library, "Library"],
              [ScrollText, "Logs"],
              [Settings, "Settings"],
              [Laptop, "Mac"],
              [Cpu, "Jetson"],
              [Video, "Video stream"],
              [AudioLines, "Audio stream"],
            ].map(([I, l]) => {
              const Icon = I as typeof Boxes
              return (
                <span key={l as string} className="flex items-center gap-2 text-fg-2">
                  <Icon className="size-4 text-fg-3" strokeWidth={1.75} /> {l as string}
                </span>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {(Object.keys(kindWords) as DataKind[]).map((k) => (
              <span key={k} className="flex items-center gap-2 text-fg-2">
                <KindIcon kind={k} /> {kindWords[k].label}
              </span>
            ))}
          </div>
        </Section>

        <Section id="tato" title="Tato" lede="The mascot belongs to arrival and rest: first run, empty states, About, the TV's idle and pairing screens. Never on a working screen.">
          <div className="flex items-end gap-10">
            <div>
              <Mascot variant="3d" className="w-32" />
              <div className="mt-2 text-xs text-fg-3">3D · scales smoothly</div>
            </div>
            <div>
              <Mascot variant="pixel" />
              <div className="mt-2 text-xs text-fg-3">Pixel · 160px or 320px only</div>
            </div>
            <div className="max-w-xs">
              <Rule ok>First run, empty states, About, TV idle and pairing.</Rule>
              <Rule ok>One per screen.</Rule>
              <Rule ok={false}>Tables, the graph, logs, stats, inspectors.</Rule>
              <Rule ok={false}>Pixel art scaled to anything but 1× or 2×.</Rule>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
