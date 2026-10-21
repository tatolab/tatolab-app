# Tatolab desktop app: the final design spec

A frontend engineer ports this into `tatolab/tatolab-app` (vanilla TypeScript and CSS in an Electron window). The existing logic modules stay: status, the log follower, graph layout, the presentation rules, the uninstall sheet's state machine and the platform rules. The structure and styling change. Where this spec changes a logic module, it says exactly what changes and why (§13).

---

## 0. Decision

**Direction: calm-native, revised.** Both judges picked calm-native outright, so this is a consensus pick, not a split. Its strengths:

- no dots anywhere
- no editor chrome
- every state is a word, and only a failure is red
- grey selection, with blue kept sparing
- the most AA-honest dimmed text
- the most thorough Linux variant
- the calmest, most OrbStack-like feel

It takes these grafts:

| From | Graft | Where it lands |
|---|---|---|
| focused-split | The canvas over a docked live log, as the landing view of a loaded stream | §8.1 Graph |
| focused-split | The band reworked as title, tabs, an empty action slot and Search, with the tabs off the centre so step-10 actions have room | §7.3 |
| focused-split | A second sidebar line for a failed stream, giving its reason in text-2 (only the word "Failed" is red) | §7.2 |
| focused-split | A dashed ghost row in the empty sidebar: "Your first stream shows up here." | §8.4 |
| focused-split | Cancel as the safe default on the uninstall sheet | §8.7 |
| focused-split | The lower region as the place selection detail lives (Watch now, node and link detail at step 10) | §9, §12 |
| guided-devex | A "Built-in" or "Python" kind word in each node head | §7.6 |
| guided-devex | A facts list on the not-responding screen | §8.6 |
| guided-devex | An agent tip on the empty state | §8.4 |

**The owner's ruling (2026-10-12) overrides every tap and preview part of all three prototypes:**

- The app uses only what `list_streams`, `graph` (nodes, links, exposed ports with their level), logs and health give it. That is `getTatolabStatus`, `describeStreamGraph` and `readStreamLogRecords`, plus the existing local commands: `setRunTatolab`, `openLoginItemsSettings`, `setUpTatolab`, `quitTatolabApp` and `uninstallTatolab`.
- There is no tap, no exchange, no frame, no thumbnail and no sample. No new backend command and no new `TatolabBackend` method.
- Exposure levels are real data. They appear as words on output ports, in a strip on the canvas, and in an "Exposed outputs" list per stream.
- **Watch** (seeing an exposed output's frames) is where the architecture is going. It ships only as a placeholder behind the frontend flag `watch-exposed-output`, off by default, with no data source (§9).

**What this drops from calm-native, and why:**

| Dropped | Why |
|---|---|
| The live tap panel, the stats and the "Watch live" primary button | Owner ruling. The placeholder in §9 replaces it behind the flag. |
| The overview's frame thumbnail | It was a tap sample. |
| Node docstrings ("Synthetic SMPTE-style color-bar source…") | No contract field carries them. |
| The flow tree | It needed the docstrings, and it cannot draw fan-in. A flat node list in flow order replaces it (§8.3). |
| The graph and log tail of a stopped or failed stream ("As recorded when it last ran") | `describeStreamGraph` and `readStreamLogRecords` answer only for a loaded stream. |
| "Open Camera Settings ↗", "Show the runtime's log", "Restart Tatolab", "Show the log file", "Save PNG" and Fit | Each needs a backend command the app doesn't have (Fit has no zoom to undo). |
| The overview log tail | The landing view now shows the full log dock. |
| The toast | A copy button confirms in place (§7.10). |

---

## 1. Data the window shows

The window shows only the data below, and it derives everything else from it.

| Source | Fields used | Shown as |
|---|---|---|
| `TatolabStatus` (polled; `tatolab-status-changed`) | `platform`, `machine_name`, `runtime_state` with `run_tatolab` and `runtime_agent` (through `presentRuntimeStatus`), `streams[]` (`name`, `state`, `project_directory`, `node_count`, `failed_because`), `app_version`, `machine_setup_state`, `command_line_tool_linked_at` | the sidebar, the band, the runtime pages, Settings, setup |
| `StreamGraphSummary` (`describeStreamGraph`, polled every 2.5 s while shown) | `nodes[]` (`name`, `type`, `state`), `links[]` (`source_node`, `source_port`, `target_node`, `target_port`, `state`), `exposed[]` (`node`, `port`, `level`) | the canvas, the exposed strip, Overview |
| `StreamLogRecordsPage` (`StreamLogFollower`) | `records[]` (`host_ts_ns`, `level`, `source`, `target`, `message`, `attrs`), `records_no_longer_held` | the log dock |

Derived values. Each is a pure function with a test (§13):

- **A node's ports.** The graph lists no port inventory.
  - Inputs are the `target_port`s of the links into the node, in order of first appearance.
  - Outputs are the `source_port`s of the links out of it, in order of first appearance, then any `exposed` port not already listed.
  - An output port that is neither linked nor exposed is not drawn. Say so in the node tooltip: "Ports appear here once they are linked or exposed."
- **Kind word.**
  - A `type` starting with `tatolab.stream:` is "Built-in".
  - Any other `module:Class` type is "Python", because a `module:Class` import path is a Python processor in today's runtime.
  - A type with no colon gets no word.
- **Class name.** The part of `type` after `:`, or the whole `type` if there is none.
- **Exposed address.** `<machine>/<stream>/<node>/<port>`, the address the plan decides (ARCHITECTURE.md, "The address is `<machine>/<stream>/<node>/<port>`"). The machine segment is drawn in text-3. When `machine_name` is `null`, the address starts at `<stream>`.
- **Graph health line.** Built from node states and link states (§7.6).

---

## 2. How state reads, with no dots

This is the rule that governs the whole design. State is a word first. Weight, opacity and outline only reinforce it.

- **Red** means something failed and the user can act on it.
- **Amber** appears only on the log level word `warn` and on a warnings count.
- **Blue** means selection, focus, the one primary button, or (with the flag on) the output being watched.

Banned outright: coloured dots, traffic-light clusters, pills and badges, and status chips. That includes the existing app's port dots at link ends, the "Live" dot, the runtime pill dot and the skeleton dots.

| Thing | Normal | Quiet | Failure (the only red) |
|---|---|---|---|
| Runtime (sidebar machine block) | "Tatolab is running" in text-2 | "Tatolab is off", "Starting", "Needs approval" in text-2 | 14px alert icon + "Not responding", "Runtime missing" or "Not running" in red |
| Stream row (sidebar) | name in text; "Kept" or "Attached" right-aligned in text-3 | Stopped: the name drops to text-3, and the word reads "Stopped" | 14px alert icon + "Failed" in red; the name stays text; line 2 gives `failed_because` in text-2 |
| Stream title (band) | name + state word in text-2 | "Stopped" in text-3 | alert icon + "Failed" in red |
| Graph node | solid 1px `line-strong` outline on `surface-raised`, small shadow | Starting or Idle: dashed outline with a foot word. Paused: 62% opacity with a foot word | red 1px border + 1px red ring, alert icon + red name, red foot line |
| Link | 1.5px solid `link-stroke` with an arrowhead | pending or awaiting: dashed 4/4; ending: dashed at 45% | `error`: 1.5px solid red |
| Output port | its name; an exposed port has its level word ("private", "public") before the name | internal ports carry no word (internal is the default) | (none) |
| Log level | `info` as a plain word in text-2 | `trace` and `debug` in text-3 | `warn` amber 500, `error` red 500; rows are never tinted |
| Counts | "4 nodes running, 3 links wired" | "3 of 4 nodes running" | "1 node in error" in red; "1 error" in red and "1 warning" in amber on the log segments |

The macOS window controls are drawn by the system, never by the app.

---

## 3. Window, platforms and the traffic-light band

### Window
- The default window is 1040×700, and the minimum is 860×580. Verify every screen at 860×580, 1040×700 and 1440×900, in both themes, on both platforms.

### macOS overlay title bar
- Keep the existing chrome in `src-electron/src/platform/macos/main_window_chrome.ts` unchanged: `titleBarStyle: "hidden"`, `trafficLightPosition: { x: 18, y: 19 }`.
  - This centres the 12px buttons vertically in the 52px band, at x ≈ 18–70.
  - If a device screenshot shows the visible centre off y 26, change that constant and nothing in the CSS.
- **Band:** 52px tall across the full window width.
  - Over the sidebar it holds only the traffic lights.
  - Over the content it is the content band (§7.3).
  - Nothing interactive sits left of x 84 inside the band.
- **Drag regions:** keep the existing helper, `windowDragRegionAttribute(platform, reach)`.
  - The sidebar's band strip uses `"self"`.
  - The content band uses `"deep"`. Its buttons, segments and fields stay clickable.
  - On Linux the helper returns `null`, so there are no drag regions.

### Linux
- Native decorations sit outside the webview: no traffic lights and no overlay.
- The sidebar's top inset drops from 52px to 12px. The content band stays a 52px header and is not a drag region. Nothing else changes.
- Never draw a stand-in title bar. The prototypes drew one for screenshots only.

### Platform words
All of these come from `presentPlatform(platform)`:

| | macOS | Linux |
|---|---|---|
| this machine | This Mac / this Mac | This computer / this computer |
| shortcut modifier | `⌘` (`metaKey`) | `Ctrl` (`ctrlKey`) |
| kbd hint | `⌘K` | `Ctrl K`, one cap |
| tray | menu bar icon | tray icon |
| Login Items row | shown | absent |
| records directory | `~/Library/Application Support/Tatolab` | `~/.local/state/tatolab` |
| `tatolab` command | `/usr/local/bin/tatolab` | `~/.local/bin/tatolab` |
| runtime service | "the runtime" | `tatolabd.service` |
| what restarts it | macOS | systemd |

---

## 4. Layout grid and resize behaviour

```
┌ sidebar clamp(216px, 22vw, 256px) ┬ content ───────────────────────────────────────────────────┐
│ 52 band (traffic lights) / 12 Linux│ band 52: [name State] [Graph Logs Overview] ··· [actions] [Search ⌘K] │
│ machine block                      ├─────────────────────────────────────────────────────────────┤
│ Streams                        5   │ Graph tab:  canvas  (minmax(160px, 1fr))                    │
│ rows (28)                          │             ── splitter (1px line, 7px hit area) ──         │
│ …                                  │             log dock (default clamp(200px, 46%, 420px))     │
│ (scrolls)                          │ Logs tab:   log dock, full height                           │
│                                    │ Overview:   scrolling page, column max 760                  │
│ ⚙ Settings              ⌘,         │                                                             │
└────────────────────────────────────┴─────────────────────────────────────────────────────────────┘
```

### Shell grid
- `.tatolab-window`: `display: grid; grid-template-columns: var(--sidebar-width) minmax(0, 1fr); height: 100vh;`.
- `--sidebar-width: clamp(216px, 22vw, 256px)`.

### Sidebar
- A column flex: band strip (52px, or 12px on Linux), the machine block, then the scrolling section stack (`overflow: auto`, `flex: 1`). The Settings row is pinned at the bottom with 8px padding.

### Content
- A column flex: band (52px, with a 1px `line` bottom border), then the view (`flex: 1; min-height: 0`).

### Graph tab workspace
- `display: grid; grid-template-rows: minmax(160px, 1fr) var(--log-dock-height);` with the splitter laid over the boundary.
- **Default dock height:** `clamp(200px, 46% of workspace height, 420px)`.
- **Splitter:**
  - a 1px `line` with a 7px transparent hit area centred on it, `cursor: row-resize`
  - drag limits: the dock stays at least 120px, and the canvas stays at least 160px
  - a double-click resets to the default
  - the user's height persists in `localStorage["tatolab.logDockHeightPixels"]`, and is re-clamped on every window resize
  - keyboard: focusable (`role="separator"`, `aria-orientation="horizontal"`, `aria-valuenow`); ↑ and ↓ move it 16px

### Logs tab
- The same workspace, with the canvas collapsed (`display: none`) and the dock filling the height. The graph view stays mounted, so its polling and Overview counts carry on.

### Overview
- `overflow: auto`. Padding is 20px top, 24px sides and 28px bottom. At window width ≥1280: 24px top and 32px sides.
- The content column is at most 760px wide.

### Settings
- Same padding as Overview. The column is at most 640px.

### Centred pages (setup, runtime down, empty)
- **Runtime down and setup:** the column is at most 520px (600px on Linux setup, so the install command never truncates). It is centred horizontally, with top padding `max(40px, 10vh)` under the band.
- **Empty:** a two-column grid, `minmax(0, 1fr) 300px`, gap 32px. It becomes one column when the content is narrower than 720px.

### Computed sizes

| | 860×580 | 1040×700 | 1440×900 |
|---|---|---|---|
| sidebar | 216 | ≈229 | 256 |
| content | 644 | ≈811 | 1184 |
| workspace (below the band) | 528 | 648 | 848 |
| log dock (default) | 243 | 298 | 390 |
| canvas | 285 | 350 | 458 |
| `main` graph scale | 0.83 (column gap 32) | 1.0 (gap ≈53) | 1.0 (gap 72) |
| Search button | icon + kbd | full (176px) | full |

### Breakpoints

| Window width | Change |
|---|---|
| ≤960 | Search drops its label and becomes the magnifier plus kbd, 64px wide. Terminal-command descriptions in Overview ellipsize. The log `source` column narrows to 48px. |
| ≥1280 | Page padding grows to 24 top and 32 sides. |

### Graph fitting
- The graph area inside the canvas is padded 40 top, 44 bottom, 28 left and right.
- The graph is centred and scaled down only, never up: `scale = min(1, available width / graph width, available height / graph height)`.
- Below `SMALLEST_GRAPH_SCALE` (0.78, existing) the canvas scrolls (`overflow: auto`) at 0.78.

---

## 5. Tokens

### 5.1 Colour

This replaces `src/styles/tokens.css` wholesale. The theme is always set as `data-theme` on `<html>`, so there is exactly one dark block (§8.11 covers theme resolution).

```css
:root {
  --font-ui: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Ubuntu, Cantarell, "Noto Sans", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --band-height: 52px;
  --sidebar-width: clamp(216px, 22vw, 256px);
  --page-x: 24px;
  --page-top: 20px;
  --radius-kbd: 4px;      /* kbd */
  --radius-control: 6px;  /* buttons, rows, inputs, icon buttons */
  --radius-field: 7px;    /* search button, filter field, search rows */
  --radius-node: 8px;     /* segmented track, graph nodes */
  --radius-well: 10px;    /* wells, groups, failure block, placeholder frame */
  --radius-overlay: 12px; /* sheet, search */
  --ease: cubic-bezier(.2, .7, .2, 1);
}
[data-platform="linux"] { --band-strip-height: 12px; }
[data-platform="macos"] { --band-strip-height: 52px; }

:root[data-theme="light"] {
  color-scheme: light;
  --window: #ffffff;
  --sidebar: #f3f3f5;
  --divider: #e2e2e6;             /* sidebar edge */
  --surface: #f8f8fa;             /* wells, groups */
  --surface-raised: #ffffff;      /* graph nodes */
  --overlay: #ffffff;             /* sheet, search */
  --canvas: #fafafb;              /* graph canvas */
  --field: #ffffff;
  --line: rgba(0, 0, 0, .08);
  --line-strong: rgba(0, 0, 0, .14);
  --line-dashed: rgba(0, 0, 0, .24);   /* dashed outlines: starting nodes, ghost row, placeholder frame */
  --link-stroke: rgba(0, 0, 0, .45);   /* 3.3:1 on canvas, meets 3:1 non-text */
  --text: #1d1d1f;                /* 16.8:1 on window */
  --text-2: #57575e;              /* 7.2:1 window, 6.5:1 sidebar */
  --text-3: #6b6b72;              /* 5.3:1 window, 4.8:1 sidebar */
  --accent: #2a5bff;
  --accent-fill: #2a5bff;         /* white label 5.2:1 */
  --accent-text: #2a5bff;
  --accent-soft: rgba(42, 91, 255, .09);
  --accent-line: rgba(42, 91, 255, .85);
  --text-selection: rgba(42, 91, 255, .2);
  --red: #c4232d;                 /* 5.8:1 window, 4.5:1 on a selected sidebar row */
  --red-line: rgba(196, 35, 45, .85);
  --amber: #8f5f00;               /* 5.5:1 window */
  --hover: rgba(0, 0, 0, .04);
  --selected: rgba(0, 0, 0, .065);
  --seg-bg: rgba(0, 0, 0, .055);
  --seg-on: #ffffff;
  --seg-shadow: 0 1px 2px rgba(0, 0, 0, .12), 0 0 0 .5px rgba(0, 0, 0, .06);
  --btn-bg: #ffffff;
  --btn-hover: #f6f6f7;
  --btn-border: rgba(0, 0, 0, .13);
  --btn-shadow: 0 .5px 1px rgba(0, 0, 0, .08);
  --switch-off: #dcdce0;
  --knob-shadow: 0 1px 2px rgba(0, 0, 0, .22), 0 0 0 .5px rgba(0, 0, 0, .06);
  --shadow-node: 0 1px 2px rgba(0, 0, 0, .06);
  --shadow-pop: 0 18px 48px rgba(0, 0, 0, .16), 0 2px 6px rgba(0, 0, 0, .07), 0 0 0 .5px rgba(0, 0, 0, .12);
  --scrim: rgba(28, 28, 32, .18);
  --focus: 0 0 0 3px rgba(42, 91, 255, .32);
  --scrollbar-thumb: rgba(0, 0, 0, .22);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --window: #1e1e20;
  --sidebar: #262629;
  --divider: #0f0f11;
  --surface: #242427;
  --surface-raised: #2c2c30;
  --overlay: #2a2a2e;
  --canvas: #1b1b1d;
  --field: rgba(255, 255, 255, .045);
  --line: rgba(255, 255, 255, .075);
  --line-strong: rgba(255, 255, 255, .13);
  --line-dashed: rgba(255, 255, 255, .22);
  --link-stroke: rgba(255, 255, 255, .38);  /* 3.6:1 on canvas */
  --text: #ececef;                /* 14.1:1 window */
  --text-2: #a3a3aa;              /* 6.6:1 window, 6.0:1 sidebar */
  --text-3: #939399;              /* 5.5:1 window, 4.9:1 sidebar, 4.6:1 raised */
  --accent: #4c7dff;              /* focus ring base, watched link */
  --accent-fill: #3a66ff;         /* white label 4.6:1 (#4c7dff would be 3.7:1) */
  --accent-text: #7c9bff;         /* 6.3:1 window */
  --accent-soft: rgba(76, 125, 255, .15);
  --accent-line: rgba(124, 155, 255, .75);
  --text-selection: rgba(76, 125, 255, .35);
  --red: #ff7a70;                 /* 6.6:1 window, 4.6:1 on a selected sidebar row */
  --red-line: rgba(255, 122, 112, .7);
  --amber: #f2b24c;               /* 8.9:1 window */
  --hover: rgba(255, 255, 255, .045);
  --selected: rgba(255, 255, 255, .085);
  --seg-bg: rgba(255, 255, 255, .06);
  --seg-on: rgba(255, 255, 255, .15);
  --seg-shadow: 0 1px 1px rgba(0, 0, 0, .3);
  --btn-bg: rgba(255, 255, 255, .08);
  --btn-hover: rgba(255, 255, 255, .12);
  --btn-border: rgba(255, 255, 255, .06);
  --btn-shadow: 0 .5px 0 rgba(255, 255, 255, .04) inset;
  --switch-off: #48484d;
  --knob-shadow: 0 1px 2px rgba(0, 0, 0, .4);
  --shadow-node: 0 1px 2px rgba(0, 0, 0, .35);
  --shadow-pop: 0 24px 64px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .35), 0 0 0 .5px rgba(255, 255, 255, .1);
  --scrim: rgba(0, 0, 0, .4);
  --focus: 0 0 0 3px rgba(76, 125, 255, .5);
  --scrollbar-thumb: rgba(255, 255, 255, .2);
}
```

Fixed colours:
- The brand mark is flat `#2a5bff` with a white T (no gradient). Replace the gradient in today's `TATOLAB_FILLED_MARK_SVG`.
- The traffic lights are drawn by macOS.

These values differ from the calm-native prototype on purpose, to close the AA gaps the judges measured:
- light text-3 `#77777e` → `#6b6b72`
- dark text-3 `#86868e` → `#939399`
- dark red `#ff6b61` → `#ff7a70`
- `link-stroke` .32/.30 → .38/.45
- light `red-line` and `accent-line` → .85

New: `line-dashed`. Removed: `preview-bezel` and `linux-titlebar`.

### 5.2 Type

- **UI font:** `--font-ui` (the system font), base 13px, `-webkit-font-smoothing: antialiased`.
- **Mono:** JetBrains Mono through `@fontsource/jetbrains-mono` at 400, 500 and 600, with `font-variant-ligatures: none`.
- **What is mono:** names, types, ports, paths, commands, addresses and logs. Everything else is the system font.
- **Instrument Sans:** removed. No wordmark is drawn, so drop the `@fontsource/instrument-sans` imports and the dependency.
- **Case:** nothing is uppercase, and there are no micro-headers. Hierarchy comes from weight and colour (text, text-2, text-3), never from size jumps.

| Role | Size/line | Weight | Font |
|---|---|---|---|
| Screen heading (setup, runtime down, empty) | 20/26, letter-spacing −0.01em | 600 | UI |
| Sheet title, search input | 15/20 | 600 / 400 | UI |
| Stream name in the band | 14/20 | 600 | mono |
| Page name in the band ("Settings") | 14/20 | 600 | UI |
| Body, buttons, settings row titles | 13/18 (Overview story 13/20) | 400 / 500 | UI |
| Section heading | 13/18 | 600 | UI |
| Segmented control, search button text | 12.5 | 500 / 400 | UI |
| Secondary text, state words, descriptions | 12/16–17 | 400 | UI |
| Sidebar stream name | 12/16 | 400 (500 selected) | mono |
| Machine name (sidebar) | 12.5/18 | 600 | mono |
| Graph node name, Overview node name | 12.5/18 | 600 / 500 | mono |
| Logs, commands, addresses | 12/20 (logs), 12/18 | 400 | mono |
| Ports, types, paths | 11.5/16 (port rows 11.5/22) | 400 | mono |
| Node class line, exposure word on a port | 11/16 | 400 | mono / UI |
| Sidebar failure reason | 11.5/15 | 400 | UI |
| kbd | 11/16 | 500 | UI, tabular figures |

### 5.3 Spacing, radii, borders, elevation, layers

- **Grid.** 4px base. The steps in use are 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32 and 40. Sections are 20px apart; inside a well the gaps are 10–14px; sidebar rows sit 1px apart.
- **Radii.** As the tokens in §5.1 name them. The bigger the surface, the rounder the corner. The switch knob is the only circle in the UI.
- **Borders.**
  - Hairlines are 1px `line`.
  - Objects you read as objects use `line-strong`: nodes, kbd, buttons.
  - Dashed (`line-dashed`, 4/4 on SVG) means starting, not there yet, or a ghost.
  - A 1.5px outline means selected (accent) or failed (red). Build it as a 1px border plus a `0 0 0 1px` ring, so nothing shifts.
- **Elevation.** Flat by default. Graph nodes use `--shadow-node`. Only the sheet and Search use `--shadow-pop`. No glass, no blur, no gradients and no masks.
- **Layers (z-index).** Band 10; splitter 5; scrim 90; sheet and Search 100.
- **Scrollbars (WebKit).** 10px wide, a `--scrollbar-thumb` thumb with a 3px transparent border, radius 5, and no track.
- **Selection.** `::selection { background: var(--text-selection); }`. Chrome is `user-select: none`; names, paths, logs, reasons and addresses carry the existing `selectable-text` class.

---

## 6. Icons

All icons are inline SVG on a 24-unit `viewBox`, drawn at 16px (14px where noted): `fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`, with class `line-icon`. They replace every export in `src/icons.ts`.

Delete these exports:
- `EXPOSED_PORT_ICON_SVG`: it is radio waves around a filled dot.
- `RUNTIME_STATE_FIGURE_SVG`: it is an orbit ring.
- `TATOLAB_OUTLINED_MARK_SVG`
- `STREAMS_NAVIGATION_ICON_SVG`
- `SETTINGS_NAVIGATION_ICON_SVG`, which the gear replaces
- `WARNING_ICON_SVG`: a warning triangle reads as amber.
- `STREAM_STOPPED_ICON_SVG` and `STREAM_NOT_LOADED_ICON_SVG`: state is a word.

| Export | Used for | Paths (24 viewBox) |
|---|---|---|
| `MACHINE_ICON_SVG` | machine block | `<path d="M5 5.5h14a1 1 0 0 1 1 1V16H4V6.5a1 1 0 0 1 1-1Z"/><path d="M2 19h20"/>` |
| `GEAR_ICON_SVG` | Settings row | `<path d="M18.69 9.95 21.03 10.24 21.03 13.76 18.69 14.05 18.18 15.29 19.63 17.14 17.14 19.63 15.29 18.18 14.05 18.69 13.76 21.03 10.24 21.03 9.95 18.69 8.71 18.18 6.86 19.63 4.37 17.14 5.82 15.29 5.31 14.05 2.97 13.76 2.97 10.24 5.31 9.95 5.82 8.71 4.37 6.86 6.86 4.37 8.71 5.82 9.95 5.31 10.24 2.97 13.76 2.97 14.05 5.31 15.29 5.82 17.14 4.37 19.63 6.86 18.18 8.71Z"/><circle cx="12" cy="12" r="3"/>` |
| `SEARCH_ICON_SVG` | Search button, filter field (14px) | `<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>` |
| `COPY_ICON_SVG` | copy buttons | `<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>` |
| `CHECK_ICON_SVG` | copied | `<path d="M19.5 6.5 9.5 17 4.5 12"/>` |
| `ALERT_ICON_SVG` | every failure (14px inline, 16px in blocks, 20px beside headings) | `<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.25"/><path d="M12 16.4v.1"/>` |
| `EYE_ICON_SVG` | Watch (flag only) | `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>` |
| `CLOSE_ICON_SVG` | close Watch, close the Linux sheet | `<path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/>` |
| `TERMINAL_ICON_SVG` | uninstall and setup rows; Search "Copy" rows | `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 2.75 2.5-2.75 2.5"/><path d="M13 15h3.5"/>` |
| `LOCK_ICON_SVG` | setup row and password note (14px) | `<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>` |
| `POWER_ICON_SVG` | setup and uninstall rows; runtime-off page heading | `<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>` |
| `TRASH_ICON_SVG` | uninstall row | `<path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l.9 11.6a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/>` |
| `FOLLOW_ICON_SVG` | log dock "Following" | `<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 19.5h14"/>` |
| `ARROW_DOWN_ICON_SVG` | "n new lines" jump button (14px) | `<path d="M12 5v13.5"/><path d="m6.5 13 5.5 5.5 5.5-5.5"/>` |
| `GRAPH_ICON_SVG` | Search "Go to Graph" | `<rect x="3" y="9.5" width="6" height="5" rx="1.5"/><rect x="15" y="4" width="6" height="5" rx="1.5"/><rect x="15" y="15" width="6" height="5" rx="1.5"/><path d="M9 12h2.5a1.5 1.5 0 0 0 1.5-1.5v-2A1.5 1.5 0 0 1 14.5 7H15M13 12v3.5a1.5 1.5 0 0 0 1.5 1.5H15"/>` |
| `LOGS_ICON_SVG` | Search "Go to Logs" | `<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"/>` |
| `OVERVIEW_ICON_SVG` | Search "Go to Overview" | `<rect x="4" y="4.5" width="16" height="15" rx="2.5"/><path d="M8 9.5h8M8 13h8M8 16.5h5"/>` |
| `STREAM_ICON_SVG` | Search stream rows | `<path d="M3.5 12h4l2.5-5 4 10 2.5-5h4"/>` |
| `KEPT_RECORDS_ICON_SVG` | uninstall "records stay" note | `<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="m9 13 2 2 4-4"/>` |
| `TATOLAB_MARK_SVG` | setup (52px), uninstall sheet (44px) | `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2a5bff"/><path d="M19 22h26M32 22v23" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/></svg>` (no `line-icon` class) |

The `‹ › ↑ ↓ ↵` glyphs in text are characters, not icons. The spinner is CSS (§7.11).

---

## 7. Components

### 7.1 Machine block (sidebar, top)

- **Box.** Grid `16px | 1fr`, column gap 9, row gap 1; margin `0 8px 6px`; padding `7px 8px 8px`. It is not interactive.
- **Line 1.** `MACHINE_ICON_SVG` in text-2, then `machine_name` in mono 12.5/18 600, ellipsized. A `null` name shows `presentPlatform().thisMachineAtSentenceStart`.
- **Line 2 (column 2).** The runtime sentence, 12/16:
  - `running` reads "Tatolab is running".
  - `switched_off` reads "Tatolab is off".
  - Every other display state reads `presentRuntimeStatus().shortLabel`: "Starting", "Not responding", "Needs approval", "Runtime missing" or "Not running".
  - Colour: text-2, except `tone === "error"`, which is red with a 14px `ALERT_ICON_SVG` before it (gap 5).
- **Accessibility.** `aria-label` keeps today's sentence ("Runtime running on jonathanf-macbook").

### 7.2 Sidebar streams section

- **Section head.** "Streams", 12/16 600 text-3, padding `12px 16px 5px`. The count is right-aligned, weight 400 and tabular. It is hidden while the runtime isn't running or the list is empty.
- **List.** Padding `0 8px`; rows sit 1px apart; `role="list"`. Each row is a `button` with `aria-current="true"` when selected, using a roving `tabindex` (§10).
- **Row** (`StreamListView`), 28px tall, padding `0 8px`, radius 6, gap 8:
  - name: mono 12/16 400 text, ellipsized
  - state word: `presentStreamState().label`, 12 UI text-3, right-aligned
  - tooltip (`title`):
    - Kept: "Kept: Tatolab loads it every time the runtime starts, until you stop it."
    - Attached: "Attached: it runs while the terminal that started it does."
    - Stopped: "Stopped: remembered, not loaded. `tatolab start <name>` loads it."
    - Failed: the full `failed_because`.
- **Row emphasis** (from `presentStreamState().emphasis`, §13):
  - `plain` (kept, attached, unknown): as above.
  - `quiet` (stopped): the name in text-3.
  - `failure` (failed): the state reads "Failed" in red, with a 14px alert icon (gap 4). The row grows: padding `6px 8px`, then a second line with `failed_because` in UI 11.5/15 text-2, clamped to 2 lines (`-webkit-line-clamp: 2`). The name stays text.
- **Interaction states:**
  - Hover: `--hover` fill.
  - Selected: `--selected` fill (grey, never blue); the name goes to 500; the state word lifts to text-2 (a failed one stays red).
  - Focus-visible: `box-shadow: var(--focus)`.
- **Empty and not-running copy** (12/17 text-3, padding `4px 16px`):
  - Runtime running, zero streams: the ghost row (§8.4), then "Your first stream shows up here."
  - Runtime not running: "Your streams show up here while Tatolab runs."
  - Running but `streams === null`: "Couldn't list the streams. Asking again…"
- **Reserved, not built:** the sharing step adds a second section under Streams ("Machines": other tailnet machines and their public outputs) with the same head and row anatomy. The scrolling section stack exists so it can be added without a layout change. Draw nothing now.

### 7.3 Content band

- **Grid.** `grid-template-columns: auto auto minmax(0, 1fr) auto auto` holds title, tabs, spacer, the actions slot and Search. Column gap 16; padding `0 14px 0 20px`; height 52; a 1px `line` bottom border; `data-window-drag-region` as in §3.
- **Title cluster.** Flex, baseline-aligned, gap 10.
  - For a stream: the name in mono 14/20 600 (ellipsis, `max-width: 32vw`, `title` = the full project path) and the state word at 12. The word is text-2; text-3 when quiet; red with a 14px alert icon when it is a failure.
  - For Settings: "Settings" in UI 14/20 600.
  - For the empty, runtime and not-listed pages: the machine name in mono 14/600 plus `Tatolab <app_version>` in 12 text-3.
- **Tabs.** The segmented control (§7.4): Graph, Logs, Overview, with tooltips "Graph (⌘1)", "Logs (⌘2)", "Overview (⌘3)".
  - It shows only when a stream is selected and loaded (`streamNotLoadedReason(stream) === null`).
  - A stream that isn't loaded shows no tabs. Its body is the Overview, because it has nothing else.
- **Actions slot.** `<div class="band-actions" data-slot="stream-actions"></div>`. It is empty now and takes no width (§12).
- **Search button.** 28px tall, `min-width: 176px`, radius 7, `--field` fill with a 1px `line` border (`line-strong` on hover). It holds a 16px magnifier in text-3, "Search" (12.5 text-3) and the kbd hint pushed right. At ≤960px it shows only the icon and kbd. It opens Search (§7.13).

### 7.4 Segmented control

- **Track.** `--seg-bg`, radius 8, padding 2, gap 2. `role="tablist"`.
- **Segments.** 24px tall, padding `0 13px`, radius 6, 12.5/500 text-2. `role="tab"`, `aria-selected`.
  - Hover: the label goes to text.
  - Selected: `--seg-on`, `--seg-shadow`, text.
  - Switching is instant.
- **Small variant (log levels).** 22px segments, padding `0 10px`, 12/500. A count follows the label, 400 text-3 and tabular, hidden at 0. The Errors count is red and the Warnings count amber; the labels stay text-2.

### 7.5 Buttons, kbd, switch and fields

- **Button.**
  - Base: 28px tall, padding `0 12px`, radius 6, 13/500, 6px between icon and label; `--btn-bg`, a 1px `--btn-border`, `--btn-shadow`; text.
  - Hover: `--btn-hover`. Disabled: 50% opacity, `cursor: default`.
  - Small: 24px tall, padding `0 9px`, 12/500.
- **Variants:**
  - **Primary:** `--accent-fill`, white label, `0 .5px 1px rgba(0,0,0,.15)`; hover `filter: brightness(1.08)`. At most one per screen: "Set Up Tatolab…", "Turn On Tatolab", "Open Login Items…" (on the approval page).
  - **Destructive:** a secondary button with a red label ("Uninstall Tatolab…", "Uninstall"). Never filled red.
  - **Plain:** transparent, text-2; hover adds the fill and text.
  - **Icon button:** 28×28 (small 24×24), radius 6, a 16px icon in text-2; hover adds the fill and text. Always carries an `aria-label`.
- **Link.** 12 accent-text; underline on hover (offset 2). An optional kbd after it stays text-3.
- **kbd.**
  - 18px tall, `min-width: 20px`, padding `0 5px`, radius 4, a 1px `line-strong` border, 11/500 UI text-3, tabular.
  - macOS shows `⌘K`, `⌘,`, `⌘F`, `⌘1`. Linux shows `Ctrl K` in one cap.
  - Produce the text from the platform: add `shortcutHint(platform, key)` to `platform_presentation.ts` (§13).
- **Switch.** A 38×22 track (radius 11) with an 18px white knob at `2px 2px` and `--knob-shadow`.
  - Off: `--switch-off`. On: `--accent-fill`, with the knob at `translateX(16px)`, 160ms `--ease`.
  - `role="switch"`, `aria-checked`. While its command runs it is disabled at 60% opacity.
- **Field (filter).** 28px tall, radius 7, `--field`, a 1px `line` border, padding `0 5px 0 9px`; a 14px magnifier in text-3; input 12.5 text with a text-3 placeholder; the kbd at the right, hidden while the field has text.
  - Focus: border `--accent-line` plus `--focus`.
  - Esc clears it first; a second Esc blurs it.

### 7.6 Graph canvas and nodes

#### Rendering
- Nodes are HTML, not SVG, so port rows can be real buttons. Port this from calm-native `graphTabHTML` and `layoutGraph`.
- The structure is `.canvas` (`position: relative`, `--canvas` fill, no grid, no dots), then `.graph-world` (absolutely positioned, `transform: translate(x, y) scale(s)`, `transform-origin: 0 0`). It contains an SVG link layer, then the node elements at the positions `layOutStreamGraph` returns.

#### Canvas overlays
- **Top-left (left 24, top 12), 12/16 text-3:** the graph health line.
  - All running and wired: "4 nodes running, 3 links wired".
  - Otherwise: "3 of 4 nodes running, 2 of 3 links wired".
  - If any node is in `Error`: append ", 1 node in error" with that clause in red.
  - Zero links: drop the links clause.
- **Top-right (right 12, top 8):** the project path, `abbreviateHomeDirectory(project_directory)`, mono 11.5 text-3 (`selectable-text`), then a small copy icon button (`aria-label` "Copy the project path").
- **Bottom-left (left 24, bottom 12, max-width `calc(100% − 48px)`): the exposed strip**, 12/16.
  - "Exposed" in text-3, then the address in mono 11.5 text-2 (the machine segment text-3), then the level word capitalised in text-3.
  - With several exposed ports, the first is shown, then "and 2 more", which is a link to Overview (⌘3).
  - With none: "Nothing exposed. Every output is internal to main." in text-3.
  - Exposed entries listed at level `internal` are not counted here.
  - With the flag on, a private or public address is a button: hover gives text and an underline; click opens Watch.

#### Node anatomy (all sizes in layout pixels)
- **Width:** `clamp(measured, 216, 288)`, where measured = max(name width, class plus kind width, widest port row) + 24 padding.
  - Name width uses mono 12.5 at 0.6em per glyph (`MONOSPACE_ADVANCE_PER_FONT_SIZE`).
  - Port rows use mono 11.5, plus the level word at 0.56em per character of 11px UI, plus a 6px gap.
  - Every column shares its widest node's width.
- **Box:** radius 8, `--surface-raised`, a 1px `line-strong` border, `--shadow-node`. `title` = the full `type` plus "Ports appear here once they are linked or exposed."
- **Head (48px, padding `8px 12px 0`, hairline below):**
  - line 1: the name in mono 12.5/18 600, ellipsized
  - line 2 (a flex row): the class name in mono 11/16 text-3, ellipsized; then, right-aligned, the kind word ("Built-in" or "Python") in UI 11/16 text-3
- **Ports (padding `4px 0`):** rows 22px tall, padding `0 12px`, mono 11.5/22 text-2.
  - Inputs come first, left-aligned.
  - Outputs follow, right-aligned. An exposed output has its level word before the name ("private" or "public" in UI 11 text-3, gap 6).
  - A node with no linked or exposed ports draws no ports block.
- **Foot (optional, padding `0 12px 8px`, 11.5/15 UI):** the word for a non-running state.

#### Node states
These come from the node's `state` string (replace `toneOfGraphNodeState` with `presentGraphNodeState`, §13).

| `state` | Look | Foot |
|---|---|---|
| `Running` | as above | none |
| `Pending` | border dashed (`line-dashed`), fill kept, full opacity | "Starting…" in text-3 |
| `Idle` | border dashed, transparent fill, no shadow | "Idle" in text-3 |
| `Paused` | solid, 62% opacity | "Paused" in text-3 |
| `Error` | `border-color: var(--red-line); box-shadow: 0 0 0 1px var(--red-line), var(--shadow-node)`; name in red with a 14px alert icon before it (gap 6) | "In error. The reason is in the logs." in red, as a button: it sets the dock's level segment to Errors and, from the Logs tab or Overview, switches to Graph |
| `null` | as Running | none |
| anything else (newer than the app) | as Running | the raw state in text-3 |
| outside this stream (`isInThisStream === false`) | transparent fill, a 1px `line` solid border, no shadow; name in text-2; line 2 "In another stream" in text-3; no kind word | none |
| with the flag on, holding the watched port | `border-color: var(--accent-line); box-shadow: 0 0 0 1px var(--accent-line)` | (as its state) |

#### Output port rows
- **Flag off:** plain `li`s, not focusable, no hover.
- **Flag on, private or public port:** a `button` with `aria-pressed`, `title` "Watch `<address>`".
  - Hover: `--hover` fill, text, and a 13px `EYE_ICON_SVG` before the level word.
  - Watched: `--accent-soft` fill, the label in text 500, `box-shadow: inset 2px 0 0 var(--accent)`, the eye and the level word in accent-text.
- **Flag on, internal port:** a `button` that opens the internal state of the Watch surface (§9), `title` "Internal: only `<stream>`'s own nodes read it." Hover gives the fill, but no eye icon.

#### Links (SVG layer behind the nodes)
- **Path:** `M x1 y1 C x1+dx y1, x2−dx y2, x2−5 y2`, with `dx = max(26, (x2 − x1) / 2)`.
  - x1 is the source node's right edge and y1 the centre of its output port row.
  - x2 is the target node's left edge and y2 the centre of its input port row.
- **Arrowhead:** a filled triangle, `M x2−6 y2−4 L x2 y2 L x2−6 y2+4 Z`.
- **Hit path:** a transparent path over each link (stroke-width 10, `pointer-events: stroke`) carries the `<title>`: "`source.port` → `target.port`" plus the state sentence.
- No port circles or dots at link ends. No ambient animation (delete the existing pulse).

| `link.state` | Stroke | Tooltip sentence |
|---|---|---|
| `wired` | 1.5px `link-stroke`, solid | "Wired" |
| `pending` | dashed 4/4 | "Wiring…" |
| `awaiting_remote` | dashed 4/4 | "Waiting for `<source_node>` to be exposed" |
| `error` | 1.5px red, solid; red arrowhead | "This link failed" |
| `disconnecting`, `disconnected` | dashed 4/4 at 45% opacity | "Disconnecting" / "Disconnected" |
| flag on, out of the watched port | 2px `--accent`, accent arrowhead, static | (as its state) |

#### Canvas messages (replacing the drawing; centred; 12/18)
- A read failure: a 16px red alert icon plus "Couldn't read this stream's graph." in text, with the reason in mono 11.5 text-3 under it (`selectable-text`).
- An empty graph: "This stream's graph has no nodes yet." in text-3.

### 7.7 Log dock (`StreamLogConsoleView`)

- **Header.** 40px, padding `0 12px 0 24px`, gap 10, a 1px `line` bottom border. In order:
  1. "Logs" (13/600). Hidden in the Logs tab, where the band already says it.
  2. The small segmented control: All, Warnings ⟨n⟩, Errors ⟨n⟩ (§13 has the ranks).
  3. A spacer.
  4. The follow state:
     - Following: the 14px follow icon and "Following" in 12 text-3, not a button.
     - Scrolled up while lines arrive: a small plain button in accent-text with a 14px down arrow and "12 new lines". Clicking it or pressing End jumps to the end and resumes following. This is today's `jumpToLatestButton`.
  5. The filter field: 200px wide (240px in the Logs tab), placeholder "Filter by text or key=value", kbd `⌘F`.
- **List.** `overflow: auto`, padding `6px 12px 12px 24px`, `selectable-text`. It holds the newest 2,000 lines (existing `MOST_LOG_LINES_HELD`) and keeps following while within 16px of the end (existing).
- **Line.**
  - A grid of `96px 46px 56px minmax(0, 1fr)`, column gap 8, mono 12/20, 1px vertical padding.
  - Columns: time (`formatLogRecordTime`, text-3, tabular, with a `title` from `formatLogRecordDateTime`); level word; source (`rust` or `python`, text-3, `title` = the target); then the message in text, wrapping (`overflow-wrap: anywhere`).
  - Each attr follows the message as ` key=value`: the key and `=` in text-3, the value (`formatLogAttrValue`) in text-2.
  - Hover gives no fill, so it reads calmly.
- **Levels.**

  | Level | Word |
  |---|---|
  | `trace`, `debug` | text-3 |
  | `info` and unknown levels | text-2 |
  | `warn` | amber 500 |
  | `error` | red 500 |

  Rows are never tinted, and there are no left bars.
- **Divider** (existing `appendDivider`; the follower writes its text): a centred row in 11.5 text-3 between two hairlines. The follower's two messages are "312 earlier records are no longer held by the runtime" and "Loaded again at HH:MM:SS.mmm. Showing records from this load." Both stay as they are.
- **Read failure** (existing `readFailureNotice`): a row at the top of the list with a 14px red alert icon and "Couldn't read new lines: ⟨reason⟩. Trying again." The text is text-2; only the icon is red.
- **Empty list:** the existing "Reading logs…" in 12 text-3.
- **No matches:** "No lines match “⟨filter⟩”." in 12 text-3.

### 7.8 Wells, rows and command rows

- **Well:** `--surface`, a 1px `line` border, radius 10. Rows inside are separated by 1px `line`.
- **Section head:** flex, baseline-aligned, gap 10, margin-bottom 8. An h2 at 13/18 600; meta at 12 text-3; an optional link on the right (accent-text 12 plus a kbd).
- **Command row (inside a well):**
  - 40px tall, padding `0 6px 0 14px`, a grid of `auto auto minmax(0, 1fr) auto`, gap 10.
  - `$` in mono 12 text-3; the command in mono 12 text (`selectable-text`, no wrap); its description in 12 text-2, ellipsized, hidden at ≤960 when it would collide; then a copy icon button (small).

### 7.9 Failure block

- **Box:** `--surface`, a 1px `--red-line` border, radius 10, padding `12px 14px`, a grid of `16px | 1fr`, gap 10.
- **Contents:**
  - a 16px red alert icon
  - "Failed at its last start" in 13/18 600 red
  - `failed_because` verbatim in 13/20 text (`selectable-text`). It is the runtime's own voice; never paraphrase it.
  - an actions row (margin-top 8): "Retry it with" in 12 text-2, then `tatolab start <name>` in mono 12 text, then a copy icon button (small)
  - when `describeStreamGraph` refused (existing behaviour): "The runtime says" in 12 text-3, then the refusal in mono 11.5 text-3 (`selectable-text`)

### 7.10 Copy button (`copy_button.ts`)

- A small icon button (24×24) with `COPY_ICON_SVG` in text-3 and `aria-label` "Copy ⟨what⟩".
- On click it writes to the clipboard, then swaps to `CHECK_ICON_SVG` in accent-text for 1.2s. An `aria-live="polite"` region says "Copied".
- No toast.
- `createTerminalCommand` renders the command row (§7.8) when it sits inside a well, and a standalone command well (36px, radius 10, `--surface`, padding `0 6px 0 12px`) on the empty and setup screens.

### 7.11 Spinner

- A 13px ring: a 1.5px `line-strong` circle with a text-2 quarter arc, rotating 900ms linear.
- Under `prefers-reduced-motion` it stops on the arc at 45°.
- Used only where something is in progress: "Starting the runtime", setup waiting for the password, uninstalling, Linux waiting for the service, "Still asking", and the empty state's "as soon as the runtime loads it".
- Never next to a running state.

### 7.12 Settings row and group

- **Group:** a group title (13/18 600, margin `20px 0 8px`; 0 above the first), then a well.
- **Row:** min 44px tall, padding `10px 14px`, a grid of `minmax(0, 1fr) auto`, column gap 20.
  - The title is 13/18 500 text; the description 12/17 text-2, max 56ch.
  - The control or value sits right and is vertically centred. A value is 12.5 text-2, mono for paths and names.
- **Failure line under a row:** a 14px red alert icon plus the text in 12 text-2, inside the row (for example a refused uninstall or a failed switch).

### 7.13 Search (⌘K)

This is navigation only; it runs no actions (§12, §15).

- **Overlay:** `--overlay`, 560px wide (max `calc(100% − 48px)`), 84px from the window top, radius 12, `--shadow-pop`, over a `--scrim` covering the whole window.
- **Input row:** 48px tall, a 16px magnifier, input 15/20, placeholder "Search streams, outputs and views", an `esc` kbd at the right.
- **List:** max height `min(420px, 100vh − 220px)`, scrolling.
  - Group labels: 12/16 600 text-3, padding `8px 14px 4px`.
  - Rows: 34px tall, radius 7, padding `0 10px`, gap 10, a 16px icon in text-3.
  - Selected row: `--accent-soft` fill, the icon in accent-text, secondary text lifted to text-2.
- **Groups**, in order. A row matches when its label contains the query, case-insensitive.
  1. **Streams:** `STREAM_ICON_SVG`, the name in mono 12.5, the project path in mono 11.5 text-3, and the state word at the right (Failed in red with its icon). Enter selects the stream.
  2. **Exposed outputs** (loaded streams): the address in mono 12 and the level word in text-3. Enter selects the stream, switches to Overview and focuses that row.
  3. **Watch** (flag on only): each private or public output. Enter opens Watch on it.
  4. **Go to:** Graph ⌘1, Logs ⌘2, Overview ⌘3 (for the selected stream, when loaded) and Settings ⌘,, each with its icon and kbd.
  5. **Copy:** `tatolab logs --stream <selected> -f` and the selected stream's project path, with `TERMINAL_ICON_SVG`. Enter copies.
- An empty query shows Streams and Go to only.
- **Footer:** 32px tall, a 1px `line` top border, 11.5 text-3: "↑↓ Move ↵ Open esc Close".
- **Keys:** ↑ and ↓ move (wrapping); Enter opens; Esc closes. ⌘K toggles it.
- **Focus:** on close, focus returns to the element that opened it.
- **Room for step 10:** a "Stream" actions group (Stop main, Start pattern-two, Expose a port…) goes after Go to, with no new chrome.

---

## 8. Screens

### 8.1 Main: a loaded stream, Graph tab (the landing view)

These are the brief's screen (1) and the brief's content.

- **Sidebar:**
  - machine block: `jonathanf-macbook` / "Tatolab is running"
  - Streams 5:
    - `main` Kept (selected)
    - `camera` Kept
    - `attached-demo` Attached
    - `pattern-two` (text-3) Stopped
    - `lobby-recorder` ⓘ Failed (red), with line 2 "the stream's CameraSource could not open camera 0x1420000: camera access is denied…" in text-2, two lines
  - Settings `⌘,` pinned at the bottom
- **Band:** `main` Kept · [**Graph** Logs Overview] · (empty actions slot) · [⌕ Search ⌘K].
- **Canvas:**
  - top-left: "4 nodes running, 3 links wired"
  - top-right: `~/streams/pattern` with copy
  - the graph in three columns:
    - `testpatternsource`, TestPatternSource, Built-in: output `video`
    - `invertingeffect`, InvertingEffect, Python: input `video_from_upstream`; output `private video_to_downstream`
    - `displaywindow`, DisplayWindow, Built-in: input `video`
    - `brightnessmeter`, BrightnessMeter, Python: input `video_from_upstream`
  - links: the first link runs straight; the fan-out from `video_to_downstream` sits symmetric about the port
  - bottom-left: "Exposed `jonathanf-macbook/main/invertingeffect/video_to_downstream` Private"
- **Dock:** "Logs" [All | Warnings 1 | Errors 1] · Following · [Filter ⌘F]. The brief's lines follow: the loading line, the Vulkan loader line (attrs wrap under the message column), the device line, the helper-process line, repeated `brightness` lines with attrs, the `warn` line with its attrs, and the `error` line.
- **Initial tab:** Graph whenever a loaded stream is first selected in a session. After that, the last tab chosen persists across stream changes while the newly selected stream is loaded.
- **Loading** (kept or attached with `node_count === null`): no tabs. The body is the Overview with the story "Loading. Its graph and logs show up as soon as it runs." and a spinner. When it loads, the view switches to Graph unless the user picked another tab since.

### 8.2 Logs tab

The band, the dock header without the "Logs" label, and the list at full height. The filter field is 240px wide.

### 8.3 Overview tab, and every stream that isn't loaded

The column is at most 760px. Top to bottom:

1. **Story** (13/20 text-2, the lead phrase in text 500), from `presentStreamStory` (§13):

   | Stream | Story |
   |---|---|
   | kept, loaded | "**Running, and kept.** Tatolab loads it again every time the runtime starts, until you stop it." |
   | attached, loaded | "**Running, attached** to the terminal that started it. It stops when that `tatolab run` or `tatolab dev` ends." |
   | kept or attached, loading | "**Loading.** Its graph and logs show up as soon as it runs." (+ spinner) |
   | stopped | "**Stopped.** Tatolab remembers it but won't load it until you start it again. Its graph and logs come back when it runs." |
   | failed | "**Failed at its last start.** Tatolab skips it each time the runtime starts, until you retry it." |
   | unknown | "**⟨Label⟩.** This version of Tatolab doesn't know this state yet." |

   A second sentence follows: "Its project is `~/streams/pattern`", with an inline copy button.
2. **Failure block** (failed only, §7.9).
3. **Exposed outputs** (loaded only). Head: "Exposed outputs", with meta "readable outside main". A well of rows:
   - Each row: min 52px tall, padding `10px 6px 10px 14px`.
   - Line 1: the address in mono 12/18, with the machine segment in text-3.
   - Line 2: the level word (12/16 text-2 500), then the explanation in 12/16 text-2, from `explainExposureLevel` (§13):
     - private: "Private. Readable by other streams and tools on this Mac."
     - public: "Public. Readable on this Mac now; other machines read it once sharing arrives."
     - internal (if listed): "Internal. Only main's own nodes read it."
     - unknown: the raw word, capitalised, with no explanation
   - Right: a copy icon button ("Copy the address"). With the flag on, a private or public row adds a small secondary "Watch" button with the eye icon before the copy button.
   - With no private or public outputs, a single row reads "None. Every output of main is internal: only its own nodes read them." Under it is a command row: `tatolab expose main <first linked output's node> <port>`, described as "Make one readable on this Mac". For `main` that is `tatolab expose main invertingeffect video_to_downstream`. Leave out the command row when the graph has no links.
4. **Nodes** (loaded only). Head: "Nodes", meta = the graph health line, link "Open graph" `⌘1`.
   - A well of rows in flow order (layout column, then row), each 40px tall, padding `0 14px`, a grid of `auto minmax(0, 1fr) auto auto`, gap 10.
   - Columns: the name in mono 12.5 500; the full `type` in mono 11.5 text-3, ellipsized; the state word if not Running (text-3, or red with an icon for Error); the kind word in 12 text-3.
5. **From the terminal.** Head: "From the terminal". A well of command rows, by state:

   | Stream | Commands (command · description) |
   |---|---|
   | kept, loaded | `tatolab logs --stream main -f` · "Follow its logs"; `tatolab stop main` · "Stop it, and keep it stopped"; `cd ~/streams/pattern && tatolab run -d` · "Load your edits" |
   | attached, loaded | `tatolab logs --stream attached-demo -f` · "Follow its logs"; `tatolab stop attached-demo` · "Stop it" |
   | loading | `tatolab logs --stream <name> -f` · "Follow its logs" |
   | stopped | `tatolab start pattern-two` · "Load it again"; `tatolab rm pattern-two` · "Forget it for good" |
   | failed | `tatolab start lobby-recorder` · "Retry it"; `tatolab rm lobby-recorder` · "Forget it for good" |

   Every verb and flag is checked against `runtime/tatolab-cli/src/main.rs`: `logs --stream -f`, `stop`, `start`, `rm`, `run -d`, `expose`.

At 1040×700 the `main` Overview fits without scrolling (about 560px of content in 648px).

### 8.4 Empty: running, zero streams

This is the brief's screen (2).

- **Sidebar:** the machine block; "Streams" with no count; then the **ghost row**: 28px tall, a 1px dashed `line-dashed` border, radius 6, `my-stream` in mono 12 text-3 with "Kept" right-aligned in text-3, `aria-hidden`. Under it, "Your first stream shows up here." in 12 text-3, padding `4px 16px`.
- **Band:** `jonathanf-macbook` and `Tatolab 0.45.0`. No tabs.
- **Left column:**
  - "Run your first stream" (20/26).
  - Lede (13/20 text-2, max 60ch): "A stream is a small graph of nodes, like a source, an effect and a window. Tatolab runs it in the background, each Python node in its own process. Start with a test pattern; it needs no camera."
  - Three steps. Each is a grid of `24px | 1fr`: the number in 13/18 text-3 tabular, a 13/18 600 title, a standalone command well with copy, and a 12/17 text-2 note:
    1. "Make a project" · `tatolab new my-stream --test-pattern` · "Writes stream.py and two example nodes into my-stream/."
    2. "Install it" · `cd my-stream && uv sync` · "Creates the project's .venv with tatolab-stream in it."
    3. "Hand it to the runtime" · `tatolab run -d` · "Tatolab keeps it running, across restarts too."
  - A spinner plus "This window shows your stream as soon as the runtime loads it." (12 text-3).
- **Right column:**
  - "What you'll see" (13/600).
  - A static picture: `public/first-stream-preview-1280x720.png`, a copy of `/tmp/tatolab-design-v2/assets/test-pattern-frame-1280x720.png`. Shown at 16:9, radius 10, with a 1px `line-strong` ring. It is an illustration bundled with the app, not data.
  - "A window with these inverted color bars, and a brightness reading in the logs every second." (12/18 text-2)
  - "Then make it yours: edit `nodes/inverting_effect.py` and run `tatolab run -d` again, or keep `tatolab dev` open to reload on every save." (12/18 text-2, mono inline)
  - The agent tip (12/18 text-3, margin-top 12): "Using an AI agent? Point its MCP settings at `tatolab mcp`." The `mcp` verb exists in tatolab-cli.

### 8.5 Settings

This is the brief's screen (3). The band reads "Settings" and the Settings row in the sidebar is selected. Groups are in this order; strings come from `presentPlatform`:

1. **Runtime**
   - "Run Tatolab" with a switch; description = `runTatolabExplanation`. The macOS text is the brief's: "Starts Tatolab at login and keeps the runtime running. Turning it off stops the runtime."
   - macOS only: "Login Items" with "Tatolab is listed under Open at Login. Run Tatolab and that entry are the same setting." and an "Open Login Items…" secondary button.
2. **Command line**
   - "The `tatolab` command"; description = `presentCommandLineTool().explanation`, plus " Try `tatolab streams`." when linked.
   - Value: `shownValue` in mono text-2 (`/usr/local/bin/tatolab`), with a copy button when linked. When not linked: the value in text-3 ("Not linked" or "Not installed").
3. **About**
   - Version: `Tatolab 0.45.0`
   - Updates; description and button = `presentTatolabAppUpdate(status.app_update)`. While nothing is under way it reads "Tatolab checks for a newer version at launch and once a day." with a "Check for Updates…" secondary button; a newer version found reads "Tatolab 0.46.0 is available." with "Install and Relaunch" (macOS, the AppImage) or "… Its download opens in your browser." with "Open Download" (the .deb); while it downloads and installs, the description carries the percent and the button is disabled. An app that cannot update itself (unpackaged) shows only why. A failure shows as a failure line under the row: "Couldn't update Tatolab: " and the updater's own words.
   - This Mac (or This computer): `jonathanf-macbook` in mono
   - Stream records: the records directory in mono, with copy
4. **Quit or uninstall**
   - "Quit Tatolab"; description = `quitTatolabExplanation`; a "Quit Tatolab" secondary button.
   - "Uninstall Tatolab"; description = `uninstallTatolabExplanation`; an "Uninstall Tatolab…" destructive button.
   - A refusal from the uninstall flow shows as a failure line under this row (existing `showUninstallTatolabRefusal`).

On Linux there is no Login Items row, the Linux strings apply, and "Uninstall Tatolab…" opens the Linux steps (§8.7).

### 8.6 Runtime pages (the brief's screen (6), "runtime down", and every other non-running state)

When `presentRuntimeStatus().displayState !== "running"`, this page replaces the stream view (and the empty and not-listed bodies). It replaces today's banner plus skeleton.

- **Sidebar:** the machine block with the runtime sentence, then "Your streams show up here while Tatolab runs." Settings stays reachable.
- **Band:** the machine name and `Tatolab <version>`.
- **Column (max 520):**
  1. Heading row: the icon, then the heading (20/26 600 text).
  2. Explanation: 13/20 text-2, margin-top 8.
  3. Actions: margin-top 16, gap 10.
  4. Optional facts list.
  5. Optional spinner line: margin-top 18, 12 text-3.

| displayState | Icon (20px) | Heading (`banner.title`) | Explanation | Action | Extra |
|---|---|---|---|---|---|
| `starting` | spinner | "Starting the runtime" | `banner.explanation` | (none) | (none) |
| `unreachable` | red alert | "The runtime isn't responding" (the heading stays text; only the icon is red) | `banner.explanation` + " Your kept streams come back with it." | (none) | facts list; spinner + "Still asking. This window carries on by itself when it answers." |
| `switched_off` | power, text-2 | "Tatolab is off" | `banner.explanation` + " The streams it keeps come back by themselves." | **Turn On Tatolab** (primary) | "Same as Run Tatolab in Settings." in 12 text-3 |
| `needs_login_items_approval` | lock, text-2 | "Allow Tatolab in Login Items" | `banner.explanation` | **Open Login Items…** (primary) | (none) |
| `runtime_missing_from_app` | red alert | "This copy of Tatolab is missing its runtime" | `banner.explanation` | (none) | (none) |
| `not_registered` | red alert | "The runtime didn't start" | `banner.explanation` | "Try Again" (secondary) → `setRunTatolab(true)` | (none) |

- **Facts list (unreachable):** a `dl` of 12/18 rows, grid `120px | 1fr`; terms in text-3, values in text-2:
  - "Last answered": `HH:MM:SS` in mono. This is the local time of the last status this window saw with `runtime_state === "running"`. Leave the row out if there was none this session; track it in the window controller.
  - "Run Tatolab": "On".
  - "From a terminal": `tatolab streams` in mono, with copy.
- **Action buttons** reuse today's `runBannerAction` mapping. A rejected action shows as a failure line under the actions.
- **Streams not listed** (running, `streams === null`): the same page with no icon, the heading "The runtime didn't list its streams" and "It's running, but its stream list couldn't be read. Tatolab asks again every two seconds."

### 8.7 Uninstall sheet

This is the brief's screen (4). Its states are the existing `UninstallFlowState`.

**macOS `confirming`:**
- **Placement:** attached under the band, horizontally centred on the window, `top: 52px`, 452px wide (max `calc(100% − 48px)`). The top corners are square; the bottom corners are radius 12. `--overlay`, `--shadow-pop`, over a `--scrim` covering the window. `role="dialog"`, `aria-modal="true"`, labelled by its title.
- **Head:** the 44px mark, "Uninstall Tatolab?" (15/20 600) and "Your streams stop now. Tatolab will:" (13/18 text-2).
- **Rows:** hairline-separated, padding `10px 0`, grid `16px | 1fr`, gap 12, a 16px icon in text-2, the title in 13/18 500, a note in 12/17 text-2:
  - power: "Stop the runtime and remove it from Login Items"
  - terminal: "Remove the `tatolab` command and the machine lock" — note: "`/usr/local/bin/tatolab` and `/Library/Application Support/Tatolab`. macOS asks for an administrator password once."
  - trash: "Move Tatolab to the Trash" — note: "Then it quits."
- **Then** (12/18 text-2, with `KEPT_RECORDS_ICON_SVG` at 16px): "Your streams' records stay in `~/Library/Application Support/Tatolab`. Reinstall Tatolab and they come back." The path never wraps (`white-space: nowrap`).
- **Actions** (right-aligned, gap 10):
  - Cancel: secondary, focused when the sheet opens, the safe default; Enter on it cancels.
  - Uninstall: destructive (red label on a neutral button).
- Esc dismisses it (`canDismissUninstallSheet`).

**macOS `uninstalling`:** the rows stay; Cancel is disabled; Uninstall is disabled and shows the spinner and "Uninstalling…"; the subtitle reads "macOS asks for your password now." Esc does nothing.

**macOS `uninstalled`:** the body becomes the mark, "Tatolab is uninstalled" (15/600) and "It quits now." (13 text-2). No buttons.

**Refusal (`closed` with `refusalReason`):** the sheet closes and the reason shows under the Uninstall row in Settings.

**Linux `showing_linux_steps`:**
- **Placement:** floating, centred, 64px from the top, radius 12 on all corners, same width and scrim.
- **Content:**
  - "Uninstall Tatolab" (15/600), then "Two steps, both from your own hands:" (13 text-2).
  - Step 1: "Remove the runtime" with a standalone command well holding `curl -fsSL https://get.tatolab.com/install.sh | sh -s -- --uninstall`. Keep today's two-line break (`LINUX_UNINSTALL_COMMAND_LINES`) and copy the whole command.
  - Step 2: "Remove this app" with "Uninstall the Tatolab package with your package manager, or delete the AppImage."
  - Then the records note with `~/.local/state/tatolab`.
  - One "Done" secondary button, focused. A close icon sits top-right. Esc closes it.

### 8.8 Setup: first launch

This is the brief's screen (5).

**macOS** (`chooseTatolabWindowScreen === "setup"`; there is no sidebar):
- **Band:** an empty 52px drag strip (macOS) with no border.
- **Column (max 520):**
  - the 52px mark
  - "Set up Tatolab on this Mac" (20/26, margin-top 20)
  - lede (13/20 text-2): "Tatolab runs your streams in the background, one runtime for the whole Mac. Setting up takes one administrator password."
- **List** (margin-top 20; hairlines above, between and below; rows padding `12px 0`, grid `16px | 1fr`, gap 14; a 16px icon in text-2; the title in 13/18 500; a note in 12/17 text-2 with mono paths):
  - terminal: "Links the `tatolab` command" — note: "At `/usr/local/bin/tatolab`, so every terminal can make and run streams."
  - lock: "Creates the machine lock" — note: "In `/Library/Application Support/Tatolab`, so this Mac runs one runtime."
  - power: "Starts the runtime, now and at login" — note: "Turn it off any time with Run Tatolab in Settings."
- **Actions** (margin-top 20; flex): a 14px lock icon with "macOS asks for your password once." (12 text-3), a spacer, then Quit (secondary) and **Set Up Tatolab…** (primary).
- **States** (from `machine_setup_state` and the `setUpTatolab()` promise):
  - `needs_administrator`: as drawn.
  - `waiting_for_administrator`: the primary button is disabled and shows the spinner and "Waiting for your password…". Quit stays.
  - Rejected: a failure line above the actions (a red alert icon plus the reason in 12 text-2), and the primary button reads "Try Again…".
  - Once complete, the status switches the window to the pages. If macOS then needs approval, the main window shows the approval page (§8.6).

**Linux** (`runtime_not_installed`):
- **Column:** max 600, with no band strip (native decorations).
- **Content:**
  - "Install the Tatolab runtime" (20/26).
  - Lede: "This app shows and controls `tatolabd.service`, the runtime the Tatolab installer sets up. It isn't on this computer yet. Run this in a terminal:"
  - A standalone command well: `curl -fsSL https://get.tatolab.com/install.sh | sh`, with copy, never truncated.
  - Two list rows:
    - terminal: "Installs `tatolab` and `tatolabd`" — note: "Into `~/.local/bin`."
    - power: "Starts `tatolabd.service`" — note: "For your user, now and at login."
  - A spinner plus "Waiting for `tatolabd.service`. This window carries on by itself." (12 text-3)

### 8.9 Linux variant of Main

This is part of the brief's screen (9). It is the same as §8.1, with these changes:
- the sidebar's top strip is 12px, and there are no traffic lights
- kbd hints read `Ctrl K` and `Ctrl ,`
- the machine block shows the Linux machine's name
- every "this Mac" reads "this computer"

The layout does not otherwise change.

### 8.10 Watch placeholder (the brief's screen 8; flag on only)

See §9.

### 8.11 Theme resolution and first paint

`index.html` carries an inline script before the stylesheet:

```html
<script>
  (function () {
    var pinned = new URLSearchParams(location.search).get("theme");
    var media = matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      document.documentElement.dataset.theme =
        pinned === "light" || pinned === "dark" ? pinned : media.matches ? "dark" : "light";
    }
    apply();
    if (pinned !== "light" && pinned !== "dark") media.addEventListener("change", apply);
  })();
</script>
```

Also set `<meta name="color-scheme" content="light dark">` in `index.html`. `main.ts` stops setting the theme itself. `data-platform` stays set by `mountTatolabWindow` (existing).

---

## 9. Watch: placeholder behind a frontend feature flag

### The flag
- **Name:** `watch-exposed-output`. In code: `watchExposedOutput`.
- **Where it lives:** a new `src/feature_flags.ts`:

  ```ts
  /** Frontend-only switches for surfaces the plan has decided on but whose data arrives later. */
  export interface TatolabFrontendFeatureFlags {
    /** The Watch surface for exposed outputs, as a placeholder until the sharing step gives it data. */
    watchExposedOutput: boolean;
  }

  /** The flags this build runs with: off unless the build sets them, or the browser mock asks. */
  export function readTatolabFrontendFeatureFlags(isRunningInsideTatolabApp: boolean, pageQuery: URLSearchParams): TatolabFrontendFeatureFlags {
    const builtOn = import.meta.env.VITE_TATOLAB_FEATURE_WATCH_EXPOSED_OUTPUT === "1";
    const mockAsked = !isRunningInsideTatolabApp && pageQuery.getAll("feature").includes("watch-exposed-output");
    return { watchExposedOutput: builtOn || mockAsked };
  }
  ```

  - Declare `VITE_TATOLAB_FEATURE_WATCH_EXPOSED_OUTPUT` in `src/vite-env.d.ts`.
  - The flag is off by default. A release build turns it on only with that environment variable at build time. The query parameter works only in the browser mock, so a shipped app cannot be flipped at runtime.
- **Plumbing:** `main.ts` reads the flags once and passes them to `mountTatolabWindow(rootElement, backend, platform, featureFlags)`. From there they go down to the streams view, the graph view, the Overview and Search. No module-level global.

### What the flag toggles
When it is off, none of these elements exist in the DOM.

1. Output port rows become buttons (§7.6): private and public open Watch; internal opens the internal state.
2. The exposed strip's address becomes a button (§7.6).
3. Overview's private and public rows gain a small "Watch" button (§8.3).
4. Search gains the "Watch" group (§7.13).
5. The Watch surface itself, below.

These do not depend on the flag: exposure level words, the exposed strip, the Exposed outputs list, and everything else in this spec.

### The Watch surface
- **Place:** it replaces the log dock's contents, in the same region and at the same height, in the Graph tab. The canvas stays above it with the watched path lit (§7.6: the node's accent outline, the port row, and links of 2px static accent). This is where Watch is designed to live: the lower region as selection detail.
- **Opening:** clicking a private or public port row, an address button, "Watch" in Overview (which switches to Graph first), or a Search Watch row.
- **Closing:** Esc, the close button, "Back to logs", switching to the Logs tab, selecting another stream, or the port leaving the graph or dropping to internal. The logs come back exactly as they were; the console stays mounted underneath.
- **Header** (40px, the dock header's metrics):
  - a 16px eye in accent-text
  - `invertingeffect` (mono 12.5 text-2), `›` (text-3), `video_to_downstream` (mono 13 600 text, which ellipsizes first)
  - the level word (12 text-3)
  - a spacer
  - "Back to logs" (plain small button plus an `esc` kbd)
  - a close icon button ("Close Watch")
- **Body, private or public port.** Padding `16px 20px`, flex, gap 24.
  - **Frame box (left):**
    - width `min((dockHeight − 72px) × 16/9, 45% of dock width)`, at 16:9
    - a 1px dashed `line-dashed` border, radius 10, `--canvas` fill
    - centred inside: a 20px eye in text-3 and "No picture yet" (12 text-3)
    - it is about 365×205 at 1040×700, and 290×163 at 860×580
    - no image, no bezel, no shimmer
  - **Right column** (min 260px, max 420px):
    - "Watching arrives with the sharing step" (13/18 600 text)
    - Body (12.5/19 text-2, margin-top 6), private: "When it lands, this panel shows what `video_to_downstream` carries: its latest picture and its newest samples, read the way any tool on this Mac reads a private output. Nothing is read from the stream today."
    - Public: add the sentence "Public outputs also play from other machines, over the relay."
    - The address row (margin-top 14): the full address in mono 12 (machine segment text-3), with copy.
    - Footnote (11.5/16 text-3, margin-top 14): "Shown because the watch-exposed-output flag is on."
- **Body, internal port** (no frame):
  - "`testpatternsource › video` is internal" (13/18 600)
  - "Only main's own nodes read it, so nothing outside the stream can watch it, this window included." (12.5/19 text-2)
  - "Make it private to read it on this Mac:", then a command row with `tatolab expose main testpatternsource video` and copy
  - "The change is live; main keeps running. `--remove` makes it internal again." (12 text-3)
- **No data plumbing:** no timer, no polling, no "Live" word, no stats, no Pause, no Save, no backend call. `watch_placeholder_view.ts` imports nothing from `src/backend/` except types.

---

## 10. Keyboard map

The modifier is `⌘` on macOS and `Ctrl` on Linux, matched by `holdsWindowShortcutModifier` (never with Option or Alt). Shortcuts are off while the setup screen shows. While the sheet or Search is open, only their own keys work.

| Keys | Where | Does |
|---|---|---|
| ⌘K | pages | Opens or closes Search |
| ⌘, | pages | Settings |
| ⌘1 / ⌘2 | a loaded stream selected | The Graph / Logs tab (leaves Settings first) |
| ⌘3 | a stream selected | The Overview tab |
| ⌘F | a loaded stream selected | Focuses the log filter; from Overview or Settings it switches to Graph first |
| ⌘↑ / ⌘↓ | pages | Selects the previous / next stream (leaves Settings) |
| ↑ ↓ Home End | focus in the sidebar stream list | Moves focus and selection (selection follows focus) |
| Enter or Space | a stream row; with the flag on, a port row | Selects it; opens Watch |
| End | focus in the log list | Jumps to the latest line and resumes following |
| Esc | anywhere | Closes, in order: Search → the uninstall sheet (when `canDismissUninstallSheet`) → Watch → the focused log filter's text → blurs the filter |
| ↑ ↓ Enter Esc | Search | Moves, opens, closes |
| ↑ ↓ (16px), double-click | the splitter | Resizes the dock / resets it |

This replaces today's map, where ⌘1 meant the streams page and ⌘2 meant Settings.

The kbd hints shown are:
- `⌘K` on Search
- `⌘,` on the Settings row
- `⌘F` in the filter field
- `⌘1` on Overview's "Open graph"
- the ⌘1–3 tooltips on the tabs
- `esc` in Search, and in Watch with the flag on

---

## 11. Motion

Motion only answers an action. There is no ambient animation: delete the link pulse, the dot "breathing" and the live dot.

| What | Motion |
|---|---|
| Hover fills, button presses | `background-color` 80ms linear |
| Switch knob | 160ms `--ease` |
| Uninstall sheet in / out | translateY −8px → 0 with opacity, 180ms `--ease` / 120ms out |
| Search in / out | opacity with scale .985 → 1, 140ms `--ease` / 100ms out |
| Scrim | opacity 140ms |
| Watch surface replacing the logs (flag) | crossfade 160ms |
| Copy → check | instant swap; back after 1.2s |
| Spinner | 900ms linear rotation |
| Tab switch, stream switch, graph re-layout | instant (no slide; the graph re-renders in place) |
| Splitter drag | follows the pointer, no easing |

Under `prefers-reduced-motion: reduce`, every transition is ≤1ms and spinners stop on a static arc.

---

## 12. Room for step 10 and the sharing step (reserved, not built)

| Future | Its home now | What it means for this build |
|---|---|---|
| Start, Stop, Remove, Expose… (step 10) | `.band-actions[data-slot="stream-actions"]`, between the spacer and Search | Empty and zero-width now. At step 10: small secondary buttons plus a `⋯` icon button. At ≤960 Search is already icon-only, which makes room. |
| Stream commands in a palette | Search (§7.13) | Add a "Stream" group; no new chrome. |
| Selecting a node or link: restart, remove, disconnect | The lower region (the dock), the place Watch already proves | Same header metrics as Watch. |
| Add Node, drag-to-connect | The canvas's bottom-right corner (empty now) and output port rows | Port rows are already elements, so they can take drag handles. |
| Overview command rows becoming buttons | Each "From the terminal" row maps one-to-one onto a step-10 action | Keep the rows; they stay as the CLI crib. |
| Watch with real data (sharing step) | §9's surface | Replace the placeholder body. The header, place and lit path stay. |
| Other machines and their public outputs (sharing step) | A second sidebar section under Streams | The section stack scrolls already. |

---

## 13. Porting map, file by file

### App files (`tatolab-app/`)

| File | Change |
|---|---|
| `index.html` | The theme script (§8.11), `color-scheme` meta. Remove the platform guess, which `mountTatolabWindow` sets. |
| `src/main.ts` | Import `@fontsource/jetbrains-mono/400.css`, `500.css` and `600.css`; delete the three Instrument Sans imports and drop `@fontsource/instrument-sans` from `package.json`. Update the CSS import list to match the styles below. Stop setting `data-theme`. Read `readTatolabFrontendFeatureFlags` and pass it to `mountTatolabWindow`. |
| `src/feature_flags.ts` (new) | §9. Test: off by default; the query parameter is ignored inside the app. |
| `src/vite-env.d.ts` (new or extend) | Type `VITE_TATOLAB_FEATURE_WATCH_EXPOSED_OUTPUT`. |
| `src/icons.ts` | Replace it with the set in §6 and delete the listed exports. |
| `src/dom.ts`, `clipboard.ts`, `repeating_backend_poll.ts`, `window_visibility.ts` | Unchanged. |
| `src/backend/*` | **Unchanged.** No new commands or methods. The window never calls `tap_output_port` or `preview_output_frame`, which `TatolabBackend` doesn't expose; their removal belongs to the `chore/remove-tap-and-exchange` work, not this spec. |
| `presentation/stream_presentation.ts` | Replace `chipTone` and `dotTone` (and their types) with `emphasis: "plain" \| "quiet" \| "failure"`: attached and kept → plain, stopped → quiet, failed → failure, unknown → plain. Labels unchanged. Update its test. |
| `presentation/runtime_presentation.ts` | Unchanged. Views map `tone === "error"` to red plus the alert icon, and every other tone to text-2. |
| `presentation/platform_presentation.ts` | Add `streamRecordsDirectory` (`~/Library/Application Support/Tatolab` or `~/.local/state/tatolab`) and `shortcutHint(platform, key): string` (`⌘K` or `Ctrl K`). Tests. |
| `presentation/log_record_presentation.ts` | Replace `LOG_LEVEL_FILTER_CHOICES` (five choices for a select) with `LOG_LEVEL_SEGMENTS = [{ label: "All", minimumRank: trace }, { label: "Warnings", minimumRank: warn, countedRank: warn }, { label: "Errors", minimumRank: error, countedRank: error }]`. The segment counts are the held lines at exactly `countedRank`; the Warnings filter still shows warn and above. Update its test. |
| `presentation/stream_overview_presentation.ts` (new) | Pure functions, each with a test: `presentStreamStory(stream)`, `terminalCommandsForStream(stream)` (§8.3), `explainExposureLevel(level, platform, streamName)` (moved out of `stream_graph_view.ts`, with the new copy), `exposedOutputAddress(machineName, streamName, exposedPort)`, `presentNodeKind(type)`, `nodeClassName(type)`, `summarizeGraphHealth(graph)` (returns the clauses and whether any node is in error), `portsOfGraphNodes(graph)` (§1). |
| `presentation/uninstall_flow.ts`, `stream_selection.ts` | Unchanged. |
| `views/tatolab_window_view.ts` | The new shell: the sidebar (machine block, streams section, Settings), and content = band plus the current view. Keep the screen choice (`chooseTatolabWindowScreen`), the page visibility and polling rules, and the sheet guard. New keyboard map (§10). Mount Search. Track "Last answered" for §8.6. |
| `views/window_sidebar_view.ts` | Rewrite: band strip, machine block (§7.1), the scrolling section stack hosting `StreamListView`, the pinned Settings row. Delete the runtime pill, its dot, the navigation items and the count badge. |
| `views/stream_list_view.ts` | Rows per §7.2: roving tabindex, emphasis classes, failure second line, ghost row. |
| `views/streams_page_view.ts` | Becomes the content controller: band (§7.3) plus body — the stream view, the first-stream guide, the runtime page or not-listed. Delete the runtime facts strip, the skeleton and the banner slot. |
| `views/stream_detail_view.ts` | Becomes the stream view. `LoadedStreamLiveView` becomes the workspace: graph view, splitter and dock, with the Logs tab collapsing the canvas, plus `StreamOverviewView`. Polling of the graph and logs is unchanged (2.5s graph; follower). `StreamNotLoadedPanel` folds into the Overview (story, failure block, terminal rows); keep its runtime-refusal read. |
| `views/stream_overview_view.ts` (new) | §8.3. |
| `views/stream_graph_view.ts` | HTML nodes plus an SVG link layer (§7.6); caption, path, exposed strip; flag-gated port buttons and the lit path; messages. Delete `toneOfGraphNodeState` and `toneOfGraphLinkState` (replaced by `presentGraphNodeState` and `presentGraphLinkState`, tested), the state dot, port dots, pulse, chips and `EXPOSED_PORT_ICON_SVG` use. |
| `views/stream_graph_layout.ts` | Keep `assignColumns`, `orderColumnsToReduceCrossings`, the outside-the-stream nodes and `chooseColumnGap` (constants: narrowest 32, usual 44, widest 72; padding 28).<br><br>Replace the pill geometry with nodes that have inputs, outputs, a computed height (48 head + 1 + 8 + 22 per port + 23 for a foot) and a width (§7.6). Link ends move to port-row centres, and the output gains `arrowPathData`.<br><br>Vertical placement:<br>1. Column 0 is stacked with an 18px gap and centred.<br>2. In each later column, a node's desired top is the mean y of its upstream source ports minus its first input row's offset.<br>3. Place the column's nodes in order, pushing each down to keep the 18px gap.<br>4. Shift the column up by half the total push.<br><br>Delete the dot constants. New tests: "a straight chain draws straight" (equal port y), "a two-way fan-out sits symmetric about its source port", and "a node's height follows its port count". |
| `views/stream_log_console_view.ts` | Header per §7.7 (segments in place of the select; "Following" text in place of the live dot); line grid and level words; messages. The filtering, holding, following and jump logic stays. |
| `views/log_dock_splitter.ts` (new) | §4, the splitter. |
| `views/watch_placeholder_view.ts` (new) | §9. Built only when the flag is on. |
| `views/tatolab_search_view.ts` (new) | §7.13. |
| `views/stream_log_follower.ts` | Unchanged. |
| `views/first_stream_guide_view.ts` | §8.4, with the static picture. Delete the ghost-graph preview. |
| `views/runtime_banner_view.ts` | Becomes `runtime_state_page_view.ts` (§8.6). Keep `runBannerAction`; relabel actions "Turn On Tatolab", "Open Login Items…", "Try Again". |
| `views/settings_page_view.ts` | Groups and rows per §8.5. |
| `views/uninstall_sheet_view.ts` | §8.7. The state machine wiring is unchanged. |
| `views/first_launch_setup_view.ts`, `linux_runtime_install_view.ts` | §8.8. |
| `views/copy_button.ts` | §7.10. |
| `public/first-stream-preview-1280x720.png` (new) | A copy of `/tmp/tatolab-design-v2/assets/test-pattern-frame-1280x720.png`. |

**Styles** (`src/styles/`). Rewrite each file from the calm-native sources named below. Delete every `.status-dot*`, `.state-chip*`, `*-skeleton-*`, `.stream-graph-port`, `.stream-graph-link-pulse` and `--ok*` / `--idle` / `--graph-grid-dot` / Instrument Sans rule.

| App stylesheet | Port from |
|---|---|
| `tokens.css` | §5.1 (supersedes calm-native `styles.css` lines 7–121) |
| `base.css` | calm-native `styles.css` §base (122–148) and §buttons (234–252); add the kbd, field, switch, spinner, scrollbar and selection rules (§5.3, §7.5, §7.11) |
| `window_shell.css` | calm-native §window frame (149–172, minus `.traffic-lights` and `.linux-titlebar`) and §content + band (204–233), changing the band grid to §7.3 |
| `stream_list.css` (+ the sidebar) | calm-native §sidebar (173–203), plus focused-split `styles.css` `.ghost-row` (207) and the failed row's second line (focused-split `streamRow`, `app.js` 203) |
| `streams_page.css` | the workspace grid and splitter (§4); focused-split §lower region (324–362) for the dock frame metrics |
| `stream_detail.css` → `stream_overview.css` | calm-native §page + sections (253–264) and the overview's well, command-row and failure-block rules (265–340). Not `.flow*` (the tree) or `.thumb*`. |
| `stream_graph.css` | calm-native §graph (366–409), minus `.flow`/`@keyframes link-flow` and `.canvas-tools`; with the §7.6 states |
| `stream_log_console.css` | calm-native §logs (341–365) |
| `first_stream_guide.css` | calm-native §empty state (463–483) |
| `settings_page.css` | calm-native §settings (484–504) |
| `first_launch_setup.css` (+ `runtime_state_page.css`) | calm-native §centred screens (505–528); guided-devex `styles.css` `.down-facts` (2035–2050) for the facts list |
| `uninstall_sheet.css`, `search.css` | calm-native §overlays (529–569), minus `.toast` |
| `watch_placeholder.css` (new) | §9 only. Do not port calm-native §tap (410–462). |

**Prototype JS to read for structure** (`/tmp/tatolab-design-v2/calm-native/app.js`):

| Read | For |
|---|---|
| `sidebarHTML` (178) | the sidebar |
| `bandHTML`, `tabsHTML` (214–236) | the band |
| `storyHTML`, `failureHTML` (237–256) | the story and failure block |
| `terminalCommands` (322) | the command rows; use the §8.3 table, not its strings |
| `exposedHTML` (351) | the exposed list, without the thumbnail and button |
| `graphTabHTML` (398), `layoutGraph` (806) | node DOM, port-row offsets, link paths and fitting |
| `logLineHTML` (165), `logsTabHTML` (520) | log lines and the Logs tab |
| `emptyScreen` (557) | the empty state |
| `settingsScreen` (588) | Settings |
| `uninstallSheetHTML` (643) | the uninstall sheet |
| `setupScreen` (667) | setup |
| `downScreen` (702) | the runtime pages |
| `paletteHTML` (725) | Search |

Do not port `tapPanelHTML`, `startTap`, `flowRows`/`flowHTML`, `NODE_TYPES` docstrings or `toast`. Port guided-devex's `.node-kind` (`styles.css` 869) as the kind word's placement only.

---

## 14. Accessibility checks

- **Contrast** (computed against the tokens in §5.1):
  - text-3 ≥4.5:1 on window, sidebar and surface in both themes; ≥4.5 on raised nodes in dark, and 5.0 in light
  - red ≥4.5:1 on a selected sidebar row
  - white on the primary fill: 4.6 (dark) and 5.2 (light)
  - links ≥3:1 on the canvas
- **Stopped stream names** use text-3, so they stay AA. Dimming is a colour step, never an opacity on text. The one opacity, 62% on a paused node, keeps its foot word at full contrast.
- **Focus:** every interactive element shows `--focus` on `:focus-visible`.
- **Live regions:** the copy confirmation, and the runtime page heading (`role="status"`).
- **Names:** tabs are `tablist`/`tab`; the sidebar rows are `aria-current`; the sheet is `dialog` with `aria-modal`; Search is `dialog` with a `listbox` and `option` rows with `aria-selected`; icon buttons have `aria-label`s; decorative icons are `aria-hidden`.

---

## 15. Acceptance

- **Dot audit:** the built CSS and DOM contain no filled circle and no element used as a status marker. A grep of `src/` for `status-dot`, `state-chip`, `stream-graph-port`, `dotTone` and `chipTone` returns nothing.
- **Screens:** every screen in §8, at 860×580, 1040×700 and 1440×900, in both themes, on both platforms (Linux on the real Electron build or the browser mock with `?platform=linux`). Show it with the mock's existing `?state=` scenarios.
- **Flag:** with the flag off, there is no `[data-watch]` element and port rows are not focusable. With `?feature=watch-exposed-output` in the mock, §9's surface opens from a port, the exposed strip, Overview and Search, and the network panel shows no request beyond the existing status, graph and log reads.
- **Backend:** the interface is unchanged (`git diff src/backend/` is empty).
- **Tests:** existing tests still pass, with the updated expectations named in §13, plus the new tests for the layout, overview presentation, graph states, platform helpers, log segments and flags.
- **Device check:** on a real macOS build, check the traffic-light centre (y 26) and the drag band.

---

## 16. Assumptions to confirm

These are not blocking; each says where it would matter if wrong.

1. **Search (⌘K) ships as navigation only:** streams, outputs, views and copy. The brief says to leave room for a command palette without building it. If the owner wants no Search at all before step 10, remove `tatolab_search_view.ts` and the ⌘K hint; nothing else depends on it.
2. **The kind word "Python"** is inferred from the `module:Class` type format. It would be wrong only if a non-Python node type ever used that format. One function, `presentNodeKind`, decides it.
3. **Exposed addresses carry the machine segment**, as the plan decides. The brief wrote `main/invertingeffect/video_to_downstream`; the app shows `jonathanf-macbook/main/invertingeffect/video_to_downstream`, with the machine segment quiet.
4. **The public-level sentence** says other machines read a public output "once sharing arrives", because nothing links machines before the sharing step.
5. **The Watch placeholder's copy names "the sharing step"** (a plan term). It is acceptable only because the surface is a flagged preview.
6. **Not grafted:** focused-split's setup-screen "Run Tatolab at login" switch, because `setUpTatolab()` takes no argument, so it would need a backend change.
7. **No screenshots of this exact final layout exist yet.** The calm-native shots in `for-owner/` show the pre-ruling Overview (thumbnail, "Watch live", docstrings). The closest picture of the final landing view is `calm-native-graph-*` with `focused-split-main-dark`'s log dock under it. The implementation round's live re-shoot produces the real ones.
