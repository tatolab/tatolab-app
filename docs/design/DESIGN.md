# Tatolab desktop — design language

Tatolab is a runtime for developers, the way Docker is: you write a stream (a Python project
with a `stream.py`), and the runtime runs it — on this Mac, on a box beside a camera, on a
set-top box behind a TV. The app is where you see what is running, change it, debug it, and
share its outputs. It should feel like a native developer tool: Docker Desktop, VS Code,
Cursor, Linear, the Vercel dashboard.

Run it: `cd docs/design && pnpm install && pnpm dev` → http://localhost:5199. Screens: `/storyboard`.
Check it: `pnpm check` (types + the no-dot rule). How to cite it: `README.md`.

## Two editions

The prototype carries two editions of the same design language:

- **Today** (`/`, `src/today/`) — only what the runtime serves now (streamlib main,
  2026-10-20): one machine; streams as `list_streams` reports them (attached, kept, stopped,
  failed); run a project folder or create one with `tatolab new`; the live graph with node and
  link state and drop counters, editable while it runs (`add_node`, `connect`, …; not written
  back to `stream.py`); logs; per-output exposure; the graph as JSON; relays — the local relay's
  two built-in listeners plus Cloudflare and moq.pro instances you add, configure and remove.
  Its data is `src/today/data.ts`, written in the runtime's own shapes.
- **Direction** (`/direction`) — the long-term picture: several
  machines, per-step CPU / GPU / frame rate and stats, a library of packs, relay setups, more
  relay providers, TV mode.

Both share every token, word and component. A Today screen never shows a number or control the
runtime cannot back; where a capability is missing it says so plainly (an internal output has
no preview until it is exposed; graph edits say they are not saved to `stream.py`).

## Why the first pass failed

We compared it against nextjs.org, Vercel's Geist system, cursor.com (and the Cursor app shown
on it), linear.app, cloudflare.com and Docker Desktop, measuring their computed styles.

| | First pass | References |
|---|---|---|
| Type | Instrument Sans, a display face, 11–13px, spindly and uneven when small | The platform face (SF) or Geist / Inter at 13–14px, weight 400 body, 500 emphasis |
| Headings | 44–60px, -0.045em hero tracking inside the app | App titles 14–20px; tight tracking only above 24px, and only on marketing pages |
| Colour | Coloured dots, red LIVE tags, a colour per data kind, gold waveforms | Grey scales; one accent; colour only where something is wrong |
| Status | Pulsing coloured dots | A word, and an icon shape only when there is a problem (Cursor's check, Linear's half-circle) |
| Surfaces | Bordered rounded-2xl cards, glows, a navy bezel | Flat panels split by 1px hairlines; filled-row selection; 6–8px radii |
| Model | Viewers, "most watched", glass-to-glass — a Twitch dashboard | Docker: status, uptime, CPU / memory / GPU, ports, logs, restart, inspect |
| Pixels | 160px pixel sprite shrunk to 40px with nearest-neighbour, dropping pixels | Pixel art only at integer upscales |

## Rules

1. **No dot indicators. Ever.** No coloured status dots, badge dots, pulsing dots, bullet
   dots, or round port handles. Owner ruling. Enforced by `scripts/check-no-dots.mjs`.
2. **Status is a word.** Running · Stopped · Starting (spinner) · Degraded (triangle, amber) ·
   Exited (octagon, red). Healthy states carry no icon at all.
3. **Neutral chrome, colourful data.** Greys do the work in the interface. Tatolab blue
   (`#2a5bff`) marks the primary button, selection, focus, links and active toggles. Amber
   and red mark problems. Charts are where colour lives — the validated series palette
   below. No gradients, no glows, no tinted cards.
4. **Native density, readable text.** 13/18 base in Geist. Rows 28px in sidebars
   and lists, 32px in tables, 44–52px with thumbnails. Controls 28px tall. Page padding 20px.
   Text is set in px; the root stays at the browser's 16px, so Tailwind's spacing steps are
   these sizes (`h-7` is a 28px control).
   Group labels are sentence case, never tracked caps.
5. **Flat surfaces.** Regions are separated by 1px hairlines. Sidebars, inspectors and panels
   sit on `chrome`; content on `window`. Cards only where content is a discrete object, with
   no shadow. Shadows belong to popovers and menus.
6. **Icons, VS Code-style.** Lucide, 16px, stroke 1.75, in `fg-3`. Icons label things; they
   never carry status colour except for problems.
7. **Mono for machine words.** Geist Mono for ids, paths, addresses
   (`machine/stream/node/port`), commands, and numbers in tables (tabular).
8. **Previews are content, not decoration.** A live output sits in a plain frame (`Preview`):
   black, 1px ring, 6px radius, an optional mono caption. No LIVE tags, no badges on top.
9. **Engineering metrics only.** CPU, GPU and memory per step's process; frames per second and
   latency per step; dropped messages per link; restarts; uptime; exit codes. No audience
   numbers.
10. **Tato at the edges.** The mascot appears in first run, empty states, About, and the TV's
    idle and pairing screens — never on a working screen. The 3D render scales smoothly; the
    pixel sprite is drawn at 160px or 320px only.
11. **Light first, dark always.** Light is the default; every screen is designed and checked
    in both.

## Tokens (`src/index.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `window` | `#ffffff` | `#0c0c0d` | content |
| `chrome` | `#f7f7f8` | `#121214` | sidebar, title bar, inspectors, status bar |
| `raised` | `#ffffff` | `#161618` | cards, selected segment |
| `well` | `#f4f4f5` | `#18181b` | inputs, segmented tracks, code |
| `hover` / `selected` | 4% / 6.5% black | 4.5% / 8% white | row states |
| `line` / `line-strong` | `#e8e8ea` / `#d9d9dc` | `#222225` / `#2e2e32` | hairlines |
| `fg` `fg-2` `fg-3` `fg-4` | `#111113` `#46464e` `#6e6e77` `#a8a8b0` | `#f0f0f2` `#b8b8c0` `#8e8e98` `#5a5a63` | text tiers |
| `brand` / `brand-text` | `#2a5bff` | `#2a5bff` / `#7c9bff` | primary, selection, links |
| `warn` / `danger` | `#c2700a` / `#dc2b2b` | `#f0a63a` / `#f2554d` | problems only |
| `warn-text` / `danger-text` | `#8a5300` / `#b42323` | `#f0a63a` / `#ff6b62` | problem words: `warn` and `danger` as text miss 4.5:1 on hover, selected, well and chrome |
| `ring` | `brand` at 85% | `brand-text` at 85% | the 3px focus ring, 3:1 or better against window and well |

Type: **Geist** (variable; Vercel's face for developer tools, crisp and compact at UI sizes)
for the interface, and **Geist Mono**, from the same family, for code and machine words, where
I, l and 1 are always told apart. Both bundled, so every platform renders identically. One
ladder, one line height per size, no manual tracking below 20px:

| Role | Size / line | Weight | Class |
|---|---|---|---|
| Small, table meta | 12 / 16 | 400 | `text-xs` |
| Group label | 12 / 16 | 500, `fg-3`, sentence case | `.label-caps` |
| Body, rows, controls | 13 / 18 | 400 / 500 | default |
| Section title | 15 / 20 | 600 | `text-lg font-semibold` |
| Page title | 20 / 26 | 600, -0.012em | `.title-lg` |
| First run, TV | 26 / 32 | 700, -0.016em | `.title-xl` |

Text contrast: `fg-2` and `fg-3` clear 4.5:1 on their surfaces in both themes; `fg-4` is for
disabled text only. A problem word is set in `warn-text` or `danger-text`, which clear 4.5:1 on every
surface, hovered and selected rows included; `warn` and `danger` colour icons, borders and fills.

## Chart palette

Researched against palettes made by working designers and validated with the data-viz
checker (OKLab ΔE under simulated colour-vision deficiency, a normal-vision floor, a
lightness band and a chroma floor) on our real surfaces, `#ffffff` and `#0c0c0d`:

| Candidate | Who | Result on our surfaces |
|---|---|---|
| Observable 10 | Jeff Pettiross, Observable (default in Observable Plot) | Fails: three slots too light, teal/green too close (ΔE 14.3) |
| Okabe–Ito | Masataka Okabe & Kei Ito; Bang Wong, *Nature Methods* 2011 | Fails: yellow too light on white |
| IBM Carbon categorical | IBM Design | Fails: dark slots outside the band, teal reads grey |
| **Tatolab series** | the data-viz reference order, slot 1 re-anchored to Tatolab blue | **Passes in both themes**: adjacent CVD ΔE ≥ 9.1 / 8.4, normal-vision ≥ 19.6 / 19.3; slots 1–3 pass all-pairs |

| Slot | Light | Dark |
|---|---|---|
| 1 blue (brand) | `#2a5bff` | `#4d7bff` |
| 2 orange | `#eb6834` | `#d95926` |
| 3 aqua | `#1baf7a` | `#199e70` |
| 4 yellow | `#eda100` | `#c98500` |
| 5 pink | `#e87ba4` | `#d55181` |
| 6 green | `#008300` | `#008300` |
| 7 violet | `#7c5cf0` | `#9085e9` |
| 8 red | `#e34948` | `#e66767` |

Rules: assign in this order per entity, never cycle and never repaint on filter; 2px lines,
no point markers; a legend for two or more series, direct labels when four or fewer; grid
and axes recessive; text in text colours, never the series colour; status colours never
stand in for a series; three light slots sit under 3:1 on white, so those charts carry
labels or a table view; scatter-like charts cap at three series.

## Words (`src/lib/vocab.ts`)

| Concept | On screen | Runtime term |
|---|---|---|
| Stream state | Running · Stopped · Starting · Degraded · Exited | running / stopped / failed |
| Run mode | Always on · Dev session · Manual | kept · attached · stopped |
| Output exposure | Internal · This machine · Public | internal · private · public |
| Step origin | Built-in · Python · Pack | built-in · Python node · pack |

## Components

- `components/stream/primitives.tsx` — `StatusIcon`, `StatusLabel`, `RunModeLabel`,
  `ExposureLabel`, `KindIcon`, `Meter`, `Sparkline`, `Preview`, `IconButton`, `PanelHeader`,
  `KeyValue`, `formatMemory`.
- `components/stream/Segmented.tsx` — the macOS segmented control.
- `components/live/LivePreview.tsx` — procedural stand-in for a live track.
- `components/brand/brand.tsx` — `TatolabMark`, `Mascot`.
- `components/ui/*` — shadcn (base-ui), restyled by the tokens.

## Layout

- **Window**: shadcn's inset sidebar, 256px, collapsing to an icon rail (⌘B) — header: app and
  machine switcher; groups: Workspace, Streams (grouped by machine, collapsible, "+" action),
  Prototype; footer: Settings, Docs · 44px title bar
  (sidebar toggle, back/forward, ⌘K search, theme, New stream) · 24px status bar (runtime,
  load, version — never relays).
- **Stream**: breadcrumb, title, status, machine, run mode, actions (Open project, Terminal,
  Stop/Start, Restart) · tabs **Overview · Graph · Logs · Stats · Inspect · Sharing**.
