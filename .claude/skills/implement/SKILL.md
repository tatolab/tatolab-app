---
name: implement
description: Build one tatolab-app issue end-to-end — the only path by which the app's source changes.
disable-model-invocation: false
---

# Implement

1. **Load**: the issue — body plus every comment oldest→newest (a comment IS specification and is
   newer than the body; conflicts resolve toward the comment) — and, when it depends on what the
   runtime serves, that contract from streamlib's plan at `main` as `CLAUDE.md` gives (never a
   local checkout's branch).
   When it touches the window, read the design system it builds on (`packages/tato-app-view-sdk/src/kit/styles/tokens.css`,
   `packages/tato-app-view-sdk/src/kit/`).
2. **Ultracode gate**: an issue whose body opens with **Run with ultracode** is built only in a run
   that has ultracode on — a system-reminder confirms it when the owner's message carries the
   keyword (`/implement <N> ultracode`) or the session has it on. Without it, **stop** before any
   other step: one line saying the issue runs with ultracode and the exact command to re-run it.
   Build without it only when the owner says so in this run, in their own words. Under ultracode,
   every agent that edits files runs in its own worktree; the steps below hold.
3. **Plan gate**: list every open item this work needs: a decision, a question you would ask the
   owner, an assumption you would rather not make. Give each one its options, your pick and why.
   Resolve whatever the issue, its comments, the tree or the runtime's contract answers; that is
   discovery, not a question. A new module, interface or window IPC command the issue's Design section
   does not settle goes through `/module-design`, and its recommendation is written into the
   Design. Never infer a decision from existing code or git history. When items remain, spawn
   `owner-attention-grader` with the issue and the items. On **PAUSE**, post one
   `[NEEDS OWNER]` comment on the issue batching every OWNER item, each with its options and your
   recommendation, and **stop**. On **PROCEED**, carry each assumption the grader cleared into the PR's notes for the
   owner.
4. **Waits-on check**: every streamlib issue under "Waits on" is closed and released in the
   runtime the app is built against. One that is not → post a `[WAITS ON]` comment on the issue
   naming it, and stop; the app never works around a missing runtime capability.
5. **Staleness check**: verify the issue's load-bearing claims against the current tree; if
   drifted, correct the body via `gh issue edit`, rewritten to current intent.
6. **Announce** the refined plan as a comment on the issue: goal, files, the seams tests will
   exercise, the `/verify-app` evidence it will carry, scope, and the assumptions the grader
   cleared. Then continue; the owner reads it when they choose.
7. Branch `<type>/<N>-<slug>` off fresh `origin/main`.
8. **Build test-first at the seams the issue names** — the fake local API server, the injected
   platform seams, presentation functions, the mock backend. Commit at logical checkpoints with
   conventional-commit prefixes; every commit builds. A UI change adds a mock preset for any new
   screen or state.
9. Scope is the issue. Side findings go in the PR body as notes — a new issue only if the work
   does not land without it. An open item that surfaces mid-build goes to
   `owner-attention-grader` as in step 3; on **PAUSE**, push the branch, post the `[NEEDS OWNER]`
   comment naming it, and stop.
10. **Gates**: spawn `local-ci-runner`; fix what it reports.
11. **Prove it**: run `/verify-app` for anything a person sees or the machine feels; its evidence
    goes in the PR. Evidence that needs the owner present, such as a real administrator or privacy
    prompt, is listed in the PR as pending the owner, and the build goes on.
12. **Review**: spawn `review-pr`, plus `main-process-craftsmanship-reviewer` when `apps/tato-app/src/main/` or `apps/tato-app/src/preload/` changed and
    `window-craftsmanship-reviewer` when `apps/tato-app/src/renderer/` or `apps/tato-app/src/shared/` changed, in parallel. Fix-loop capped at 3 rounds;
    a 4th disagreement is posted on the issue as `[NEEDS OWNER]` DISCUSS, and the build stops.
13. **PR**: run `printf '%s' "<title>" | npx commitlint`, push, `gh pr create` — title
    `type(scope): summary`; body `## Summary`, `## Closes` (one `Closes #N` per line), `## Exit
    criteria`, `## Test plan`, `## Evidence` (the `/verify-app` images and what each shows,
    labelled Live / Linux / Mock), `## Notes for owner` (the batched findings).
14. Report: PR URL, tests run, evidence, notes awaiting the owner. Merge is always the owner's
    call.
