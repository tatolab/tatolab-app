# CLAUDE.md

Read the code for how things work. This file holds only what the code can't tell you.

- **Licence.** Tatolab.app is proprietary (`LICENSE`): never suggest an open-source licence for it,
  and never copy its code into `tatolab/streamlib` or any public repository. Every Rust, TypeScript
  and shell source file starts with the copyright and `LicenseRef-Tatolab-Proprietary` header the
  other files carry (`scripts/check-license-headers.sh`). Never change `LICENSE` without the
  owner's approval.
- **The app is a consumer of the runtime** (`tatolabd`, from `tatolab/streamlib`).
  - It reads the runtime only through its local API, and starts or stops it only through the
    platform's service manager. It never reads the runtime's state directory.
  - A capability the runtime lacks is filed in streamlib, and the app waits for it rather than
    working around it.
  - A runtime refusal is shown in its own words.
  - What the runtime serves is defined by streamlib's plan on `main`:
    `gh api repos/tatolab/streamlib/contents/docs/plan/ARCHITECTURE.md -q .content | base64 -d`.
- **Decisions.** What the app is and how it looks are the owner's call, recorded in the issue that
  builds it. Ask only for a real fork the issue leaves open. Otherwise proceed, and state the
  assumption in the PR.
- **The owner's machine.** Tests use the fakes in the tree, never a real runtime, `launchctl`,
  `systemctl` or administrator prompt. Act on the installed app or its runtime only when the owner
  asked, and put back what you changed.
- **Secrets** come from Infisical, never the tree: no signing certificate, key or token in a
  commit, log, PR or screenshot.
- **The app's version** is never hand-edited. A release builds the app at the streamlib version it
  bundles.
- **`com.tatolab.tatolab` never changes.** The launch agent, the settings folder and macOS's
  camera and microphone grants all hang off that bundle id. Loosening the window's sandbox or
  flipping an Electron fuse is the owner's decision.
