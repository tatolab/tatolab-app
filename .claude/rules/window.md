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
- **Colours, spacing, radii and type come from `tokens.css`.** No hard-coded colour or size in a
  component stylesheet; a new value is a new token, defined for light and dark.
- **Text stays WCAG AA** (4.5:1 body, 3:1 large and UI) in light and dark, including on hover,
  selected and dimmed rows. Check it when you touch a colour or a state.
- **Both platforms' chrome.** The window renders in WKWebView on macOS and WebKitGTK on Linux
  (`platform_presentation.ts`). A layout change is looked at for both.
- **No framework, no runtime dependencies beyond what `package.json` has.** Views are plain DOM
  modules (`src/views/`), presentation is pure functions (`src/presentation/`) with vitest tests,
  and the backend is the `TatolabBackend` contract with a Tauri and a mock implementation
  (`src/backend/`). Extend those layers; never add a parallel one.
- **The mock backend is how hard states are shown, never how behaviour is decided.** The mock
  mirrors the Tauri backend's contract and the recorded local API responses; a mock-only behaviour
  the real backend lacks is a defect. Its presets (`?state=`, `?platform=`, and the screen keys in
  `mock_window_preset.ts`) exist so every screen can be pictured from a URL — add one when you add
  a screen.
- **Copy is plain and specific.** Name the thing and the action ("Run Tatolab", "Uninstall
  Tatolab…"); a runtime refusal is shown in its own words.
- Presentation logic is tested in `src/presentation/*.test.ts`; DOM behaviour that has a seam is
  tested with happy-dom; tests never sleep — drive time through injected clocks or fake timers.
