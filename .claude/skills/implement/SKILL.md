---
name: implement
description: Build one tatolab-app issue end-to-end — the only path by which the app's source changes.
disable-model-invocation: true
---

# Implement

1. **Load**: the issue — body plus every comment oldest→newest (a comment IS specification and is
   newer than the body; conflicts resolve toward the comment) — and the streamlib plan sections it
   cites, read from streamlib's `main` as `CLAUDE.md` gives (never a local checkout's branch).
   Read `proof/design-final/FINAL-SPEC.md` when the issue touches the window.
2. **Ultracode gate**: an issue whose body opens with **Run with ultracode** is built only in a run
   that has ultracode on — a system-reminder confirms it when the owner's message carries the
   keyword (`/implement <N> ultracode`) or the session has it on. Without it, **stop** before any
   other step: one line saying the issue runs with ultracode and the exact command to re-run it.
   Build without it only when the owner says so in this run, in their own words. Under ultracode,
   every agent that edits files runs in its own worktree; the steps below hold.
3. **Plan gate**: list the decisions this work needs. Any that touch what the app *is* — a new
   runtime contract, a capability the streamlib plan does not state — and are not DECIDED there →
   post a `[NEEDS DECISION]` comment on the issue with the options and your recommendation, and
   **stop**; the decision is made in a streamlib session. A design departure from the calm-native
   spec is the owner's call — ask it as one batched question. A new module, trait or Tauri command
   the issue's Design section does not settle goes through `/module-design` first. Never infer a
   decision from existing code.
4. **Waits-on check**: every streamlib issue under "Waits on" is closed and released in the
   runtime the app is built against. One that is not → stop and say which; the app never works
   around a missing runtime capability.
5. **Staleness check**: verify the issue's load-bearing claims against the current tree; if
   drifted, correct the body via `gh issue edit`, rewritten to current intent.
6. **Announce** the refined plan — goal, files, the seams tests will exercise, the `/verify-app`
   evidence it will carry, and scope — and **wait for the owner's confirmation**. Hard stop.
7. On yes: branch `<type>/<N>-<slug>` off fresh `origin/main`.
8. **Build test-first at the seams the issue names** — the fake local API server, the injected
   platform seams, presentation functions, the mock backend. Commit at logical checkpoints with
   conventional-commit prefixes; every commit builds. A UI change adds a mock preset for any new
   screen or state.
9. Scope is the issue. Side findings go in the PR body as notes — a new issue only if the work
   does not land without it.
10. **Gates**: spawn `local-ci-runner`; fix what it reports.
11. **Prove it**: run `/verify-app` for anything a person sees or the machine feels; its evidence
    goes in the PR.
12. **Review**: spawn `review-pr`, plus `rust-craftsmanship-reviewer` when `src-tauri/` changed and
    `window-craftsmanship-reviewer` when `src/` changed, in parallel. Fix-loop capped at 3 rounds;
    a 4th disagreement escalates to the owner as DISCUSS.
13. **PR**: run `scripts/check-conventional-pr-title.sh "<title>"`, push, `gh pr create` — title
    `type(scope): summary`; body `## Summary`, `## Closes` (one `Closes #N` per line), `## Exit
    criteria`, `## Test plan`, `## Evidence` (the `/verify-app` images and what each shows,
    labelled Live / Linux / Mock), `## Notes for owner` (the batched findings).
14. Report: PR URL, tests run, evidence, notes awaiting the owner. Merge is always the owner's
    call.
