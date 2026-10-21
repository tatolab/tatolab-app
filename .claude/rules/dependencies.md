---
paths:
  - "package.json"
  - "package-lock.json"
  - "scripts/package_tatolab_electron_app.mjs"
  - "scripts/build-tatolab-linux-app.sh"
---

# Dependencies

- A new npm package is named in the PR with its licence and why nothing in the tree already
  covers it. The lockfile changes in the same commit; CI installs with `npm ci`.
- No blanket `npm update` inside feature work.
- `dependencies` is what ships in the app's asar — the package script stages exactly the
  `npm ls --omit=dev` closure. Everything else, the window's build included, is a
  `devDependency`; a package that moves into `dependencies` names its whole shipped closure and
  their licences in the PR.
- `electron` and the `@electron/*` packaging tools are pinned in the lockfile and move together
  in their own PR, with the packaged app checked on both platforms.
- The window takes no runtime npm dependency: Vite bundles what it needs (the font) into `dist/`.
- A Linux system library the app links joins the `.deb` dependency check in
  `scripts/build-tatolab-linux-app.sh` and stays within what `ubuntu-22.04` ships.
