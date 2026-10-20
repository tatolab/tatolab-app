---
paths:
  - "src-tauri/tauri.conf.json"
  - "src-tauri/capabilities/**"
  - "src-tauri/src/tatolab_commands.rs"
  - "src-tauri/src/main.rs"
  - "src/backend/**"
---

# The Tauri boundary

- **Every command in `generate_handler!` can be called by any script the webview runs**, with no
  capability check (`capabilities/default.json` grants the app's own commands freely) — including
  `uninstall_tatolab`. Keep the list to what `TatolabBackend` uses; a new command is named in the
  issue's Design section.
- **The CSP in `tauri.conf.json` stays local**: `default-src 'self'`, and `connect-src` only
  `'self' ipc: http://ipc.localhost`. The window reaches the local API only through Rust and loads
  nothing remote. Widening the CSP or a capability is a decision; state the reason in the PR.
- **`identifier` (`com.tatolab.tatolab`) never changes** — the launch agent's
  `AssociatedBundleIdentifiers`, the settings directory and TCC attribution all hang off it.
- **A command lands whole**: `#[tauri::command(rename_all = "snake_case")]`, returning
  `Result<T, String>` whose `Err` is the refusal the window shows word for word; blocking work off
  the main thread; with its `TatolabBackend` method, the Tauri and mock implementations, and a
  serialization test in `tatolab_commands.rs` that pins the payload the TypeScript contract reads.
