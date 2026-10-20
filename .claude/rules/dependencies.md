---
paths:
  - "package.json"
  - "package-lock.json"
  - "src-tauri/Cargo.toml"
  - "src-tauri/Cargo.lock"
  - "scripts/build-tatolab-linux-app.sh"
---

# Dependencies

- A new crate or npm package is named in the PR with its licence and why nothing in the tree
  already covers it. The lockfile changes in the same commit; CI builds `--locked` and `npm ci`.
- No blanket `cargo update` / `npm update` inside feature work.
- The `tauri` crates and the `@tauri-apps/*` packages move together and stay on one minor version.
- The window takes no runtime npm dependency beyond `@tauri-apps/api` and the bundled font.
- A Linux system library the app links joins the `.deb` dependency check in
  `scripts/build-tatolab-linux-app.sh` and stays within what `ubuntu-22.04` ships.
