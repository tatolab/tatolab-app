---
paths:
  - "apps/tato-app/src/renderer/**"
  - "apps/tato-app/src/shared/**"
---

# The window (frontend)

- **The design system is the code, and the only design source.** Its values are
  `packages/tato-app-view-sdk/src/design_system/styles/tokens.css`; its components are shadcn's (`packages/tato-app-view-sdk/src/design_system/ui/`) and
  the Tatolab design system's (`packages/tato-app-view-sdk/src/design_system/`). A change to the design language — a
  token, the type face, the window's root size, how a design-system component looks everywhere —
  is made there, with the owner's say-so in the same PR. Within it, visual details (spacing rhythm,
  aligned edges, proportion, sizes on the scale) are chosen for consistency and need no question.
- **Colours, radii, fonts and the window's structural sizes (band, sidebar, page padding) come
  from `tokens.css`**, with a light and a dark value for every colour. Spacing and type sizes come
  from Tailwind's scale as the design system uses it, with literal px only where the scale has no
  step. Component stylesheets remain only for the DOM pages the window still hosts. A new colour
  literal outside `tokens.css` is a defect.
- **Text stays WCAG AA** (4.5:1 body, 3:1 large and UI) in light and dark, including on hover,
  selected and dimmed rows. Check it when you touch a colour or a state.
- **Both platforms' chrome.** The window renders in Electron's Chromium on both platforms, under
  different chrome (`platform_presentation.ts`). A layout change is looked at for both.
- **The window is a design system built on shadcn** (owner, #36, #51). It is a pyramid, used
  from the bottom up, with less customisation at each step:
  1. **shadcn.** Stock shadcn components (base-ui, the `base-nova` style `components.json` names), added
     with the shadcn CLI into `packages/tato-app-view-sdk/src/design_system/ui/` and never edited. Their theme comes from
     `tokens.css`.
  2. **The Tatolab design system.** One component for each recurring piece of the UI, built from
     shadcn components and the tokens, with its look defined there.
  3. **Its variants.** A component that needs another look gets a variant in the design system.
  4. **A call-site class.** Only for a narrowly defined one-off, kept next to the change it
     serves. A one-off needed a second time becomes a variant.

  Screens are built from the design system, not from shadcn directly and not from hand-built
  controls. So a change to how something looks is made once, in the design system or the tokens,
  and applies everywhere.
- **The window is React and Tailwind v4.** Views are React components in `apps/tato-app/src/renderer/views/`, beside the
  DOM pages it still hosts until their tickets rebuild them; presentation is pure functions
  (`apps/tato-app/src/renderer/presentation/`) with vitest tests; and the backend is the `TatolabBackend` contract with an
  Electron and a mock implementation (`apps/tato-app/src/renderer/backend/`). Extend those layers; never add a parallel
  one. A package the window bundles follows `dependencies.md`.
- **Runtime-supplied text** (stream names, node names, log records, refusals) reaches the DOM only
  through `textContent`, never `innerHTML`.
- **The mock backend is how hard states are shown, never how behaviour is decided.** The mock
  mirrors the `TatolabBackend` contract; a mock-only behaviour the real backend lacks is a
  defect. Its presets (`?state=`, `?platform=`, and the screen keys in
  `mock_window_preset.ts`) exist so every screen can be pictured from a URL — add one when you add
  a screen.
- **Copy is plain and specific.** Name the thing and the action ("Restart runtime", "Link
  tatolab"); a runtime refusal is shown in its own words.
- Presentation logic is tested in `apps/tato-app/src/renderer/presentation/*.test.ts`; DOM behaviour that has a seam is
  tested with happy-dom; time is driven through injected clocks or fake timers, as the existing
  tests do.
