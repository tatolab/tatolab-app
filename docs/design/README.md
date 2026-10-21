# Design — the Tatolab app redesign

The reference for the app's new design: a clickable prototype, its storyboard, and the design
language every redesign ticket cites. Mock data only — nothing here talks to a runtime, and none
of it ships in the app.

```sh
cd docs/design
pnpm install
pnpm dev                 # http://localhost:5199
pnpm check               # types + the no-dot rule
pnpm storyboard          # re-render public/storyboard/** from the running prototype
```

## Two editions

- **Today** — `/`, `src/today/`. Only what the runtime serves now: one machine, streams as
  `list_streams` reports them, run a project folder or create one with `tatolab new`, the live
  graph with node and link state and drop counters, logs, per-output exposure, the graph as
  JSON, and relays (the local relay's two listeners plus Cloudflare and moq.pro instances added,
  configured and removed). Its data is `src/today/data.ts`, in the runtime's own shapes. This is
  what the **New design** and **Relays in the app** milestones build.
- **Direction** — `/direction`. The long-term picture: several machines, per-step CPU / GPU /
  frame rate and stats, a library of packs, relay setups, more relay providers, TV mode.

## Citing it in a ticket

- **A frame**: `docs/design/public/storyboard/<edition>/<id>.jpg`, for example
  `docs/design/public/storyboard/today/relays.jpg`. Every frame, its route and a one-line
  caption is listed in `src/storyboard/frames.json` and on the prototype's `/storyboard` page.
- **A rule, token or word**: `docs/design/DESIGN.md` (also the prototype's `/design` page).
- **A live state**: the frame's route in the running prototype, e.g. `/relays?add=moqpro`.

## What is where

| Path | What |
|---|---|
| `DESIGN.md` | The design language: rules, tokens, type, chart palette, vocabulary, layout |
| `ROADMAP.md` | The milestones and issues that build it, and the open questions |
| `src/today/` | The Today edition — shell, pages, data |
| `src/pages/`, `src/components/` | The Direction edition, and the components both share |
| `src/index.css` | The tokens |
| `src/lib/vocab.ts` | The words: stream states, run modes, exposure levels |
| `src/components/live/` | Procedural stand-ins for live frames over the photographs in `public/media/` |
| `public/storyboard/` | Rendered frames, one folder per edition |
| `scripts/check-no-dots.mjs` | The no-dot-indicator rule, as a check |

Built with React, Tailwind v4, shadcn (base-ui), React Flow and Recharts. Photographs in
`public/media/` are from Unsplash (`public/media/CREDITS.md`); the mascot art is in
`public/brand/`.
