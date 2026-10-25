# CLAUDE.md

## Licensing (load-bearing — do not modify)

Tatolab.app is proprietary (`LICENSE`). Never suggest an open-source licence for it. Every new
Rust, TypeScript and shell source file carries, on its first two lines (after a `#!` line, if any):

    // Copyright (c) 2025 Jonathan Fontanez
    // SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

(`#` in place of `//` for shell). shadcn's generated components (`src/renderer/components/ui/`) keep their
MIT form and carry no Tatolab header. The runtime the app bundles is streamlib's, BUSL-1.1, and
keeps its own licence. Do not modify `LICENSE` without explicit approval.
`scripts/check-license-headers.sh` enforces the header in PR CI.

---

Tatolab.app is the desktop app for the Tatolab runtime (`tatolabd`). It is a **consumer** of the
runtime: it reads the runtime's local API and drives the platform's service manager, and it never
grows runtime behaviour of its own. ONE system per concern — extend the existing one, never build
a parallel one. Search first.

## The router — how work happens

- **Three kinds of decision, three homes.**
  1. What the app *is* — its features, its framework, how it is packaged and updated — is the
     owner's call, recorded in the tatolab-app issue that builds it. What it needs from the
     runtime — a capability, a local API contract — is streamlib's: filed there, and the app waits
     on it. This repository has no `docs/plan/`; never start one.
  2. How the window looks, reads and flows is `docs/design` (`DESIGN.md` and the prototype it
     describes) + `src/renderer/styles/tokens.css`, changed with the owner's say-so in the same PR.
  3. How the app's own code is shaped — modules, interfaces, platform items, the window's IPC
     commands, the backend contract — goes in the issue's Design section, settled by `/module-design` before
     `/implement`.

  A shape that would need tier 1 is tier 1.
- **When the work depends on what the runtime serves, read streamlib's plan from its `main`,
  never a local checkout's branch**:
  `gh api repos/tatolab/streamlib/contents/docs/plan/ARCHITECTURE.md -q .content | base64 -d`
  (the same for `GLOSSARY.md`), and read only the sections you need — the file is large.
- Source edits (`src/`, `native/`, `scripts/`, `packaging/`) belong inside `/implement`
  against a tatolab-app issue. Nothing prompts on one — the distinction is the session's to apply.
- Lifecycle here: `/file-issue` → `/implement` → `/verify-app` for anything a person sees or the
  machine feels. `/diagnose` for bugs, `/research` for questions, `/explore-idea` for what-ifs,
  `/module-design` before a new module, interface or command, `/hygiene` for rot,
  `/propose-rule` is the only way rules change. Shared understanding: `/architecture-question`
  (how does X work, with evidence), `/reconcile-understanding` (corrections that stick).
- **Guardrails prompt; they never wall off.** The `ask` entries in `.claude/settings.json` cover
  only what is expensive to undo — the licence, what code signing reads, `gh pr merge`, and a
  workflow dispatch (which can publish). The `machine-brake` hook is advisory: it notes a command
  that touches the owner's real runtime or publishes something, and prompts only where its config
  sets a rule or a glob to `ask` — the checked-in config asks on `publish`
  (`.claude/scripts/machine-brake` edits it). The doctrine still decides what is right — an
  approved prompt means the owner judged this one case the exception, not that the rule bent.
- Code is the authority on what IS; the issues and the spec on what we AGREED for the app, and
  streamlib's plan on what the runtime serves.

## Recording facts vs deciding

Writing down what is true is ordinary work. Deciding what we build is not. The skills exist to
sharpen decisions, not to license prose.

- **A factual record needs no skill, no prompt, and no approval.** A README claim your change
  falsified, a stale path, a proof caption that no longer matches the app — fix it in the same PR
  as the change, and say so in the PR body. Leaving the record wrong to avoid ceremony is the
  worse outcome, always.
- **A decision goes to the owner** — changing what the app is, or settling a question the issue or
  the spec leaves open by building one answer. Tier 1 is the owner's call, recorded in the issue,
  and a runtime need is filed in streamlib; tier 2 is a stated question; tier 3 is the issue's
  Design section.
- The test: **could a careful reader derive it from the diff and the tree?** Then it is a fact.
  Does it commit us to something we have not agreed? Then it is a decision — bring it.
- Doc hygiene inside work you are already doing — fixing a claim your own change falsified — is
  never a separate issue and never a question.

## Asking the owner

An approved design is standing authority. Implementing it, recording it, and cleaning up after it
need no further confirmation. Re-asking is not diligence; it spends the owner's attention, and
attention spent on settled things is unavailable for real forks.

- **Ask only for a live fork the issue does not settle** — two defensible paths, materially
  different outcomes, where guessing wrong wastes real work.
- **Never ask** to re-confirm something already agreed, to re-approve a scope already signed off,
  to check that work is going well, or in place of reading the tree. If the answer is
  discoverable, discover it.
- **Prefer a stated assumption to a blocking question.** Do the work, say plainly what you
  assumed and where it would bite, and let the owner correct it. Reserve blocking for cases where
  proceeding either way is unsafe or would waste the work.
- **Batch** what genuinely must be asked into one round — never a drip of one-question stops.
- A finding is not a question. Non-blocking findings go in the PR description, then move on.

## The app consumes the runtime (Docker Desktop model)

- **The local API is the only door.** The app reads streams, graphs, logs and health only from
  the runtime's local API, and starts or stops the runtime only through the platform's service
  manager. It never reads the runtime's state directory or other sockets. The only machine state
  it touches is what it owns: on macOS the machine runtime lock and the `/usr/local/bin/tatolab`
  link, created and removed behind one administrator prompt, and its own settings.
- **The contract is streamlib's.** Recorded responses under `src/main/test-fixtures/` pin it;
  refresh one by recording it from a real runtime — never hand-edit one to make a test pass. A
  change to what the app reads also runs the skipped live contract test against a running runtime
  (`TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`).
- **A missing runtime capability is filed in streamlib and the app waits on it.** Never work
  around it in the app (no scraping logs for state the API does not give, no second channel). An
  app issue that needs one names the streamlib issue under "Waits on".
- **A runtime refusal is shown in its own words**, never rewritten or swallowed.
- The app holds no copy of a secret the runtime takes — not on disk, not in memory past the
  request.

## Non-negotiables

- **Platform code lives in `src/main/platform/`** (enforced); both platforms are checked
  on every change, and the `ubuntu-22.04` PR check is the Linux gate — a Mac cannot exercise the
  Linux module against a real systemd or desktop.
- A decision the issue or the spec doesn't state stops the work and goes to the owner;
  it is never inferred from existing code or git history.
- The main process logs only through `tatolab_app_log.ts`; no `console.*` or `debugger` in
  shipped code, the window included (enforced).
- Shipped main-process code has no `throw` and no non-null `!`: a failure is a typed `Result`
  returned and propagated by the caller. Only `electron_adapters/` and `preload/` import
  `electron`; nothing blocks on a `*Sync(` call (enforced). No back-compat shims — rename cleanly.
- No no-op methods, no `any` / `as` casts (but `as const`) / `@ts-ignore` to make it compile,
  never reshape code to satisfy a test. Unrelated issues surfaced by tsc or tests are reported,
  not fixed in passing.
- Time is monotonic (`performance.now()`); wall-clock only for display.
- Names pass the zero-context test: `TatolabStatusPublisher`, `stream_log_readings`, never
  `Publisher`, `follower`, `state`, `ctx`. Explicit beats short.
- **Tests run on the seams the tree already has** — the fake local API server, injected clocks
  and injected prompts — never a real runtime, a real administrator prompt, or a real `launchctl`
  or `systemctl`.
- Tests are always in scope and never need approval. Code drives tests, never the reverse.
- **Secrets come from Infisical, never the tree.** `.infisical.json` stays untracked; signing
  certificates, API keys and tokens never appear in a commit, a log, a PR body or a proof image.
- **The version is never hand-edited**: a release builds the app at the streamlib version it
  bundles.
- **Done means seen.** A change to the window, the tray, setup, uninstall or the runtime switch is
  done when `/verify-app` has shown it at the lowest rung that proves the claim — Mock for pure
  presentation, Live (local proof) for anything that talks to a runtime — labelled; never when
  its tests pass.
