---
paths:
  - "src/**"
  - "index.html"
  - "proof/design-final/**"
---

# The window (frontend)

- **The design source is `proof/design-final/FINAL-SPEC.md` (calm-native) and
  `src/styles/tokens.css`.** State is written as words, not dots; stopped streams are dimmed; only
  a failure is red, with its reason. A visual change that departs from the spec is the owner's
  call — bring it, don't drift into it.
- **Colours, radii, fonts and the window's structural sizes (band, sidebar, page padding) come
  from `tokens.css`**, with a light and a dark value for every colour. Spacing and type sizes are
  literal px in component stylesheets, as the tree does. A new colour literal outside `tokens.css`
  is a defect.
- **Text stays WCAG AA** (4.5:1 body, 3:1 large and UI) in light and dark, including on hover,
  selected and dimmed rows. Check it when you touch a colour or a state.
- **Both platforms' chrome.** The window renders in WKWebView on macOS and WebKitGTK on Linux
  (`platform_presentation.ts`). A layout change is looked at for both.
- **No framework, no runtime dependencies beyond what `package.json` has.** Views are plain DOM
  modules (`src/views/`), presentation is pure functions (`src/presentation/`) with vitest tests,
  and the backend is the `TatolabBackend` contract with a Tauri and a mock implementation
  (`src/backend/`). Extend those layers; never add a parallel one.
- **Runtime-supplied text** (stream names, node names, log records, refusals) reaches the DOM only
  through `textContent`, never `innerHTML`.
- **The mock backend is how hard states are shown, never how behaviour is decided.** The mock
  mirrors the `TatolabBackend` contract; a mock-only behaviour the real backend lacks is a
  defect. Its presets (`?state=`, `?platform=`, and the screen keys in
  `mock_window_preset.ts`) exist so every screen can be pictured from a URL — add one when you add
  a screen.
- **Copy is plain and specific.** Name the thing and the action ("Run Tatolab", "Uninstall
  Tatolab…"); a runtime refusal is shown in its own words.
- Presentation logic is tested in `src/presentation/*.test.ts`; DOM behaviour that has a seam is
  tested with happy-dom; time is driven through injected clocks or fake timers, as the existing
  tests do.
