# CLAUDE.md

## Licensing (load-bearing — do not modify)

Tatolab.app is dual-licensed (`LICENSE`): AGPL-3.0-only, or a commercial licence from the
copyright holder. `LICENSE` covers every file in the repository, so a source file carries no
licence header of its own. Never suggest another licence for it or drop the commercial option.
shadcn's generated components (`packages/tato-app-view-sdk/src/design_system/ui/`) keep their MIT form.
The runtime the app bundles is streamlib's, BUSL-1.1, and keeps its own licence. Do not modify
`LICENSE` without explicit approval.

---

Tatolab.app is the desktop app for the Tatolab runtime (`tatolabd`). It is a **consumer** of the
runtime: it reads the runtime's local API and runs the runtime it carries as its own child
process, the way an editor runs a language server, and it never grows runtime behaviour of its own. ONE system per concern — extend the existing one, never build
a parallel one. Search first.

## The router — how work happens

- **Work is tracked in Linear**: team Tatolab, issues `TAT-n`, this repository's titled
  `studio:`. Never write a GitHub issue; GitHub Issues is only for outside reports.
- **Three kinds of decision, three homes.**
  1. What the app *is* — its features, its framework, how it is packaged and updated — is the
     owner's call, recorded in the Linear issue or project that builds it. What it needs from the
     runtime — a capability, a local API contract — is streamlib's: a `streamlib:` sub-issue under
     the same parent, which the `studio:` issue is blocked by. This repository has no
     `docs/plan/`; never start one.
  2. How the window looks, reads and flows is the design system in code — `packages/tato-app-view-sdk/src/design_system/styles/tokens.css`,
     then shadcn, then `packages/tato-app-view-sdk/src/design_system/` and its variants, then a rare call-site class —
     changed with the owner's say-so in the same PR.
  3. How the app's own code is shaped — modules, interfaces, platform items, the window's IPC
     commands, the backend contract — goes in the issue's Design section, settled by `/module-design` before `/implement`.

  A shape that would need tier 1 is tier 1.
- **When the work depends on what the runtime serves, read streamlib's plan from its `main`**,
  never a local checkout's branch, and only the sections you need (the same for `GLOSSARY.md`):
  `gh api repos/tatolab/streamlib/contents/docs/plan/ARCHITECTURE.md -q .content | base64 -d`
- Skills, agents, the repository rules and hooks come from `dev-plugin` in
  [tatolab/tato-plugins-official](https://github.com/tatolab/tato-plugins-official), which
  `.claude/settings.json` enables; change them there, never in this repository.
- Lifecycle: `/file-issue` → `/implement` → `/verify-app`; source edits
  (`apps/tato-app/{src,native,scripts,packaging}/`) belong inside `/implement` against a TAT issue.
  `/whats-next` orients, `/plan-project` plans a goal, `/triage` works outside reports.
- **Guardrails prompt; they never wall off**, but for writing a GitHub issue, which is denied.
  `.claude/settings.json` asks on the licence and what code signing reads; dev-plugin's
  `machine-brake` hook notes a command that touches the owner's real runtime and asks before one that publishes.
- Code is the authority on what IS; Linear on what we AGREED for the app, and streamlib's
  plan on what the runtime serves.

## Before you push

- **Gates**: spawn `dev-plugin:studio-local-ci-runner` (`npm run lint`, `npm run build`, `npm test`); fix
  what it reports.
  Then `/verify-app` for anything a person sees or the machine feels.
- **Review**, in parallel: `dev-plugin:studio-review-pr` always; `dev-plugin:main-process-craftsmanship-reviewer` when `apps/tato-app/src/{main,preload}/`
  changed; `dev-plugin:window-craftsmanship-reviewer` when `apps/tato-app/src/{renderer,shared}/` changed.
- **The PR**: title `type(scope): summary`, checked with `printf '%s' "<title>" | npx commitlint`;
  its body carries `/verify-app`'s `## Evidence` section.

## Recording facts vs deciding

Writing down what is true is ordinary work. Deciding what we build is not. The skills exist to
sharpen decisions, not to license prose.

- **A factual record needs no skill, no prompt, and no approval.** A README claim your change
  falsified, a stale path, a comment that no longer matches the code — fix it in the same PR
  as the change, and say so in the PR body. Leaving the record wrong to avoid ceremony is the
  worse outcome, always.
- **A decision goes to the owner** — changing what the app is, or settling a question the issue
  leaves open by building one answer.
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
  the runtime's local API, and starts the runtime it carries as its child and stops it as the app
  quits; a runtime it did not start, it leaves alone. It never reads the runtime's state directory
  or other sockets, and never asks for an administrator's password. The only machine state it
  touches is what it owns: the `~/.local/bin/tatolab` link (an AppImage's through a copy of its CLI
  in `~/.local/share/tato-studio/bin/`) and its own settings.
- **The contract is streamlib's.** Recorded responses under `apps/tato-app/src/main/test-fixtures/` pin it;
  refresh one by recording it from a real runtime — never hand-edit one to make a test pass. A
  change to what the app reads also runs the skipped live contract test against a running runtime
  (in `apps/tato-app/`, `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=<socket> npx vitest run src/main/local_api_client.test.ts`).
- **A missing runtime capability is a `streamlib:` Linear issue the app's issue is blocked by.**
  Never work around it in the app: no scraping logs for state the API lacks, no second channel.
- **A runtime refusal is shown in its own words**, never rewritten or swallowed.
- The app holds no copy of a secret the runtime takes — not on disk, not in memory past the
  request.

## Non-negotiables

- **Every view runs with full access on Studio's origin and gets `VideoFrame`s with no copy.** Studio
  drives live projection, so frame performance is load-bearing. There is no sandbox mode and no
  `ImageBitmap` or other copy on a frame's path; a view's `capabilities` declare what it uses and
  never take full access away. The owner settled this; never add isolation, never convert frames,
  never ask again:
  @docs/views-run-with-full-access.md
- **Platform code lives in `apps/tato-app/src/main/platform/`** (enforced); both platforms are checked
  on every change: `npm test` runs both platform modules on any OS, and Linux is proven on an
  x86_64 Linux machine or, from a Mac, in an `ubuntu:22.04` container — a Mac cannot exercise the
  Linux module against a real systemd or desktop.
- A decision the issue doesn't state stops the work and goes to the owner;
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
- macOS 26.0 is the minimum for every macOS artefact — `LSMinimumSystemVersion`, the Homebrew
  cask's `depends_on macos:`, and every doc that names a floor. Never 15.0 or anything lower.
- Names pass the zero-context test: `TatolabStatusPublisher`, `stream_log_readings`, never
  `Publisher`, `follower`, `state`, `ctx`. Explicit beats short.
- **Tests run on the seams the tree already has** — the fake local API server, injected clocks
  and the injected child-process start — never a real runtime.
- Tests are always in scope and never need approval. Code drives tests, never the reverse.
- **One signing identity, one way.** Every Tatolab.app bundle, a release and a local proof build
  alike, is signed by the one signing path with the Developer ID from Infisical. A build that
  cannot sign that way fails. Ad-hoc signing never appears in the app, its scripts or its
  workflows: no other identity, no fallback, no flag that signs differently. Any platform's code
  signing, now or later, follows the same rule. Notarization is a release step only; it does not
  change the signature.
- **Secrets come from Infisical, never the tree.** `.infisical.json` stays untracked; signing
  certificates, API keys and tokens never appear in a commit, a log, a PR body or an evidence image.
- **The version is never hand-edited**: a release takes the streamlib version it bundles, or, when
  the app releases again over the same runtime, the last app version's next patch
  (`apps/tato-app/scripts/plan_tatolab_app_release.mjs`).
- **Done means seen.** A change to the window, the tray, or how the app runs the runtime is
  done when `/verify-app` has shown it at the lowest rung that proves the claim — Mock for pure
  presentation, Live (local proof) for anything that talks to a runtime — labelled; never when
  its tests pass.
