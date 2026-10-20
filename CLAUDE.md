# CLAUDE.md

## Licensing (load-bearing — do not modify)

Tatolab.app is proprietary (`LICENSE`). Never suggest an open-source licence for it. Every new
Rust, TypeScript and shell source file carries, on its first two lines (after a `#!` line, if any):

    // Copyright (c) 2025 Jonathan Fontanez
    // SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

(`#` in place of `//` for shell). The runtime the app bundles is streamlib's, BUSL-1.1, and keeps
its own licence. Do not modify `LICENSE` without explicit approval.
`scripts/check-license-headers.sh` enforces the header in PR CI.

---

Tatolab.app is the desktop app for the Tatolab runtime (`tatolabd`), on macOS and Linux: a
Tauri 2 app, a Rust backend in `src-tauri/` and a dependency-free TypeScript window in `src/`.
It is a **consumer** of the runtime: it reads the runtime's local API and drives the platform's
service manager, and it never grows runtime behaviour of its own.

## The router — how work happens

- **The plan lives in streamlib.** The app's architecture is a DECIDED entry in
  `tatolab/streamlib`'s `docs/plan/ARCHITECTURE.md` (§Distribution & versioning, the
  `Tatolab.app` entry), beside the local API it reads (§Control plane & observability). Decisions
  about what the app *is* — a new capability, a new runtime contract, a change to that entry —
  go through streamlib's `/align` / `/propose-change` / `/derive-tickets`, run in a streamlib
  session. This repository has no `docs/plan/`; never start one.
- **App-local design decisions** — the window's look, layout and copy — live in
  `proof/design-final/FINAL-SPEC.md` and `src/styles/tokens.css`. They change with the owner's
  say-so, recorded in the same PR.
- Source edits (`src/`, `src-tauri/`, `scripts/`, `packaging/`) belong inside `/implement`
  against a tatolab-app issue. Lifecycle here: `/file-issue` → `/implement` → `/verify-app` for
  anything a person sees or the machine feels. `/diagnose` for bugs, `/research` for questions,
  `/explore-idea` for what-ifs, `/module-design` before a new module or trait, `/hygiene` for rot,
  `/propose-rule` is the only way rules change.
- **Guardrails prompt; they never wall off.** Path guards (`.claude/settings.json` `ask`
  entries) cover only what is expensive to undo — the licence files and what signing and
  notarization read. The `machine-brake` hook is advisory: it notes a command that touches the
  owner's real runtime or publishes something, and prompts only where the owner set a rule or a
  glob to `ask` (`.claude/scripts/machine-brake` edits its config).
- Code is the authority on what IS; the streamlib plan on what we AGREED.

## Recording facts vs deciding

Writing down what is true is ordinary work. Deciding what we build is not.

- **A factual record needs no skill, no prompt, and no approval.** A README claim your change
  falsified, a stale path, a proof caption that no longer matches the app — fix it in the same PR
  as the change, and say so in the PR body. Leaving the record wrong to avoid ceremony is the
  worse outcome, always.
- **A decision goes to the owner** — through streamlib's lifecycle when it touches what the app
  is, or as a stated question when it is app-local (a design change to the calm-native spec).
- The test: **could a careful reader derive it from the diff and the tree?** Then it is a fact.
  Does it commit us to something we have not agreed? Then it is a decision — bring it.

## Asking the owner

An approved design is standing authority. Implementing it, recording it, and cleaning up after it
need no further confirmation. Re-asking is not diligence; it spends the owner's attention.

- **Ask only for a live fork the plan does not settle** — two defensible paths, materially
  different outcomes, where guessing wrong wastes real work.
- **Never ask** to re-confirm something already agreed, to check that work is going well, or in
  place of reading the tree. If the answer is discoverable, discover it.
- **Prefer a stated assumption to a blocking question.** Do the work, say plainly what you
  assumed and where it would bite, and let the owner correct it.
- **Batch** what genuinely must be asked into one round — never a drip of one-question stops.
- A finding is not a question. Non-blocking findings go in the PR description, then move on.
- For a multi-option design call, give a plain-language brief with one firm recommendation, not a
  menu.

## The app consumes the runtime (Docker Desktop model)

- **The local API is the only door.** The window reads `list_streams` and `logs` over MCP and
  `GET /api/graph`; the platform layer drives `SMAppService` / `launchctl` or `systemctl --user`.
  Never read the runtime's state directory, sockets other than the local API, or its files.
- **The contract is streamlib's.** What a local API call returns is stated in streamlib's plan and
  pinned here by the recorded responses in `src-tauri/test-fixtures/` and `proof/platform-mock/`.
  Refresh a fixture by recording it from a real runtime — never hand-edit one to make a test pass.
- **A missing runtime capability is filed in streamlib and the app waits on it.** Never work
  around it in the app (no scraping logs for state the API does not give, no second channel). An
  app issue that needs one names the streamlib issue under "Waits on".
- **A runtime refusal is shown in its own words**, never rewritten or swallowed.
- The app holds no copy of a secret the runtime takes — not on disk, not in memory past the
  request.

## Non-negotiables

- **Platform code lives in `src-tauri/src/platform/`**, behind the traits the rest of the app
  uses. Both platform modules expose the same items, so the rest of the app has no `cfg`.
  `scripts/check-platform-cfg-confinement.sh` enforces it. The Linux module keeps building on a
  Mac, so `cargo test` there runs its tests.
- **Both platforms, every change.** A change to shared code is checked on macOS and Linux;
  Linux CI (clippy and tests on `ubuntu-22.04`) is the gate for Linux — a Mac cannot lint the
  Linux `cfg` arms. Never merge on a pending or red check.
- Logging is `tracing` only in Rust — no `println!` / `eprintln!` / `dbg!` (enforced). The window
  logs nothing to the console in shipped code.
- No `todo!()` / `unimplemented!()` / `.unwrap()` / `.expect()` in non-test Rust; errors are typed
  and propagated with `?`. No back-compat shims — rename cleanly.
- Names pass the zero-context test: `TatolabStatusPublisher`, `stream_log_follower`, never
  `Publisher`, `follower`, `state`, `ctx`. Explicit beats short.
- **Tests are hermetic.** PR tests use the fake local API server, injected clocks and injected
  prompts — never a real runtime, a real administrator prompt, a real `launchctl` or `systemctl`,
  a sleep, or a latency assertion. A live run is evidence for `/verify-app`, never a PR gate.
- Tests are always in scope and never need approval. Code drives tests, never the reverse.
- **Secrets come from Infisical, never the tree.** `.infisical.json` stays untracked; signing
  certificates, API keys and tokens never appear in a commit, a log, a PR body or a proof image.
- **The version is never hand-edited.** A release builds the app at the streamlib version it
  bundles (`--app-version`); `package.json` / `Cargo.toml` / `tauri.conf.json` versions are not
  bumped by hand.
- **Done means seen.** A change to the window, the tray, setup, uninstall or the runtime switch is
  done when `/verify-app` has shown it working — live where it can be, labelled Mock where it
  cannot — not when its tests pass.
- Build into the one shared `src-tauri/target/` — never give a session, agent or worktree its own
  `CARGO_TARGET_DIR`. Remove temporary builds, worktrees and logs when the task ends.
- Stale or contradictory notes get deleted, not annotated — they poison the next session. Name
  each file before removing it.
